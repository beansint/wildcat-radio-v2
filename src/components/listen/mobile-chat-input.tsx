"use client";

import { Plus, Send } from "lucide-react";
import { useState } from "react";
import type { SheetTab } from "./engagement-tiles";
import { useEngagementGate, EngagementGateNotice } from "./engagement-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/api/error-message";

interface MobileChatInputProps {
  onOpenSheet: (tab: SheetTab) => void;
  onSend: (text: string) => Promise<void>;
  onReact: () => Promise<unknown>;
  reacting: boolean;
}

export function MobileChatInput({ onOpenSheet, onSend, onReact, reacting }: MobileChatInputProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const gate = useEngagementGate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text || sending) return;
    setError(null);
    setSending(true);
    try {
      await onSend(text);
      setValue("");
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSending(false);
    }
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
          <Button
            type="button"
            size="icon"
            onClick={() => onOpenSheet("req")}
            aria-label="Request, dedication, or Q&A"
          >
            <Plus className="w-5 h-5" aria-hidden="true" />
          </Button>
          <Input
            className="flex-1"
            placeholder="Say something to the booth…"
            aria-label="Chat message"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            data-testid="listen-chat-input"
            disabled={sending}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="React fire"
            disabled={reacting}
            onClick={() => {
              setError(null);
              onReact().catch((err) => setError(getApiErrorMessage(err)));
            }}
          >
            <span aria-hidden="true">🔥</span>
          </Button>
          <Button
            type="submit"
            variant="maroon"
            size="icon"
            aria-label="Send"
            disabled={sending}
          >
            <Send className="w-5 h-5" aria-hidden="true" />
          </Button>
          {error && <div role="alert" className="sr-only">{error}</div>}
        </form>
      )}
    </div>
  );
}
