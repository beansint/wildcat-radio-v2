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
import { getApiErrorMessage } from "@/lib/api/error-message";
import type { Socket } from "socket.io-client";
import type {
  CreateReactionDtoEmoji,
  PollResponseDto,
  QueueSubmissionResponseDto,
  SubmitQueueItemDto,
} from "@/lib/api/model";
import { acquireSocket, type SocketLease } from "./socket";
import {
  emptyEngagementState,
  type HypeState,
  type LiveChatMessage,
  type PinnedTopic,
  type QueueReceipt,
  type UpNextItem,
} from "./engagement-state";

export type { HypeState, LiveChatMessage, PinnedTopic, QueueReceipt, UpNextItem } from "./engagement-state";

interface ChatEvent {
  id: string;
  content: string;
  asBooth?: boolean;
  createdAt?: string;
  author?: { handle?: string | null; name?: string | null } | null;
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
    // TODO: the listener manifest doesn't yet expose the live show name
    // (M5/M6) — fall back to a neutral "Booth" label until it does.
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

  const pollsQuery = useListPolls(episodeId ?? "", {
    query: {
      enabled: Boolean(episodeId),
      refetchOnWindowFocus: false,
    },
  });

  const polls = useMemo(() => {
    return livePolls.reduce(
      (current, poll) => mergePoll(current, poll),
      pollsQuery.data ?? [],
    );
  }, [livePolls, pollsQuery.data]);

  useEffect(() => {
    if (!episodeId) return;
    let cancelled = false;
    let socket: Socket | null = null;
    let lease: SocketLease<Socket> | null = null;

    function onChatNew(event: ChatEvent) {
      updateState((current) => {
        if (current.messages.some((message) => message.id === event.id)) return current;
        return { ...current, messages: [...current.messages, toChatMessage(event)] };
      });
    }

    function onChatHidden(event: { id: string }) {
      updateState((current) => ({
        ...current,
        messages: current.messages.filter((message) => message.id !== event.id),
      }));
    }

    function onQueueReceipt(event: QueueReceipt) {
      updateState((current) => ({ ...current, receipts: [event, ...current.receipts] }));
      if (event.status === "QUEUED") {
        pushToast?.("Your request is up next.");
      } else if (event.status === "READ") {
        pushToast?.("The booth read your message.");
      }
    }

    function onQueueUpNext(event: UpNextItem) {
      updateState((current) => {
        if (current.upNext.some((item) => item.id === event.id)) return current;
        return { ...current, upNext: [event, ...current.upNext].slice(0, 5) };
      });
    }

    function onPollUpdated(event: PollResponseDto) {
      updateState((current) => ({
        ...current,
        livePolls: mergePoll(current.livePolls, event),
      }));
      queryClient.setQueryData(["/api/episodes/" + episodeId + "/polls"], (current: unknown) => {
        return Array.isArray(current) ? mergePoll(current as PollResponseDto[], event) : [event];
      });
    }

    function onHypeTick(event: HypeState) {
      updateState((current) => ({ ...current, hype: event }));
    }

    function onTopicPinned(event: PinnedTopic) {
      updateState((current) => ({ ...current, pinnedTopic: event }));
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

      s.on("chat:new", onChatNew);
      s.on("chat:hidden", onChatHidden);
      s.on("queue:receipt", onQueueReceipt);
      s.on("queue:up-next", onQueueUpNext);
      s.on("poll:updated", onPollUpdated);
      s.on("hype:tick", onHypeTick);
      s.on("topic:pinned", onTopicPinned);

      const joinEpisode = () => s.emit("episode:join", { episodeId });
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
        socket.off("chat:new", onChatNew);
        socket.off("chat:hidden", onChatHidden);
        socket.off("queue:receipt", onQueueReceipt);
        socket.off("queue:up-next", onQueueUpNext);
        socket.off("poll:updated", onPollUpdated);
        socket.off("hype:tick", onHypeTick);
        socket.off("topic:pinned", onTopicPinned);
      }
      joinEpisodeRef.current = null;
      lease?.release();
    };
  }, [authSessionKey, episodeId, pushToast, queryClient, updateState]);

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
      if (targetEpisodeId === episodeId) {
        pushToast?.(`Sent to the booth. ${result.remaining} left this episode.`);
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
      const lease = await acquireSocket();
      try {
        await new Promise<void>((resolve, reject) => {
          lease.socket.timeout(5_000).emit(
            "chat:message",
            { episodeId, content },
            (error: Error | null, response?: { ok?: boolean; error?: string }) => {
              if (error) {
                reject(new Error("Chat send timed out."));
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
          updateState((current) => ({ ...current, livePolls: [] }));
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
      updateState,
    ],
  );
}
