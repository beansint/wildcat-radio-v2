"use client";

import { Plus, Send } from "lucide-react";
import { useState } from "react";
import type { SheetTab } from "./engagement-tiles";
import { useEngagementGate, EngagementGateNotice } from "./engagement-gate";

interface MobileChatInputProps {
  onOpenSheet: (tab: SheetTab) => void;
  onSend: (text: string) => void;
}

export function MobileChatInput({ onOpenSheet, onSend }: MobileChatInputProps) {
  const [value, setValue] = useState("");
  const gate = useEngagementGate();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue("");
  }

  return (
    <div
      className="sticky bottom-0 z-30 border-t lg:hidden"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      {gate !== 'ok' ? (
        <div className="wc-container py-2">
          <EngagementGateNotice gate={gate} next="/listen" />
        </div>
      ) : (
        <form
          className="wc-container py-2 flex items-center gap-2"
          onSubmit={handleSubmit}
          aria-label="Chat input"
        >
          <button
            type="button"
            className="wc-btn wc-btn-primary wc-btn-icon"
            onClick={() => onOpenSheet("req")}
            aria-label="Request, dedication, or Q&A"
          >
            <Plus className="w-5 h-5" aria-hidden="true" />
          </button>
          <input
            className="wc-input flex-1"
            placeholder="Say something to the booth…"
            aria-label="Chat message"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            data-testid="listen-chat-input"
          />
          {/* TODO(M5/M6): wire quick fire react to hype API */}
          <button
            type="button"
            className="wc-btn wc-btn-outline wc-btn-icon"
            aria-label="React fire"
          >
            <span aria-hidden="true">🔥</span>
          </button>
          <button
            type="submit"
            className="wc-btn wc-btn-maroon wc-btn-icon"
            aria-label="Send"
          >
            <Send className="w-5 h-5" aria-hidden="true" />
          </button>
        </form>
      )}
    </div>
  );
}
