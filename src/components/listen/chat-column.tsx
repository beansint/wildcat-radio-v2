"use client";

import { MessagesSquare, Send, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ChatMessage, type ChatMessageProps } from "./chat-message";
import { InlinePoll } from "./inline-poll";
import { useEngagementGate, EngagementGateNotice } from "./engagement-gate";

export interface ChatMsg extends ChatMessageProps {
  id: number;
}

interface ChatColumnProps {
  messages: ChatMsg[];
  onSend: (text: string) => void;
  listenerCount: number;
}

export function ChatColumn({ messages, onSend, listenerCount }: ChatColumnProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const gate = useEngagementGate();

  // Scroll to bottom whenever messages array grows
  useEffect(() => {
    const el = feedRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text) return;
    onSend(text);
    setInputValue("");
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
      >
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            name={msg.name}
            time={msg.time}
            body={msg.body}
            variant={msg.variant}
          />
        ))}
        {/* Inline poll placed after messages, matching prototype order */}
        <InlinePoll />
      </div>

      {/* Desktop-only input — gated */}
      {gate !== 'ok' ? (
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
          <input
            className="wc-input flex-1"
            placeholder="Say something to the booth…"
            aria-label="Chat message"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            data-testid="listen-chat-input"
          />
          <button
            type="submit"
            className="wc-btn wc-btn-maroon wc-btn-icon"
            aria-label="Send"
          >
            <Send className="w-5 h-5" aria-hidden="true" />
          </button>
        </form>
      )}
    </section>
  );
}
