"use client";

import { BarChart3 } from "lucide-react";
import { useState } from "react";
import type { PollResponseDto } from "@/lib/api/model";
import { getApiErrorMessage } from "@/lib/api/error-message";

interface InlinePollProps {
  polls: PollResponseDto[];
  selectedOptions: Record<string, string>;
  onVote: (input: { pollId: string; optionId: string }) => Promise<unknown>;
  votePending: boolean;
  voteError: string | null;
  loading: boolean;
  error: string | null;
  disabled: boolean;
}

export function InlinePoll({
  polls,
  selectedOptions,
  onVote,
  votePending,
  voteError,
  loading,
  error,
  disabled,
}: InlinePollProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const poll = polls.find((item) => item.isActive) ?? polls[0];
  const selected = poll ? selectedOptions[poll.id] : undefined;

  async function handleVote(optionId: string) {
    if (!poll || disabled || votePending) return;
    setLocalError(null);
    try {
      await onVote({ pollId: poll.id, optionId });
    } catch (err) {
      setLocalError(getApiErrorMessage(err));
    }
  }

  return (
    <div
      className="wc-card wc-card-pad my-1"
      style={{ borderColor: "var(--maroon)" }}
      data-testid="engagement-poll"
    >
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-4 h-4 text-maroon" aria-hidden="true" />
        <span className="font-bold text-sm">Live poll · booth</span>
      </div>

      {loading ? (
        <div className="wc-muted text-sm">Loading poll...</div>
      ) : !poll ? (
        <div className="wc-muted text-sm">No live poll right now.</div>
      ) : (
        <>
          <div className="font-semibold mb-2">{poll.question}</div>
          {poll.options.map((option) => {
            const pct = poll.totalVotes > 0 ? Math.round((option.voteCount / poll.totalVotes) * 100) : 0;
            const isSelected = selected === option.id;
            return (
              <button
                key={option.id}
                className="w-full text-left mb-2 relative rounded-xl overflow-hidden border disabled:cursor-not-allowed"
                style={{ borderColor: isSelected ? "var(--maroon)" : "var(--border)" }}
                aria-label={`Vote for ${option.text} (${pct}%)`}
                aria-pressed={isSelected}
                disabled={disabled || votePending || !poll.isActive}
                onClick={() => handleVote(option.id)}
                data-testid="engagement-poll-option"
              >
                <div
                  className="absolute inset-y-0 left-0"
                  style={{ width: `${pct}%`, background: isSelected ? "var(--accent)" : "var(--muted)" }}
                />
                <div className="relative flex justify-between px-3 py-2 text-sm font-medium">
                  <span>{option.text}</span>
                  <span className="tnum">{pct}%</span>
                </div>
              </button>
            );
          })}
          <div className="text-xs wc-muted mt-2">
            {poll.isActive ? "Tap to vote" : "Poll closed"} · {poll.totalVotes} votes · {poll.visibility.toLowerCase()}
          </div>
        </>
      )}

      {(error || voteError || localError) && (
        <div role="alert" className="mt-2 text-xs font-semibold text-destructive">
          {localError ?? voteError ?? error}
        </div>
      )}
    </div>
  );
}
