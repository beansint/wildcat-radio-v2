"use client";

import type { StrikeDto } from "@/lib/api/model";
import { StatusPill } from "@/components/mod/status-pill";
import { cn } from "@/lib/utils";
import { formatDate, formatShortDate, isFuture } from "./format";

interface StrikeHistoryCardProps {
  strikes: StrikeDto[];
}

/** "Strike history" card — prototype: listener/standing.html. */
export function StrikeHistoryCard({ strikes }: StrikeHistoryCardProps) {
  // Most-recent first, matching how a listener would want to scan their history.
  const sorted = [...strikes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="wc-card mb-4" data-testid="standing-history">
      <div className="wc-card-pad border-b" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-lg font-extrabold">Strike history</h2>
      </div>

      {sorted.length === 0 ? (
        <p className="wc-card-pad wc-help mb-0" data-testid="standing-empty">
          No strikes — you&apos;re in good standing.
        </p>
      ) : (
        <div className="divide-y">
          {sorted.map((strike) => {
            const expired = !isFuture(strike.expiresAt);
            return (
              <div
                key={strike.id}
                className="wc-card-pad flex items-center gap-3"
                data-testid="standing-history-row"
              >
                <span
                  className={cn(
                    "text-xl font-extrabold w-7 tnum flex-none",
                    expired ? "wc-muted" : "text-maroon",
                  )}
                >
                  {strike.level}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{strike.reason}</div>
                  <div className="text-sm wc-muted tnum">{formatDate(strike.createdAt)}</div>
                </div>
                {expired ? (
                  <StatusPill variant="neutral">Expired</StatusPill>
                ) : (
                  <StatusPill variant="warn">Expires {formatShortDate(strike.expiresAt)}</StatusPill>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
