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
import type {
  CreateReactionDtoEmoji,
  PollResponseDto,
  QueueSubmissionResponseDto,
  SubmitQueueItemDto,
} from "@/lib/api/model";
import { getSocket } from "./socket";

export interface LiveChatMessage {
  id: string;
  name: string;
  body: string;
  time?: string;
  variant?: "booth" | "mod";
}

export interface QueueReceipt {
  itemId: string;
  status: string;
}

export interface UpNextItem {
  id: string;
  type: string;
  text: string;
  recipient?: string | null;
  by?: string | null;
}

export interface PinnedTopic {
  text: string;
  expiresAt?: string | Date | null;
}

export interface HypeState {
  count: number;
  trend: "up" | "down" | "flat" | string;
}

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
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [livePolls, setLivePolls] = useState<PollResponseDto[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [receipts, setReceipts] = useState<QueueReceipt[]>([]);
  const [upNext, setUpNext] = useState<UpNextItem[]>([]);
  const [pinnedTopic, setPinnedTopic] = useState<PinnedTopic | null>(null);
  const [hype, setHype] = useState<HypeState>({ count: 0, trend: "flat" });

  // Tracks the last authSessionKey we actually cycled the socket for, so we
  // only force a disconnect/reconnect when the session identity truly
  // transitions (not on every effect re-run / episodeId change).
  const prevAuthSessionKeyRef = useRef<string | null | undefined>(undefined);

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
    const socket = getSocket();

    function onChatNew(event: ChatEvent) {
      setMessages((prev) => {
        if (prev.some((message) => message.id === event.id)) return prev;
        return [...prev, toChatMessage(event)];
      });
    }

    function onChatHidden(event: { id: string }) {
      setMessages((prev) => prev.filter((message) => message.id !== event.id));
    }

    function onQueueReceipt(event: QueueReceipt) {
      setReceipts((prev) => [event, ...prev]);
      if (event.status === "QUEUED") {
        pushToast?.("Your request is up next.");
      } else if (event.status === "READ") {
        pushToast?.("The booth read your message.");
      }
    }

    function onQueueUpNext(event: UpNextItem) {
      setUpNext((prev) => {
        if (prev.some((item) => item.id === event.id)) return prev;
        return [event, ...prev].slice(0, 5);
      });
    }

    function onPollUpdated(event: PollResponseDto) {
      setLivePolls((prev) => mergePoll(prev, event));
      queryClient.setQueryData(["/api/episodes/" + episodeId + "/polls"], (current: unknown) => {
        return Array.isArray(current) ? mergePoll(current as PollResponseDto[], event) : [event];
      });
    }

    function onHypeTick(event: HypeState) {
      setHype(event);
    }

    function onTopicPinned(event: PinnedTopic) {
      setPinnedTopic(event);
    }

    socket.on("chat:new", onChatNew);
    socket.on("chat:hidden", onChatHidden);
    socket.on("queue:receipt", onQueueReceipt);
    socket.on("queue:up-next", onQueueUpNext);
    socket.on("poll:updated", onPollUpdated);
    socket.on("hype:tick", onHypeTick);
    socket.on("topic:pinned", onTopicPinned);

    const joinEpisode = () => socket.emit("episode:join", { episodeId });
    // Persistent (not `once`) so episode room membership is restored after
    // ANY reconnect — including one triggered by the auth-session cycling
    // below — not just the very first connection.
    socket.on("connect", joinEpisode);

    // Only force a disconnect/reconnect when the auth session identity has
    // actually transitioned on an already-live socket. Re-running this
    // effect for unrelated reasons (e.g. episodeId changing) must not
    // gratuitously cycle the shared socket, since that also knocks out
    // stream-presence room membership until it self-heals on `connect`.
    const sessionChanged =
      prevAuthSessionKeyRef.current !== undefined &&
      prevAuthSessionKeyRef.current !== (authSessionKey ?? null);
    prevAuthSessionKeyRef.current = authSessionKey ?? null;

    if (socket.connected && sessionChanged) {
      socket.disconnect();
      socket.connect();
    } else if (socket.connected) {
      joinEpisode();
    } else {
      socket.connect();
    }

    return () => {
      socket.emit("episode:leave", { episodeId });
      socket.off("connect", joinEpisode);
      socket.off("chat:new", onChatNew);
      socket.off("chat:hidden", onChatHidden);
      socket.off("queue:receipt", onQueueReceipt);
      socket.off("queue:up-next", onQueueUpNext);
      socket.off("poll:updated", onPollUpdated);
      socket.off("hype:tick", onHypeTick);
      socket.off("topic:pinned", onTopicPinned);
    };
  }, [authSessionKey, episodeId, pushToast, queryClient]);

  const submitQueueMutation = useMutation({
    mutationFn: async (payload: SubmitQueueItemDto) => {
      if (!episodeId) throw new Error("No live episode right now.");
      return submitQueueItem(episodeId, payload);
    },
    onSuccess: (result: QueueSubmissionResponseDto) => {
      pushToast?.(`Sent to the booth. ${result.remaining} left this episode.`);
    },
  });

  const voteMutation = useMutation({
    mutationFn: async ({ pollId, optionId }: { pollId: string; optionId: string }) => {
      const result = await votePoll(pollId, { optionId });
      return { pollId, optionId, result };
    },
    onSuccess: ({ pollId, optionId, result }) => {
      setSelectedOptions((prev) => ({ ...prev, [pollId]: optionId }));
      setLivePolls((prev) => mergePoll(prev, result));
    },
  });

  const reactionMutation = useMutation({
    mutationFn: async (emoji: CreateReactionDtoEmoji) => {
      if (!episodeId) throw new Error("No live episode right now.");
      return react(episodeId, { emoji });
    },
  });

  const sendChat = useCallback(
    async (content: string) => {
      if (!episodeId) throw new Error("No live episode right now.");
      const socket = getSocket();
      await new Promise<void>((resolve, reject) => {
        socket.timeout(5_000).emit(
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
      submitQueue: submitQueueMutation.mutateAsync,
      submitQueuePending: submitQueueMutation.isPending,
      submitQueueError: submitQueueMutation.error
        ? getApiErrorMessage(submitQueueMutation.error)
        : null,
      vote: voteMutation.mutateAsync,
      votePending: voteMutation.isPending,
      voteError: voteMutation.error ? getApiErrorMessage(voteMutation.error) : null,
      react: reactionMutation.mutateAsync,
      reacting: reactionMutation.isPending,
      reactionError: reactionMutation.error ? getApiErrorMessage(reactionMutation.error) : null,
      sendChat,
      refreshPolls: () => {
        if (!episodeId) return Promise.resolve([]);
        return listPolls(episodeId).then((fresh) => {
          setLivePolls([]);
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
      receipts,
      selectedOptions,
      sendChat,
      submitQueueMutation.error,
      submitQueueMutation.isPending,
      submitQueueMutation.mutateAsync,
      upNext,
      voteMutation.error,
      voteMutation.isPending,
      voteMutation.mutateAsync,
      reactionMutation.mutateAsync,
    ],
  );
}
