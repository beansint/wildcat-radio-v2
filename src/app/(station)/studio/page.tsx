"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Check, LogOut, Megaphone, MessageSquare, Pin, Radio, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  actOnQueueItem,
  closePoll,
  createPoll,
  getStudioQueue,
  postBoothChat,
  setPinnedTopic,
} from "@/lib/api/endpoints/studio/studio";
import { getApiErrorMessage } from "@/lib/api/error-message";
import type { PollResponseDto, QueueActDtoAction, StudioQueueItemResponseDto } from "@/lib/api/model";
import { getSocket } from "@/lib/realtime/socket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const tokenSchema = z.object({
  token: z.string().trim().min(1, "Paste the station token."),
});

const pollSchema = z.object({
  question: z.string().trim().min(1, "Add a poll question.").max(200),
  options: z
    .string()
    .refine(
      (value) => {
        const options = value.split("\n").map((line) => line.trim()).filter(Boolean);
        return options.length >= 2 && options.length <= 6;
      },
      "Add two to six options.",
    ),
  visibility: z.enum(["PUBLIC", "ANONYMOUS"]),
});

const pinSchema = z.object({
  text: z.string().trim().min(1, "Add a pinned topic.").max(280),
});

const chatSchema = z.object({
  content: z.string().trim().min(1, "Add a booth chat message.").max(500),
});

type TokenForm = z.infer<typeof tokenSchema>;
type PollForm = z.input<typeof pollSchema>;
type PinForm = z.infer<typeof pinSchema>;
type ChatForm = z.infer<typeof chatSchema>;

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

function subscribeStationToken(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function getStoredStationToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("wildcat.stationToken") ?? "";
}

function queueLabel(item: StudioQueueItemResponseDto) {
  if (item.type === "REQUEST") return "Request";
  if (item.type === "DEDICATION") return "Dedication";
  return "Q&A";
}

export default function StudioPage() {
  const queryClient = useQueryClient();
  const storedToken = useSyncExternalStore(subscribeStationToken, getStoredStationToken, () => "");
  const [tokenOverride, setTokenOverride] = useState<string | null>(null);
  const token = tokenOverride ?? storedToken;
  const [polls, setPolls] = useState<PollResponseDto[]>([]);
  const [hype, setHype] = useState({ count: 0, trend: "flat" });
  const [pinnedTopic, setPinnedTopicState] = useState("");
  const [boothMessages, setBoothMessages] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const tokenForm = useForm<TokenForm>({
    resolver: zodResolver(tokenSchema),
    defaultValues: { token: "" },
  });
  const pollForm = useForm<PollForm>({
    resolver: zodResolver(pollSchema),
    defaultValues: { question: "", options: "OPM throwbacks\nLo-fi chill", visibility: "PUBLIC" },
  });
  const pinForm = useForm<PinForm>({
    resolver: zodResolver(pinSchema),
    defaultValues: { text: "" },
  });
  const chatForm = useForm<ChatForm>({
    resolver: zodResolver(chatSchema),
    defaultValues: { content: "" },
  });

  useEffect(() => {
    document.body.classList.add("wc-studio-page");
    const player = document.querySelector<HTMLElement>(".wc-player");
    const previousDisplay = player?.style.display;
    if (player) player.style.display = "none";
    return () => {
      document.body.classList.remove("wc-studio-page");
      if (player) player.style.display = previousDisplay ?? "";
    };
  }, []);

  const queueQuery = useQuery({
    queryKey: ["studio-queue", token],
    enabled: Boolean(token),
    refetchInterval: 5_000,
    queryFn: () => getStudioQueue({ headers: authHeaders(token) }),
  });

  const episodeId = queueQuery.data?.episodeId ?? null;

  useEffect(() => {
    if (!episodeId) return;
    const socket = getSocket();
    function onPollUpdated(poll: PollResponseDto) {
      setPolls((prev) => {
        const exists = prev.some((item) => item.id === poll.id);
        return exists ? prev.map((item) => (item.id === poll.id ? poll : item)) : [poll, ...prev];
      });
    }
    function onHypeTick(event: { count: number; trend: string }) {
      setHype(event);
    }
    function onTopicPinned(event: { text: string }) {
      setPinnedTopicState(event.text);
    }
    function onChatNew(event: { asBooth?: boolean; content?: string }) {
      const content = event.content;
      if (event.asBooth && content) setBoothMessages((prev) => [content, ...prev].slice(0, 5));
    }
    socket.emit("episode:join", { episodeId });
    socket.on("poll:updated", onPollUpdated);
    socket.on("hype:tick", onHypeTick);
    socket.on("topic:pinned", onTopicPinned);
    socket.on("chat:new", onChatNew);
    return () => {
      socket.emit("episode:leave", { episodeId });
      socket.off("poll:updated", onPollUpdated);
      socket.off("hype:tick", onHypeTick);
      socket.off("topic:pinned", onTopicPinned);
      socket.off("chat:new", onChatNew);
    };
  }, [episodeId]);

  const requestOptions = useMemo(() => ({ headers: authHeaders(token) }), [token]);

  const actMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: QueueActDtoAction }) =>
      actOnQueueItem(id, { action }, requestOptions),
    onSuccess: async (result) => {
      setStatus(result.receipt ? `Marked ${result.status.toLowerCase()} and sent receipt.` : "Declined silently.");
      await queryClient.invalidateQueries({ queryKey: ["studio-queue", token] });
    },
    onError: (error) => setStatus(getApiErrorMessage(error)),
  });

  const pollMutation = useMutation({
    mutationFn: (values: PollForm) => {
      const parsed = pollSchema.parse(values);
      return createPoll(
        {
          question: parsed.question,
          options: parsed.options.split("\n").map((line) => line.trim()).filter(Boolean),
          visibility: parsed.visibility,
        },
        requestOptions,
      );
    },
    onSuccess: (poll) => {
      setPolls((prev) => [poll, ...prev.filter((item) => item.id !== poll.id)]);
      pollForm.reset({ question: "", options: "OPM throwbacks\nLo-fi chill", visibility: "PUBLIC" });
      setStatus("Poll launched.");
    },
    onError: (error) => setStatus(getApiErrorMessage(error)),
  });

  const closePollMutation = useMutation({
    mutationFn: (id: string) => closePoll(id, requestOptions),
    onSuccess: (poll) => {
      setPolls((prev) => prev.map((item) => (item.id === poll.id ? poll : item)));
      setStatus("Poll closed.");
    },
    onError: (error) => setStatus(getApiErrorMessage(error)),
  });

  const pinMutation = useMutation({
    mutationFn: (values: PinForm) => setPinnedTopic(values, requestOptions),
    onSuccess: (topic) => {
      setPinnedTopicState(topic.text);
      pinForm.reset({ text: "" });
      setStatus("Pinned topic updated.");
    },
    onError: (error) => setStatus(getApiErrorMessage(error)),
  });

  const boothChatMutation = useMutation({
    mutationFn: (values: ChatForm) => postBoothChat(values, requestOptions),
    onSuccess: (message) => {
      setBoothMessages((prev) => [message.content, ...prev].slice(0, 5));
      chatForm.reset({ content: "" });
      setStatus("Booth chat posted.");
    },
    onError: (error) => setStatus(getApiErrorMessage(error)),
  });

  function saveToken(values: TokenForm) {
    window.localStorage.setItem("wildcat.stationToken", values.token);
    setTokenOverride(values.token);
    setStatus("Station token saved.");
  }

  function clearToken() {
    window.localStorage.removeItem("wildcat.stationToken");
    setTokenOverride("");
    setStatus(null);
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-neutral-950 pb-28 text-white">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4">
          <div className="rounded-lg border border-white/15 bg-white/8 p-5">
            <h1 className="mb-4 flex items-center gap-2 text-xl font-extrabold">
              <Radio className="h-5 w-5 text-gold" aria-hidden="true" />
              Studio console
            </h1>
            <form onSubmit={tokenForm.handleSubmit(saveToken)}>
              <Label htmlFor="station-token" className="text-white">Station token</Label>
              <Input
                id="station-token"
                className="mt-2"
                placeholder="Paste station Bearer token"
                data-testid="studio-token-input"
                {...tokenForm.register("token")}
              />
              {tokenForm.formState.errors.token?.message && (
                <div role="alert" className="mt-2 text-sm font-semibold text-red-200">
                  {tokenForm.formState.errors.token.message}
                </div>
              )}
              <Button type="submit" className="mt-4 wc-btn-block" data-testid="studio-token-save">
                Unlock console
              </Button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[1.1fr_.9fr]">
        <section className="rounded-lg border border-white/15 bg-white/8">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 px-4 py-3">
            <div>
              <div className="text-xs font-bold uppercase text-white/55">Station session</div>
              <h1 className="text-xl font-extrabold">Studio console</h1>
              <div className="text-sm text-white/65">Episode {episodeId ?? "not active"}</div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => queueQuery.refetch()}
                disabled={queueQuery.isFetching}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Refresh
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={clearToken}>
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Clear token
              </Button>
            </div>
          </header>

          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-extrabold">Unified inbox</h2>
              <span className="rounded-full bg-gold px-2.5 py-1 text-xs font-extrabold text-neutral-950">
                {queueQuery.data?.items.length ?? 0} items
              </span>
            </div>

            {queueQuery.error && (
              <div role="alert" className="mb-3 rounded-md bg-red-950/70 p-3 text-sm font-semibold text-red-100">
                {getApiErrorMessage(queueQuery.error)}
              </div>
            )}
            {status && (
              <div role="status" className="mb-3 rounded-md bg-white/10 p-3 text-sm font-semibold text-white">
                {status}
              </div>
            )}

            <div className="grid gap-3" data-testid="studio-queue">
              {queueQuery.isLoading ? (
                <div className="text-sm text-white/65">Loading queue...</div>
              ) : queueQuery.data?.items.length ? (
                queueQuery.data.items.map((item) => (
                  <article key={item.id} className="scroll-mb-32 rounded-lg border border-white/12 bg-neutral-900 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold">
                        {queueLabel(item)}
                      </span>
                      <span className="text-xs font-semibold text-white/55">{item.status}</span>
                    </div>
                    <p className="text-sm">{item.text}</p>
                    {item.recipient && <p className="mt-1 text-xs text-white/60">For {item.recipient}</p>}
                    <p className="mt-2 text-xs text-white/45">From @{item.submitter.handle}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="scroll-mb-32"
                        onClick={() => actMutation.mutate({ id: item.id, action: "QUEUE" })}
                        disabled={actMutation.isPending || item.status !== "PENDING"}
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Queue
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="scroll-mb-32"
                        onClick={() => actMutation.mutate({ id: item.id, action: "READ" })}
                        disabled={actMutation.isPending || item.status !== "PENDING"}
                      >
                        <Megaphone className="h-4 w-4" aria-hidden="true" />
                        Read
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="scroll-mb-32"
                        onClick={() => actMutation.mutate({ id: item.id, action: "DECLINE" })}
                        disabled={actMutation.isPending || item.status !== "PENDING"}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                        Decline
                      </Button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-white/20 p-6 text-center text-sm text-white/60">
                  No queue items yet.
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="grid gap-4">
          <section className="rounded-lg border border-white/15 bg-white/8 p-4">
            <h2 className="mb-3 flex items-center gap-2 font-extrabold">
              <BarChart3 className="h-4 w-4 text-gold" aria-hidden="true" />
              Poll launcher
            </h2>
            <form className="grid gap-3" onSubmit={pollForm.handleSubmit((values) => pollMutation.mutate(values))}>
              <div>
                <Label htmlFor="studio-poll-question" className="text-white">Question</Label>
                <Input id="studio-poll-question" {...pollForm.register("question")} />
              </div>
              <div>
                <Label htmlFor="studio-poll-options" className="text-white">Options, one per line</Label>
                <Textarea id="studio-poll-options" rows={4} {...pollForm.register("options")} />
              </div>
              <Button type="submit" disabled={pollMutation.isPending}>Launch poll</Button>
            </form>
            {polls.length > 0 && (
              <div className="mt-4 grid gap-2">
                {polls.map((poll) => (
                  <div key={poll.id} className="rounded-md bg-neutral-900 p-3 text-sm">
                    <div className="font-bold">{poll.question}</div>
                    <div className="text-white/55">{poll.totalVotes} votes</div>
                    {poll.isActive && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => closePollMutation.mutate(poll.id)}
                        disabled={closePollMutation.isPending}
                      >
                        Close poll
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-white/15 bg-white/8 p-4">
            <h2 className="mb-3 flex items-center gap-2 font-extrabold">
              <Pin className="h-4 w-4 text-gold" aria-hidden="true" />
              Pinned topic
            </h2>
            <form className="grid gap-3" onSubmit={pinForm.handleSubmit((values) => pinMutation.mutate(values))}>
              <Textarea rows={3} placeholder="What should listeners talk about?" {...pinForm.register("text")} />
              <Button type="submit" disabled={pinMutation.isPending}>Set pinned topic</Button>
            </form>
            {pinnedTopic && <div className="mt-3 rounded-md bg-neutral-900 p-3 text-sm">{pinnedTopic}</div>}
          </section>

          <section className="rounded-lg border border-white/15 bg-white/8 p-4">
            <h2 className="mb-3 flex items-center gap-2 font-extrabold">
              <MessageSquare className="h-4 w-4 text-gold" aria-hidden="true" />
              Booth chat
            </h2>
            <form className="grid gap-3" onSubmit={chatForm.handleSubmit((values) => boothChatMutation.mutate(values))}>
              <Input placeholder="Post as the booth" {...chatForm.register("content")} />
              <Button type="submit" disabled={boothChatMutation.isPending}>Post as booth</Button>
            </form>
            <div className="mt-4 rounded-md bg-neutral-900 p-3">
              <div className="mb-2 text-xs font-bold uppercase text-white/55">Hype meter</div>
              <div className="text-2xl font-extrabold text-gold">{hype.count}</div>
              <div className="text-xs text-white/55">Trend: {hype.trend}</div>
            </div>
            {boothMessages.length > 0 && (
              <div className="mt-3 grid gap-2">
                {boothMessages.map((message, index) => (
                  <div key={`${message}-${index}`} className="rounded-md bg-neutral-900 p-2 text-sm">
                    🎙 {message}
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
