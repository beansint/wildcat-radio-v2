"use client";

import { VolumeX, Check } from "lucide-react";
import type { MeStandingDto, StrikeDto } from "@/lib/api/model";
import { StatusPill } from "@/components/mod/status-pill";
import { formatDateTime } from "./format";

interface StatusSummaryCardProps {
  standing: MeStandingDto;
  activeStrikes: StrikeDto[];
}

/**
 * "Status summary" card — prototype: listener/standing.html.
 * Shows a Muted/Banned pill (or Active if neither), the current strike
 * context chip, the big "N of 3 strikes" stat, and the recovery helper copy.
 */
export function StatusSummaryCard({ standing, activeStrikes }: StatusSummaryCardProps) {
  const isMuted = !!standing.mutedUntil;
  const isBanned = !!standing.bannedAt;

  // The most recently-issued *active* strike drives the "Strike n · reason"
  // context chip — it's the strike a mute/ban would most plausibly stem from.
  const latestActiveStrike = [...activeStrikes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];

  return (
    <div className="wc-card wc-card-pad mb-4" data-testid="standing-status">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        {isBanned ? (
          <StatusPill variant="bad">Banned</StatusPill>
        ) : isMuted ? (
          <StatusPill variant="warn" testid="standing-mute-pill">
            <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
            Muted until {formatDateTime(standing.mutedUntil as string)}
          </StatusPill>
        ) : (
          <StatusPill variant="ok">
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
            Active
          </StatusPill>
        )}

        {latestActiveStrike && (
          <span className="wc-chip-ghost">
            Strike {latestActiveStrike.level} · {latestActiveStrike.reason}
          </span>
        )}
      </div>

      <div className="text-3xl font-extrabold" data-testid="standing-strike-count">
        {activeStrikes.length} <span className="wc-muted">of</span> 3{" "}
        <span className="wc-muted">strikes</span>
      </div>

      {isBanned && standing.banReason && (
        <p className="wc-help mt-1">{standing.banReason}</p>
      )}
      {!isBanned && isMuted && standing.muteReason && (
        <p className="wc-help mt-1">{standing.muteReason}</p>
      )}

      <p className="wc-help">
        A third strike results in a ban. Strikes expire automatically over time — keep it kind
        in chat and you&apos;ll recover.
      </p>
    </div>
  );
}
