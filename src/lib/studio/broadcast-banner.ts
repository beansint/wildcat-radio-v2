/**
 * live-path-hardening (#127) — the kiosk's broadcast line.
 *
 * The kiosk used to say "On air" whenever an episode was open, even while
 * listeners heard station rotation because the encoder had dropped. It now
 * shows what the stream actually reports (manifest / `stream:status`), and on
 * a stale encoder counts down to the server's auto-end (`autoEndsAt`).
 */
export type KioskStreamStatus = "LIVE" | "STATION_ROTATION" | "OFF_AIR";

export interface KioskBroadcastInput {
  /** null = status unknown (manifest unavailable). */
  status: KioskStreamStatus | null;
  reason: string | null;
  autoEndsAt: string | null;
  episodeOpen: boolean;
  showName: string | null;
}

export type KioskBannerKind = "live" | "encoder-offline" | "rotation" | "off-air" | "unknown";

export interface KioskBanner {
  kind: KioskBannerKind;
  label: string;
}

const ENCODER_STALE_REASONS = new Set(["SOURCE_STALE", "SEGMENT_STALE"]);

/** Milliseconds → `m:ss`, rounding up so "0:00" only shows at the deadline. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1_000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function kioskBroadcastBanner(input: KioskBroadcastInput, now: number): KioskBanner | null {
  const { status, reason, autoEndsAt, episodeOpen, showName } = input;
  if (status === "LIVE") return { kind: "live", label: `On air${showName ? ` · ${showName}` : ""}` };
  if (!episodeOpen) return null;
  if (status === null) return { kind: "unknown", label: "Broadcast status unavailable" };
  if (status === "STATION_ROTATION" && reason && ENCODER_STALE_REASONS.has(reason)) {
    const endsAt = autoEndsAt ? Date.parse(autoEndsAt) : NaN;
    const base = "Encoder offline — listeners hear rotation";
    return {
      kind: "encoder-offline",
      label: Number.isNaN(endsAt) ? base : `${base}; show auto-ends in ${formatCountdown(endsAt - now)}`,
    };
  }
  if (status === "OFF_AIR") return { kind: "off-air", label: "Off air — listeners hear nothing" };
  return { kind: "rotation", label: "Not on air — listeners hear rotation" };
}
