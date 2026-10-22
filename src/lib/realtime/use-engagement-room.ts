"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listPolls,
  react,
  submitQueueItem,
  votePoll,
  useListPolls,
} from "@/lib/api/endpoints/engagement/engagement";
import { getEpisodeEngagementSnapshot } from "@/lib/api/endpoints/episodes/episodes";
import { getApiErrorMessage } from "@/lib/api/error-message";
import type { Socket } from "socket.io-client";
import type {
  CreateReactionDtoEmoji,
  PollResponseDto,
  QueueSubmissionResponseDto,
  SubmitQueueItemDto,
} from "@/lib/api/model";
import { acquireSocket, type SocketLease } from "./socket";
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
      setStoredState((previous) =>
        update(
          previous.episodeId === episodeId
            ? previous
            : emptyEngagementState(episodeId),
        ),
      );
    },
    [episodeId],
  );
  const { messages, livePolls, selectedOptions, receipts, upNext, pinnedTopic, hype } = state;

  // Tracks the last authSessionKey we actually cycled the socket for, so we
  // only force a disconnect/reconnect when the session identity truly
  // transitions (not on every effect re-run / episodeId change).
  const prevAuthSessionKeyRef = useRef<string | null | undefined>(undefined);
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
      const snapshot = await getEpisodeEngagementSnapshot(episodeId);
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
          socketConnectedRef.current = true;
          const version = ++joinVersion;
          // Subscribe before reading history, so a commit between the initial
          // snapshot and room admission is included in this recovery read.
          s.timeout(5_000).emit("episode:join", { episodeId }, (error: Error | null, decision?: { ok: boolean }) => {
            if (cancelled || version !== joinVersion || !s.connected) return;
            if (error || !decision?.ok) { onDisconnect(); return; }
            void refetchSnapshot();
          });
        };
        // Persistent (not `once`) so episode room membership is restored after
        // ANY reconnect — including one triggered by the auth-session cycling
        // below — not just the very first connection.
        s.on("connect", joinEpisode);
        joinEpisodeRef.current = joinEpisode;

        // Only force a disconnect/reconnect when the auth session identity has
        // actually transitioned on an already-live socket. Re-running this
        // effect for unrelated reasons (e.g. episodeId changing) must not
        // gratuitously cycle the shared socket, since that also knocks out
        // stream-presence room membership until it self-heals on `connect`.
        const sessionChanged =
          prevAuthSessionKeyRef.current !== undefined &&
          prevAuthSessionKeyRef.current !== (authSessionKey ?? null);
        prevAuthSessionKeyRef.current = authSessionKey ?? null;

        if (s.connected && sessionChanged) {
          s.disconnect();
          s.connect();
        } else if (s.connected) {
          joinEpisode();
        } else {
          s.connect();
        }
      })
      .catch(() => {
        // The HTTP query surfaces unavailable engagement state. Avoid an
        // unhandled rejection if the lazy Socket.IO import/connect fails.
      });

    return () => {
      cancelled = true;
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
    onSuccess: ({ targetEpisodeId, result }: { targetEpisodeId: string; result: QueueSubmissionResponseDto }) => {
      void queryClient.invalidateQueries({ queryKey: ["my-submissions", targetEpisodeId] });
      if (targetEpisodeId === episodeId) {
        pushToast?.(result.remaining == null ? "Sent to the booth." : `Sent to the booth. ${result.remaining} left this episode.`);
      }
    },
  });

  const voteMutation = useMutation({
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
    onSuccess: ({ targetEpisodeId, pollId, optionId, result }) => {
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
        .then(({ result }) => result);
    },
    [episodeId, submitQueueMutation],
  );
  const vote = useCallback(
    ({ pollId, optionId }: { pollId: string; optionId: string }) => {
      if (!episodeId) return Promise.reject(new Error("No live episode right now."));
      return voteMutation
        .mutateAsync({ targetEpisodeId: episodeId, pollId, optionId })
        .then(({ result }) => result);
    },
    [episodeId, voteMutation],
  );
  const sendReaction = useCallback(
    (emoji: CreateReactionDtoEmoji) => {
      if (!episodeId) return Promise.reject(new Error("No live episode right now."));
      return reactionMutation
        .mutateAsync({ targetEpisodeId: episodeId, emoji })
        .then(({ result }) => result);
    },
    [episodeId, reactionMutation],
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
        await new Promise<void>((resolve, reject) => {
          lease.socket.timeout(5_000).emit(
            "chat:message",
            { episodeId, content },
            (error: Error | null, response?: { ok?: boolean; error?: string }) => {
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
    [episodeId],
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
        submitQueueMutation.variables?.targetEpisodeId === episodeId && submitQueueMutation.isPending,
      submitQueueError: submitQueueMutation.variables?.targetEpisodeId === episodeId && submitQueueMutation.error
        ? getApiErrorMessage(submitQueueMutation.error)
        : null,
      vote,
      votePending:
        voteMutation.variables?.targetEpisodeId === episodeId && voteMutation.isPending,
      voteError:
        voteMutation.variables?.targetEpisodeId === episodeId && voteMutation.error
          ? getApiErrorMessage(voteMutation.error)
          : null,
      react: sendReaction,
      reacting:
        reactionMutation.variables?.targetEpisodeId === episodeId && reactionMutation.isPending,
      reactionError:
        reactionMutation.variables?.targetEpisodeId === episodeId && reactionMutation.error
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
      hype,
      messages,
      pinnedTopic,
      polls,
      pollsQuery.error,
      pollsQuery.isLoading,
      reactionMutation.error,
      reactionMutation.isPending,
      reactionMutation.variables?.targetEpisodeId,
      receipts,
      selectedOptions,
      sendReaction,
      sendChat,
      submitQueue,
      submitQueueMutation.error,
      submitQueueMutation.isPending,
      submitQueueMutation.variables?.targetEpisodeId,
      upNext,
      voteMutation.error,
      voteMutation.isPending,
      voteMutation.variables?.targetEpisodeId,
      vote,
      refetchSnapshot,
    ],
  );
}
