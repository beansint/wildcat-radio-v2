"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  listPolls,
  react,
  submitQueueItem,
  votePoll,
  useListPolls,
} from "@/lib/api/endpoints/engagement/engagement";
import { requestEngagementSnapshot } from "./snapshot-requests";
import { getApiErrorMessage } from "@/lib/api/error-message";
import type { Socket } from "socket.io-client";
import type {
  CreateReactionDtoEmoji,
  PollResponseDto,
  QueueSubmissionResponseDto,
  SubmitQueueItemDto,
} from "@/lib/api/model";
import { acquireSocket, type SocketLease } from "./socket";
import { joinPresenceWithSnapshot } from "./presence-recovery";
import { activePin, SnapshotRecovery } from "./snapshot-recovery";
import { SEND_TIMEOUT, SOCKET_UNAVAILABLE } from "./engagement-error";
import {
  emptyEngagementState,
  mergeEngagementSnapshot,
  receiptMatchesEpisode,
  type HypeState,
  type LiveChatMessage,
  type PinnedTopic,
  type QueueReceipt,
} from "./engagement-state";

export type { HypeState, LiveChatMessage, PinnedTopic, QueueReceipt, UpNextItem } from "./engagement-state";

interface ChatEvent {
  id: string;
  content: string;
  asBooth?: boolean;
  createdAt?: string;
  author?: { id?: string; handle?: string | null; name?: string | null } | null;
}

function formatTime(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function toChatMessage(event: ChatEvent): LiveChatMessage {
  const author = event.author?.handle ?? event.author?.name ?? "@listener";
  return {
    id: event.id,
    authorId: event.author?.id ?? null,
    authorHandle: event.author?.handle ?? null,
    // TODO: the listener manifest doesn't yet expose the live show name.
    // Fall back to a neutral booth label until it does.
    name: event.asBooth ? "🎙 Booth" : author,
    body: event.content,
    time: formatTime(event.createdAt),
    variant: event.asBooth ? "booth" : undefined,
  };
}

function mergePoll(polls: PollResponseDto[], next: PollResponseDto) {
  const index = polls.findIndex((poll) => poll.id === next.id);
  if (index === -1) return [next, ...polls];
  return polls.map((poll) => (poll.id === next.id ? next : poll));
}

export function useEngagementRoom(
  episodeId: string | null,
  pushToast?: (message: string) => void,
  authSessionKey?: string | null,
) {
  const queryClient = useQueryClient();
  const actionScope = useMemo(() => ({episodeId, owner: authSessionKey ?? null}), [episodeId, authSessionKey]);
  const activeScope = useRef<typeof actionScope | null>(actionScope);
  useLayoutEffect(() => {
    activeScope.current = actionScope;
    return () => { activeScope.current = null; };
  }, [actionScope]);
  const [storedState, setStoredState] = useState(() => emptyEngagementState(episodeId));
  const state = useMemo(
    () =>
      storedState.episodeId === episodeId
        ? storedState
        : emptyEngagementState(episodeId),
    [episodeId, storedState],
  );
  const updateState = useCallback(
    (update: (current: typeof state) => typeof state) => {
      if (activeScope.current !== actionScope) return;
      setStoredState((previous) =>
        update(
          previous.episodeId === episodeId
            ? previous
            : emptyEngagementState(episodeId),
        ),
      );
    },
    [episodeId, actionScope],
  );
  const { messages, livePolls, selectedOptions, receipts, upNext, pinnedTopic, hype } = state;

  // Holds the `connect` handler currently attached to the socket, so the
  // effect cleanup (which fires before the async acquireSocket().then() might
  // have resolved) can detach the *right* handler instance.
  const joinEpisodeRef = useRef<(() => void) | null>(null);
  const recoveryRef = useRef(new SnapshotRecovery());
  const socketConnectedRef = useRef(false);
  const markLiveEvent = useCallback((event: { id?: string; removed?: boolean; scalar?: 'pin' | 'hype' }) => {
    recoveryRef.current.mark(event);
  }, []);

  const pollsQuery = useListPolls(episodeId ?? "", {
    query: {
      // Anonymous listeners get the public snapshot. The list endpoint is
      // intentionally session-protected because voting is authenticated.
      enabled: Boolean(episodeId) && Boolean(authSessionKey),
      refetchOnWindowFocus: false,
    },
  });
  const refetchSnapshot = useCallback(async () => {
    if (!episodeId) return;
    const recovery = recoveryRef.current;
    const token = recovery.begin();
    try {
      const snapshot = await requestEngagementSnapshot(episodeId);
      const options = recovery.finish(token);
      if (options) updateState(current => {
        const recovered = mergeEngagementSnapshot(current, snapshot, options);
        return socketConnectedRef.current ? recovered : {...recovered, hype: {...recovered.hype, stale: true}};
      });
    } catch { recovery.finish(token); }
  }, [episodeId, updateState]);
  useEffect(() => {
    const recovery = recoveryRef.current;
    void refetchSnapshot();
    const expire = () => updateState(current => ({
      ...current,
      pinnedTopic: activePin(current.pinnedTopic),
      hype: current.hype.capturedAt && Date.now() - Date.parse(current.hype.capturedAt) > 15_000
        ? {...current.hype, stale: true} : current.hype,
    }));
    const resume = () => { expire(); if (!document.hidden) void refetchSnapshot(); };
    const timer = window.setInterval(expire, 1_000);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
      recovery.cancel();
    };
  }, [refetchSnapshot, updateState]);

  const polls = livePolls;

  useEffect(() => {
    if (!episodeId) return;
    let cancelled = false;
    let socket: Socket | null = null;
    let lease: SocketLease<Socket> | null = null;
    let joinVersion = 0;
    let cancelJoin: (() => void) | undefined;

    function onChatNew(event: ChatEvent) {
      markLiveEvent({ id: event.id });
      updateState((current) => {
        if (current.messages.some((message) => message.id === event.id)) return current;
        return { ...current, messages: [...current.messages, toChatMessage(event)] };
      });
    }

    function onChatHidden(event: { id: string }) {
      markLiveEvent({ id: event.id, removed: true });
      updateState((current) => ({
        ...current,
        messages: current.messages.filter((message) => message.id !== event.id),
      }));
    }

    function onQueueReceipt(event: QueueReceipt) {
      if (!receiptMatchesEpisode(event, episodeId)) return;
      updateState((current) => ({ ...current, receipts: [event, ...current.receipts] }));
      void queryClient.invalidateQueries({ queryKey: ["my-submissions", episodeId] });
      if (event.status === "QUEUED") {
        pushToast?.("Your request is up next.");
      } else if (event.status === "READ") {
        pushToast?.("The booth read your message.");
      }
    }

    function onQueueUpNext() {
      // Acceptance order is not submission order, and an event cannot refill
      // the fifth slot after a removal. Recover the complete public list.
      void refetchSnapshot();
    }
    function onQueueChanged(event: { episodeId: string }) {
      if (event.episodeId === episodeId) void refetchSnapshot();
    }

    function onPollUpdated(event: PollResponseDto) {
      markLiveEvent({ id: event.id });
      updateState((current) => ({
        ...current,
        livePolls: mergePoll(current.livePolls, event),
      }));
      queryClient.setQueryData(["/api/episodes/" + episodeId + "/polls"], (current: unknown) => {
        return Array.isArray(current) ? mergePoll(current as PollResponseDto[], event) : [event];
      });
    }

    function onHypeTick(event: HypeState) {
      if (event.episodeId && event.episodeId !== episodeId) return;
      markLiveEvent({ scalar: "hype" });
      updateState((current) => ({ ...current, hype: { ...event, stale: false } }));
    }

    function onTopicPinned(event: PinnedTopic | null) {
      markLiveEvent({ scalar: "pin" });
      updateState((current) => ({ ...current, pinnedTopic: activePin(event) }));
    }

    function onDisconnect() {
      joinVersion += 1;
      cancelJoin?.();
      socketConnectedRef.current = false;
      recoveryRef.current.cancel();
      updateState(current => ({...current, hype: {...current.hype, stale: true}}));
    }
    acquireSocket()
      .then((nextLease) => {
        if (cancelled) {
          nextLease.release();
          return;
        }
        lease = nextLease;
        socket = nextLease.socket;
        const s = nextLease.socket;

        s.on("disconnect", onDisconnect);
        s.on("chat:new", onChatNew);
        s.on("chat:hidden", onChatHidden);
        s.on("queue:receipt", onQueueReceipt);
        s.on("queue:up-next", onQueueUpNext);
        s.on("queue:changed", onQueueChanged);
        s.on("poll:updated", onPollUpdated);
        s.on("hype:tick", onHypeTick);
        s.on("topic:pinned", onTopicPinned);

        const joinEpisode = () => {
          const version = ++joinVersion;
          // Subscribe before reading history, so a commit between the initial
          // snapshot and room admission is included in this recovery read.
          cancelJoin?.();
          cancelJoin = joinPresenceWithSnapshot(s, {episodeId},
            () => !cancelled && version === joinVersion && s.connected,
            () => { socketConnectedRef.current = true; void refetchSnapshot(); }, "episode:join");
        };
        // Persistent (not `once`) so episode room membership is restored after
        // ANY reconnect — including one triggered by the auth-session cycling
        // below — not just the very first connection.
        s.on("connect", joinEpisode);
        joinEpisodeRef.current = joinEpisode;

        // The persistent provider refreshes the shared cookie handshake on
        // identity changes, even when this whole page was remounted.
        if (s.connected) joinEpisode();
        else s.connect();
      })
      .catch(() => {
        // The HTTP query surfaces unavailable engagement state. Avoid an
        // unhandled rejection if the lazy Socket.IO import/connect fails.
      });

    return () => {
      cancelled = true;
      cancelJoin?.();
      if (socket) {
        socket.emit("episode:leave", { episodeId });
        if (joinEpisodeRef.current) socket.off("connect", joinEpisodeRef.current);
        socket.off("disconnect", onDisconnect);
        socket.off("chat:new", onChatNew);
        socket.off("chat:hidden", onChatHidden);
        socket.off("queue:receipt", onQueueReceipt);
        socket.off("queue:up-next", onQueueUpNext);
        socket.off("queue:changed", onQueueChanged);
        socket.off("poll:updated", onPollUpdated);
        socket.off("hype:tick", onHypeTick);
        socket.off("topic:pinned", onTopicPinned);
      }
      joinEpisodeRef.current = null;
      socketConnectedRef.current = false;
      lease?.release();
    };
  }, [authSessionKey, episodeId, markLiveEvent, pushToast, queryClient, refetchSnapshot, updateState]);

  const submitQueueMutation = useMutation({
    onMutate: () => actionScope,
    mutationFn: async ({
      targetEpisodeId,
      payload,
    }: {
      targetEpisodeId: string;
      payload: SubmitQueueItemDto;
    }) => {
      const result = await submitQueueItem(targetEpisodeId, payload);
      return { targetEpisodeId, result };
    },
    onSuccess: ({ targetEpisodeId, result }: { targetEpisodeId: string; result: QueueSubmissionResponseDto }, _variables, scope) => {
      if (scope !== activeScope.current) return;
      void queryClient.invalidateQueries({ queryKey: ["my-submissions", targetEpisodeId] });
      if (targetEpisodeId === episodeId) {
        pushToast?.(result.remaining == null ? "Sent to the booth." : `Sent to the booth. ${result.remaining} left this episode.`);
      }
    },
  });

  const voteMutation = useMutation({
    onMutate: () => actionScope,
    mutationFn: async ({
      targetEpisodeId,
      pollId,
      optionId,
    }: {
      targetEpisodeId: string;
      pollId: string;
      optionId: string;
    }) => {
      const result = await votePoll(pollId, { optionId });
      return { targetEpisodeId, pollId, optionId, result };
    },
    onSuccess: ({ targetEpisodeId, pollId, optionId, result }, _variables, scope) => {
      if (scope !== activeScope.current) return;
      setStoredState((current) =>
        current.episodeId === targetEpisodeId
          ? {
              ...current,
              selectedOptions: { ...current.selectedOptions, [pollId]: optionId },
              livePolls: mergePoll(current.livePolls, result),
            }
          : current,
      );
    },
  });

  const reactionMutation = useMutation({
    onMutate: () => actionScope,
    mutationFn: async ({
      targetEpisodeId,
      emoji,
    }: {
      targetEpisodeId: string;
      emoji: CreateReactionDtoEmoji;
    }) => {
      const result = await react(targetEpisodeId, { emoji });
      return { targetEpisodeId, result };
    },
  });

  const submitQueue = useCallback(
    (payload: SubmitQueueItemDto) => {
      if (!episodeId) return Promise.reject(new Error("No live episode right now."));
      return submitQueueMutation
        .mutateAsync({ targetEpisodeId: episodeId, payload })
        .then(({ result }) => {
          if (activeScope.current !== actionScope) throw new Error("This episode or account changed. Please try again.");
          return result;
        });
    },
    [episodeId, submitQueueMutation, actionScope],
  );
  const vote = useCallback(
    ({ pollId, optionId }: { pollId: string; optionId: string }) => {
      if (!episodeId) return Promise.reject(new Error("No live episode right now."));
      return voteMutation
        .mutateAsync({ targetEpisodeId: episodeId, pollId, optionId })
        .then(({ result }) => {
          if (activeScope.current !== actionScope) throw new Error("This episode or account changed. Please try again.");
          return result;
        });
    },
    [episodeId, voteMutation, actionScope],
  );
  const sendReaction = useCallback(
    (emoji: CreateReactionDtoEmoji) => {
      if (!episodeId) return Promise.reject(new Error("No live episode right now."));
      return reactionMutation
        .mutateAsync({ targetEpisodeId: episodeId, emoji })
        .then(({ result }) => {
          if (activeScope.current !== actionScope) throw new Error("This episode or account changed. Please try again.");
          return result;
        });
    },
    [episodeId, reactionMutation, actionScope],
  );

  const sendChat = useCallback(
    async (content: string) => {
      if (!episodeId) throw new Error("No live episode right now.");
      // Transport failures get their own codes so the UI can tell "can't
      // reach the room" apart from a server refusal (FE#65).
      const lease = await acquireSocket().catch(() => {
        throw new Error(SOCKET_UNAVAILABLE);
      });
      try {
        if (activeScope.current !== actionScope) throw new Error(SOCKET_UNAVAILABLE);
        await new Promise<void>((resolve, reject) => {
          lease.socket.timeout(5_000).emit(
            "chat:message",
            { episodeId, content },
            (error: Error | null, response?: { ok?: boolean; error?: string }) => {
              if (activeScope.current !== actionScope) { reject(new Error(SOCKET_UNAVAILABLE)); return; }
              if (error) {
                reject(new Error(SEND_TIMEOUT));
                return;
              }
              if (!response?.ok) {
                reject(new Error(response?.error ?? "Chat failed."));
                return;
              }
              resolve();
            },
          );
        });
      } finally {
        lease.release();
      }
    },
    [episodeId, actionScope],
  );

  return useMemo(
    () => ({
      messages,
      polls,
      selectedOptions,
      receipts,
      upNext,
      pinnedTopic,
      hype,
      pollsLoading: pollsQuery.isLoading,
      pollsError: pollsQuery.error ? getApiErrorMessage(pollsQuery.error) : null,
      submitQueue,
      submitQueuePending:
        submitQueueMutation.context === actionScope && submitQueueMutation.variables?.targetEpisodeId === episodeId && submitQueueMutation.isPending,
      submitQueueError: submitQueueMutation.context === actionScope && submitQueueMutation.variables?.targetEpisodeId === episodeId && submitQueueMutation.error
        ? getApiErrorMessage(submitQueueMutation.error)
        : null,
      vote,
      votePending:
        voteMutation.context === actionScope && voteMutation.variables?.targetEpisodeId === episodeId && voteMutation.isPending,
      voteError:
        voteMutation.context === actionScope && voteMutation.variables?.targetEpisodeId === episodeId && voteMutation.error
          ? getApiErrorMessage(voteMutation.error)
          : null,
      react: sendReaction,
      reacting:
        reactionMutation.context === actionScope && reactionMutation.variables?.targetEpisodeId === episodeId && reactionMutation.isPending,
      reactionError:
        reactionMutation.context === actionScope && reactionMutation.variables?.targetEpisodeId === episodeId && reactionMutation.error
          ? getApiErrorMessage(reactionMutation.error)
          : null,
      sendChat,
      refreshPolls: () => {
        if (!episodeId) return Promise.resolve([]);
        return listPolls(episodeId).then((fresh) => {
          void refetchSnapshot();
          return fresh;
        });
      },
    }),
    [
      episodeId,
      actionScope,
      hype,
      messages,
      pinnedTopic,
      polls,
      pollsQuery.error,
      pollsQuery.isLoading,
      reactionMutation.context,
      reactionMutation.error,
      reactionMutation.isPending,
      reactionMutation.variables?.targetEpisodeId,
      receipts,
      selectedOptions,
      sendReaction,
      sendChat,
      submitQueue,
      submitQueueMutation.context,
      submitQueueMutation.error,
      submitQueueMutation.isPending,
      submitQueueMutation.variables?.targetEpisodeId,
      upNext,
      voteMutation.context,
      voteMutation.error,
      voteMutation.isPending,
      voteMutation.variables?.targetEpisodeId,
      vote,
      refetchSnapshot,
    ],
  );
}
