"use client";

import { MessagesSquare, Send, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ChatMessage, type ChatMessageProps } from "./chat-message";
import { InlinePoll } from "./inline-poll";
import { useEngagementGate, EngagementGateNotice } from "./engagement-gate";
import { useHydrated } from "@/lib/use-hydrated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PollResponseDto } from "@/lib/api/model";
import { getApiErrorMessage } from "@/lib/api/error-message";

export interface ChatMsg extends ChatMessageProps {
  id: string;
}

interface ChatColumnProps {
  messages: ChatMsg[];
  onSend: (text: string) => Promise<void>;
  listenerCount: number;
  polls: PollResponseDto[];
  selectedOptions: Record<string, string>;
  onVote: (input: { pollId: string; optionId: string }) => Promise<unknown>;
  votePending: boolean;
  voteError: string | null;
  pollsLoading: boolean;
  pollsError: string | null;
  isLive: boolean;
}

export function ChatColumn({
  messages,
  onSend,
  listenerCount,
  polls,
  selectedOptions,
  onVote,
  votePending,
  voteError,
  pollsLoading,
  pollsError,
  isLive,
}: ChatColumnProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const gate = useEngagementGate();
  // Avoid SSR/client hydration mismatch: the gate depends on session data
  // that isn't visible during SSR (cross-origin httpOnly cookie), so the
  // very first client render must match the server's neutral shell. Only
  // reveal the auth-dependent branch (gate notice vs form) after mount.
  const mounted = useHydrated();

  // Scroll to bottom whenever messages array grows
  useEffect(() => {
    const el = feedRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || sending || !isLive) return;
    setSending(true);
    setSendError(null);
    try {
      await onSend(text);
      setInputValue("");
    } catch (error) {
      setSendError(getApiErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      className="wc-card flex flex-col min-h-0 overflow-hidden"
      style={{ background: "var(--card)" }}
      aria-label="Live chat"
    >
      {/* Header */}
      <header
        className="px-4 py-3 border-b flex items-center justify-between"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="font-extrabold flex items-center gap-2">
          <MessagesSquare className="w-[18px] h-[18px] text-maroon" aria-hidden="true" />
          Live chat
        </div>
        {/* TODO(M5/M6): wire listener count from useStream().listeners */}
        <span className="wc-chip-ghost tnum">
          <Users className="w-3.5 h-3.5" aria-hidden="true" />
          {listenerCount}
        </span>
      </header>

      {/* Feed */}
      <div
        id="chatFeed"
        ref={feedRef}
        className="wc-chatfeed flex-1 overflow-y-auto hide-scrollbar p-3"
        style={{ maxHeight: "min(62vh, 560px)" }}
        aria-live="polite"
        aria-relevant="additions"
        data-testid="engagement-chat-feed"
      >
        {messages.length === 0 ? (
          <div className="wc-muted text-sm px-2 py-3">
            Chat will appear here when listeners and the booth post during the episode.
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              name={msg.name}
              time={msg.time}
              body={msg.body}
              variant={msg.variant}
            />
          ))
        )}
        {/* Inline poll placed after messages, matching prototype order */}
        <InlinePoll
          polls={polls}
          selectedOptions={selectedOptions}
          onVote={onVote}
          votePending={votePending}
          voteError={voteError}
          loading={pollsLoading}
          error={pollsError}
          disabled={!isLive || gate !== "ok"}
        />
      </div>

      {/* Desktop-only input - gated */}
      {!mounted ? (
        <div
          className="hidden lg:flex border-t"
          style={{ borderColor: "var(--border)" }}
          aria-hidden="true"
        />
      ) : gate !== 'ok' ? (
        <div
          className="hidden lg:flex border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <EngagementGateNotice gate={gate} next="/listen" />
        </div>
      ) : (
        <form
          className="hidden lg:flex items-center gap-2 p-2.5 border-t"
          style={{ borderColor: "var(--border)" }}
          onSubmit={handleSubmit}
          aria-label="Desktop chat input"
        >
          <Input
            className="flex-1"
            placeholder="Say something to the booth…"
            aria-label="Chat message"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            data-testid="listen-chat-input"
            disabled={sending || !isLive}
          />
          <Button
            type="submit"
            variant="maroon"
            size="icon"
            aria-label="Send"
            disabled={sending || !isLive}
          >
            <Send className="w-5 h-5" aria-hidden="true" />
          </Button>
          {(sendError || !isLive) && (
            <div role="alert" className="sr-only">
              {sendError ?? "No live episode right now."}
            </div>
          )}
        </form>
      )}
    </section>
  );
}
