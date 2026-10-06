"use client";

/**
 * #127 — the kiosk's broadcast badge. Shows what listeners actually hear
 * (manifest / `stream:status`), never "On air" just because an episode is
 * open. On a stale encoder it counts down, once a second, to the server's
 * auto-end (`autoEndsAt`).
 */
import { AlertTriangle, Radio, WifiOff } from "lucide-react";
import {
  kioskBroadcastBanner,
  type KioskBroadcastInput,
  type KioskStreamStatus,
} from "@/lib/studio/broadcast-banner";
import { useNow } from "@/lib/time/use-now";

export interface KioskBroadcastStatus {
  /** null = status unknown (status service unavailable). */
  status: KioskStreamStatus | null;
  reason: string | null;
  autoEndsAt: string | null;
}

interface BroadcastBadgeProps {
  broadcast: KioskBroadcastStatus;
  episodeOpen: boolean;
  showName: string | null;
  /** Label override for the LIVE state (the attendance card says "On air now"). */
  liveLabel?: string;
  testid: string;
}

export function BroadcastBadge({ broadcast, episodeOpen, showName, liveLabel, testid }: BroadcastBadgeProps) {
  const counting = Boolean(broadcast.autoEndsAt) && broadcast.status !== "LIVE";
  const now = useNow(counting ? 1_000 : null);
  const input: KioskBroadcastInput = { ...broadcast, episodeOpen, showName };
  const banner = kioskBroadcastBanner(input, now);
  if (!banner) return null;

  if (banner.kind === "live") {
    return (
      <span className="wc-badge-live text-[.6rem] py-0.5" data-testid={testid} data-kind="live">
        <span className="dot" />
        {liveLabel ?? banner.label}
      </span>
    );
  }
  const Icon = banner.kind === "encoder-offline" ? AlertTriangle : banner.kind === "unknown" ? WifiOff : Radio;
  return (
    <span
      className={`wc-pill ${banner.kind === "encoder-offline" || banner.kind === "unknown" ? "wc-pill-warn" : "wc-pill-neutral"} tnum`}
      data-testid={testid}
      data-kind={banner.kind}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {banner.label}
    </span>
  );
}
