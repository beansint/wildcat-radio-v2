"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Check,
  Flame,
  Heart,
  HelpCircle,
  Inbox,
  LogOut,
  Megaphone,
  MessageCircle,
  Music,
  Pin,
  Radio,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import {
  actOnQueueItem,
  clearStationSession,
  closePoll,
  createPoll,
  createStationSession,
  getStationSession,
  getStudioQueue,
  postBoothChat,
  setPinnedTopic,
} from "@/lib/api/endpoints/studio/studio";
import { getApiErrorMessage } from "@/lib/api/error-message";
import type {
  ChatMessageResponseDto,
  PollResponseDto,
  QueueActDtoAction,
  StudioQueueItemResponseDtoType,
} from "@/lib/api/model";
import { getSocket } from "@/lib/realtime/socket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const STUDIO_UNLOCKED_KEY = "wc.studioUnlocked";

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
  expiresAtEpisodeEnd: z.boolean(),
});

const chatSchema = z.object({
  content: z.string().trim().min(1, "Add a booth chat message.").max(500),
});

type TokenForm = z.infer<typeof tokenSchema>;
type PollForm = z.input<typeof pollSchema>;
type PinForm = z.infer<typeof pinSchema>;
type ChatForm = z.infer<typeof chatSchema>;

const TYPE_META: Record<
  StudioQueueItemResponseDtoType,
  { icon: typeof Music; iconClass: string; label: string }
> = {
  REQUEST: { icon: Music, iconClass: "wc-ti-req", label: "Request" },
  DEDICATION: { icon: Heart, iconClass: "wc-ti-ded", label: "Dedication" },
  QUESTION: { icon: HelpCircle, iconClass: "wc-ti-qa", label: "Q&A" },
};

/** First truthy message wins — keeps each form to a single role="alert" region. */
function firstError(...messages: Array<string | null | undefined>) {
  return messages.find((message): message is string => Boolean(message)) ?? null;
}

function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-xl border px-3 py-2 text-sm font-semibold"
      style={{
        borderColor: "var(--destructive)",
        background: "color-mix(in srgb, var(--destructive) 12%, transparent)",
        color: "var(--destructive)",
      }}
    >
      {message}
    </div>
  );
}

/** Deterministic pseudo-random bar heights so the equalizer feels alive without faking real data. */
function hypeBarHeights(seed: number, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const value = Math.sin(seed * 0.37 + index * 1.7) * 0.5 + 0.5;
    return Math.round(30 + value * 65);
  });
}

export default function StudioPage() {
  const queryClient = useQueryClient();
  const [polls, setPolls] = useState<PollResponseDto[]>([]);
  const [hype, setHype] = useState({ count: 0, trend: "flat" });
  const [pinnedTopic, setPinnedTopicState] = useState("");
  const [messages, setMessages] = useState<ChatMessageResponseDto[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

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
    defaultValues: { text: "", expiresAtEpisodeEnd: true },
  });
  const chatForm = useForm<ChatForm>({
    resolver: zodResolver(chatSchema),
    defaultValues: { content: "" },
  });

  useEffect(() => {
    // TEMPORARY: the global player is a sibling chrome element outside this
    // page's tree, so it can't be hidden by scoping styles to this subtree.
    // `body.wc-studio-page .wc-player { display: none; }` (globals.css) does
    // the actual hiding — this effect only toggles the marker class. Replace
    // with a layout-level "hide chrome" flag once the app shell supports one.
    document.body.classList.add("wc-studio-page");
    // One-time cleanup: older builds persisted the raw device token here. The
    // cookie session replaces it — purge any leftover so it can't linger.
    try {
      window.localStorage.removeItem("wildcat.stationToken");
    } catch {
      // ignore storage access errors (private mode, etc.)
    }
    return () => {
      document.body.classList.remove("wc-studio-page");
    };
  }, []);

  // Cookie-backed session check. `GET /studio/session` always resolves 200 with
  // `{ active }` — `active: true` means the httpOnly `wc_station` cookie is
  // present and valid; `active: false` means locked (no console-noise 401).
  const sessionQuery = useQuery({
    queryKey: ["station-session"],
    queryFn: () => getStationSession(),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const unlocked = sessionQuery.data?.active === true;

  const unlockMutation = useMutation({
    mutationFn: (values: TokenForm) =>
      createStationSession({ headers: { Authorization: `Bearer ${values.token}` } }),
    onSuccess: async () => {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(STUDIO_UNLOCKED_KEY, "1");
      }
      tokenForm.reset({ token: "" });
      await queryClient.invalidateQueries({ queryKey: ["station-session"] });
    },
  });

  const clearSessionMutation = useMutation({
    mutationFn: () => clearStationSession(),
    onSuccess: async () => {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(STUDIO_UNLOCKED_KEY);
      }
      setStatus(null);
      await queryClient.invalidateQueries({ queryKey: ["station-session"] });
    },
  });

  const queueQuery = useQuery({
    queryKey: ["studio-queue"],
    enabled: unlocked,
    refetchInterval: 5_000,
    queryFn: () => getStudioQueue(),
  });

  const episodeId = queueQuery.data?.episodeId ?? null;
  const showName = queueQuery.data?.showName ?? null;

  const addChatMessage = useCallback((message: ChatMessageResponseDto) => {
    setMessages((prev) => {
      if (prev.some((item) => item.id === message.id)) return prev;
      return [...prev, message].slice(-100);
    });
  }, []);

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
    function onChatNew(event: ChatMessageResponseDto) {
      addChatMessage(event);
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
  }, [episodeId, addChatMessage]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [messages]);

  const actMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: QueueActDtoAction }) =>
      actOnQueueItem(id, { action }),
    onSuccess: async (result) => {
      setStatus(result.receipt ? `Marked ${result.status.toLowerCase()} and sent receipt.` : "Declined silently.");
      await queryClient.invalidateQueries({ queryKey: ["studio-queue"] });
    },
    onError: (error) => setStatus(getApiErrorMessage(error)),
  });

  const pollMutation = useMutation({
    mutationFn: (values: PollForm) => {
      const parsed = pollSchema.parse(values);
      return createPoll({
        question: parsed.question,
        options: parsed.options.split("\n").map((line) => line.trim()).filter(Boolean),
        visibility: parsed.visibility,
      });
    },
    onSuccess: (poll) => {
      setPolls((prev) => [poll, ...prev.filter((item) => item.id !== poll.id)]);
      pollForm.reset({ question: "", options: "OPM throwbacks\nLo-fi chill", visibility: "PUBLIC" });
      setStatus("Poll launched.");
    },
    onError: (error) => setStatus(getApiErrorMessage(error)),
  });

  const closePollMutation = useMutation({
    mutationFn: (id: string) => closePoll(id),
    onSuccess: (poll) => {
      setPolls((prev) => prev.map((item) => (item.id === poll.id ? poll : item)));
      setStatus("Poll closed.");
    },
    onError: (error) => setStatus(getApiErrorMessage(error)),
  });

  const pinMutation = useMutation({
    mutationFn: (values: PinForm) => setPinnedTopic(values),
    onSuccess: (topic) => {
      setPinnedTopicState(topic.text);
      pinForm.reset({ text: "", expiresAtEpisodeEnd: topic.expiresAtEpisodeEnd });
      setStatus("Pinned topic updated.");
    },
    onError: (error) => setStatus(getApiErrorMessage(error)),
  });

  const boothChatMutation = useMutation({
    mutationFn: (values: ChatForm) => postBoothChat(values),
    onSuccess: (message) => {
      addChatMessage(message);
      chatForm.reset({ content: "" });
      setStatus("Booth chat posted.");
    },
    onError: (error) => setStatus(getApiErrorMessage(error)),
  });

  function saveToken(values: TokenForm) {
    unlockMutation.mutate(values);
  }

  function clearToken() {
    clearSessionMutation.mutate();
  }

  const tokenAlert = firstError(
    tokenForm.formState.errors.token?.message,
    unlockMutation.error ? getApiErrorMessage(unlockMutation.error) : null,
  );
  const pollAlert = firstError(
    pollForm.formState.errors.question?.message,
    pollForm.formState.errors.options?.message,
    pollForm.formState.errors.visibility?.message,
    pollMutation.error ? getApiErrorMessage(pollMutation.error) : null,
  );
  const pinAlert = firstError(
    pinForm.formState.errors.text?.message,
    pinMutation.error ? getApiErrorMessage(pinMutation.error) : null,
  );
  const chatAlert = firstError(
    chatForm.formState.errors.content?.message,
    boothChatMutation.error ? getApiErrorMessage(boothChatMutation.error) : null,
  );

  if (sessionQuery.isPending) {
    return (
      <main className="dark min-h-screen bg-background pb-28 text-foreground">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 text-sm wc-muted">
          Checking station session…
        </div>
      </main>
    );
  }

  if (!unlocked) {
    return (
      <main className="dark min-h-screen bg-background pb-28 text-foreground">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4">
          <div className="wc-card wc-card-pad">
            <h1 className="mb-4 flex items-center gap-2 text-xl font-extrabold">
              <Radio className="h-5 w-5 text-gold" aria-hidden="true" />
              Studio console
            </h1>
            <form onSubmit={tokenForm.handleSubmit(saveToken)} noValidate>
              <Label htmlFor="station-token">Station token</Label>
              <Input
                id="station-token"
                className="mt-2"
                placeholder="Paste station Bearer token"
                data-testid="studio-token-input"
                aria-invalid={Boolean(tokenAlert)}
                {...tokenForm.register("token")}
              />
              <div className="mt-2">
                <FormAlert message={tokenAlert} />
              </div>
              <Button
                type="submit"
                className="mt-4 wc-btn-block"
                data-testid="studio-token-save"
                disabled={unlockMutation.isPending}
              >
                Unlock console
              </Button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const barHeights = hypeBarHeights(hype.count, 12);

  return (
    <main className="dark min-h-screen bg-background text-foreground">
      <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[1fr_360px]">
        <div className="grid min-w-0 gap-4">
        <section className="wc-card">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <div className="text-xs font-bold uppercase wc-muted">Station session</div>
              <h1 className="text-xl font-extrabold">Studio console</h1>
              <div className="text-sm wc-muted">Episode {episodeId ?? "not active"}</div>
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

          <div className="wc-card-pad">
            <div className="mb-3 flex items-center gap-2">
              <Inbox className="h-5 w-5 text-gold" aria-hidden="true" />
              <h2 className="font-extrabold">Inbox</h2>
              <span className="wc-chip text-[.7rem] py-0.5">{queueQuery.data?.items.length ?? 0}</span>
              <span className="ml-auto text-xs wc-muted">
                Decline is silent · receipts only on positive outcomes
              </span>
            </div>

            {queueQuery.error && <FormAlert message={getApiErrorMessage(queueQuery.error)} />}
            {status && (
              <div role="status" className="mb-3 mt-3 rounded-md bg-muted p-3 text-sm font-semibold first:mt-0">
                {status}
              </div>
            )}

            <div className="wc-stack" data-testid="studio-queue">
              {queueQuery.isLoading ? (
                <div className="text-sm wc-muted">Loading queue…</div>
              ) : queueQuery.data?.items.length ? (
                queueQuery.data.items.map((item) => {
                  const meta = TYPE_META[item.type];
                  const Icon = meta.icon;
                  return (
                    <article key={item.id} className="wc-card wc-card-pad">
                      <div className="flex items-start gap-2">
                        <span className={`wc-typeicon ${meta.iconClass}`}>
                          <Icon aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold uppercase wc-muted">{meta.label}</span>
                            <span className="text-xs font-semibold wc-muted">{item.status}</span>
                          </div>
                          <p className="text-sm">
                            {item.text} · <span style={{ color: "var(--gold)" }}>@{item.submitter.handle}</span>
                          </p>
                          {item.recipient && <p className="mt-1 text-xs wc-muted">For {item.recipient}</p>}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => actMutation.mutate({ id: item.id, action: "QUEUE" })}
                          disabled={actMutation.isPending || item.status !== "PENDING"}
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          Queue
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => actMutation.mutate({ id: item.id, action: "READ" })}
                          disabled={actMutation.isPending || item.status !== "PENDING"}
                        >
                          <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />
                          Read
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => actMutation.mutate({ id: item.id, action: "DECLINE" })}
                          disabled={actMutation.isPending || item.status !== "PENDING"}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                          Decline
                        </Button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm wc-muted">
                  When the inbox is empty, you&apos;re all caught up — listeners&apos; messages land here privately.
                </div>
              )}
            </div>
          </div>
        </section>

          <section className="wc-card wc-card-pad">
            <h2 className="mb-3 flex items-center gap-2 font-extrabold">
              <BarChart3 className="h-4 w-4 text-gold" aria-hidden="true" />
              Poll launcher
            </h2>
            <form
              className="grid gap-3"
              noValidate
              onSubmit={pollForm.handleSubmit((values) => pollMutation.mutate(values))}
            >
              <div>
                <Label htmlFor="studio-poll-question">Question</Label>
                <Input
                  id="studio-poll-question"
                  className="mt-1"
                  aria-invalid={Boolean(pollAlert)}
                  {...pollForm.register("question")}
                />
              </div>
              <div>
                <Label htmlFor="studio-poll-options">Options, one per line</Label>
                <Textarea id="studio-poll-options" className="mt-1" rows={4} {...pollForm.register("options")} />
              </div>
              <fieldset>
                <legend className="wc-label">Visibility</legend>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="radio" value="PUBLIC" {...pollForm.register("visibility")} />
                    Public — show who voted
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="radio" value="ANONYMOUS" {...pollForm.register("visibility")} />
                    Anonymous — tallies only
                  </label>
                </div>
              </fieldset>
              <FormAlert message={pollAlert} />
              <Button type="submit" disabled={pollMutation.isPending}>
                Launch poll
              </Button>
            </form>
            {polls.length > 0 && (
              <div className="mt-4 wc-stack">
                {polls.map((poll) => (
                  <div key={poll.id} className="wc-card wc-card-pad" style={{ borderColor: "var(--maroon)" }}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="wc-badge-live text-[.6rem] py-0.5">
                        <span className="dot" />
                        {poll.isActive ? "Live poll" : "Closed"}
                      </span>
                      <span className="text-sm font-semibold">{poll.question}</span>
                    </div>
                    <div className="grid gap-2">
                      {poll.options.map((option) => {
                        const pct = poll.totalVotes > 0 ? Math.round((option.voteCount / poll.totalVotes) * 100) : 0;
                        return (
                          <div
                            key={option.id}
                            className="relative overflow-hidden rounded-xl border"
                            style={{ borderColor: "var(--border)" }}
                          >
                            <div
                              className="absolute inset-y-0 left-0"
                              style={{ width: `${pct}%`, background: "var(--accent)" }}
                              aria-hidden="true"
                            />
                            <div className="relative flex justify-between px-3 py-2 text-sm font-medium">
                              <span>{option.text}</span>
                              <span className="tnum">{pct}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-xs wc-muted">
                      <span className="tnum">{poll.totalVotes}</span> votes ·{" "}
                      {poll.visibility === "ANONYMOUS" ? "anonymous" : "public"}
                    </div>
                    {poll.isActive && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-3"
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

          <section className="wc-card wc-card-pad">
            <h2 className="mb-3 flex items-center gap-2 font-extrabold">
              <Pin className="h-4 w-4 text-gold" aria-hidden="true" />
              Pinned topic
            </h2>
            {pinnedTopic && (
              <div
                className="mb-3 rounded-xl px-3 py-2 text-sm font-medium"
                style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
              >
                {pinnedTopic}
              </div>
            )}
            <form
              className="grid gap-3"
              noValidate
              onSubmit={pinForm.handleSubmit((values) => pinMutation.mutate(values))}
            >
              <Label htmlFor="studio-pin-text" className="sr-only">
                Pinned topic text
              </Label>
              <Textarea
                id="studio-pin-text"
                rows={3}
                placeholder="What should listeners talk about?"
                aria-invalid={Boolean(pinAlert)}
                {...pinForm.register("text")}
              />
              <div className="flex min-h-11 items-center gap-3">
                <Controller
                  control={pinForm.control}
                  name="expiresAtEpisodeEnd"
                  render={({ field }) => (
                    <Switch
                      id="studio-pin-auto-expire"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2"
                    />
                  )}
                />
                <Label htmlFor="studio-pin-auto-expire" className="text-sm font-medium">
                  Auto-expire when the episode ends
                </Label>
              </div>
              <FormAlert message={pinAlert} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={pinMutation.isPending}>
                  Set pinned topic
                </Button>
                {pinnedTopic && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      pinMutation.mutate({
                        text: "",
                        expiresAtEpisodeEnd: pinForm.getValues("expiresAtEpisodeEnd"),
                      })
                    }
                    disabled={pinMutation.isPending}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </form>
          </section>

          <section className="wc-card wc-card-pad">
            <h2 className="mb-3 flex items-center gap-2 font-extrabold">
              <Flame className="h-4 w-4 text-gold" aria-hidden="true" />
              Hype
            </h2>
            <div className="flex h-12 items-end gap-1" aria-hidden="true">
              {barHeights.map((height, index) => (
                <span
                  key={index}
                  className="flex-1 animate-pulse rounded-sm"
                  style={{
                    height: `${height}%`,
                    background: "linear-gradient(180deg, var(--gold), var(--maroon))",
                    animationDelay: `${index * 90}ms`,
                  }}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="font-extrabold tnum" style={{ color: "var(--gold)" }}>
                {hype.count}
              </span>
              <span className="wc-pill wc-pill-neutral">Trend: {hype.trend}</span>
            </div>
            <p className="wc-help mt-1">Live reactions — the meter climbs as listeners tap 🔥❤️👏.</p>
          </section>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <ChatCard
            messages={messages}
            feedRef={feedRef}
            chatForm={chatForm}
            chatAlert={chatAlert}
            onSubmit={(values) => boothChatMutation.mutate(values)}
            isPending={boothChatMutation.isPending}
            showName={showName}
          />
        </aside>
      </div>
    </main>
  );
}

function ChatCard({
  messages,
  feedRef,
  chatForm,
  chatAlert,
  onSubmit,
  isPending,
  showName,
}: {
  messages: ChatMessageResponseDto[];
  feedRef: RefObject<HTMLDivElement | null>;
  chatForm: ReturnType<typeof useForm<ChatForm>>;
  chatAlert: string | null;
  onSubmit: (values: ChatForm) => void;
  isPending: boolean;
  showName: string | null;
}) {
  const boothLabel = showName ?? "Booth";
  return (
    <section className="wc-card wc-card-pad flex max-h-[70vh] flex-col">
      <h2 className="mb-3 flex items-center gap-2 font-extrabold">
        <MessageCircle className="h-4 w-4 text-gold" aria-hidden="true" />
        Chat
      </h2>
      <div ref={feedRef} className="wc-chatfeed hide-scrollbar flex-1 overflow-y-auto" style={{ minHeight: 240 }}>
        {messages.length === 0 ? (
          <p className="text-sm wc-muted">No messages yet — listener chat will appear here live.</p>
        ) : (
          messages.map((message) =>
            message.asBooth ? (
              <div key={message.id} className="wc-msg booth">
                <div className="who">🎙 {boothLabel}</div>
                <div className="body">{message.content}</div>
              </div>
            ) : (
              <div key={message.id} className="wc-msg">
                <div className="who">
                  <span className="name">@{message.author?.handle ?? "listener"}</span>
                </div>
                <div className="body">{message.content}</div>
              </div>
            ),
          )
        )}
      </div>

      <form
        className="mt-3 border-t border-border pt-3"
        noValidate
        onSubmit={chatForm.handleSubmit(onSubmit)}
      >
        <div className="mb-2 flex items-center gap-1.5 text-xs wc-muted">
          Posting as
          <span className="wc-chip text-[.65rem] py-0.5">🎙 {boothLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="studio-chat-content" className="sr-only">
            Booth message
          </Label>
          <Input
            id="studio-chat-content"
            className="flex-1"
            placeholder="Say something to the booth…"
            aria-invalid={Boolean(chatAlert)}
            {...chatForm.register("content")}
          />
          <Button type="submit" variant="maroon" size="icon" disabled={isPending} aria-label="Post as booth">
            <Send className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
        <div className="mt-2">
          <FormAlert message={chatAlert} />
        </div>
      </form>
    </section>
  );
}
