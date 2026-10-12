/**
 * FE#132 / BE#195 show-transition copy for the `/studio` kiosk — pure, so the
 * boundary seconds are unit-tested. Spec: backend
 * docs/features/195-show-transitions/feature.md (F1, F4–F7).
 */
import type { ConfirmEndPreviewDto, StudioTodayDto } from "@/lib/api/model";
import { stationHhmm } from "@/lib/time/station";

const MIN = 60_000;
/** The On Air card turns amber this long before the slot ends (F6). */
export const ENDS_SOON_MS = 5 * MIN;

/** UTC instant → station-local "4:00 PM", independent of the browser's timezone. */
export function stationClock(iso: string): string {
  const [h, m] = stationHhmm(iso).split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export type SlotTimingCue = { kind: "ends" | "soon" | "overtime"; label: string };

/** F6: "Ends 4:00 PM" → "Ends in 4:59" (last 5 min) → "Overtime +3 min · B waiting". */
export function slotTimingCue(endIso: string | null, nowMs: number, waitingShow?: string | null): SlotTimingCue | null {
  if (!endIso) return null;
  const left = new Date(endIso).getTime() - nowMs;
  if (left > ENDS_SOON_MS) return { kind: "ends", label: `Ends ${stationClock(endIso)}` };
  if (left > 0) {
    const s = Math.ceil(left / 1000);
    return { kind: "soon", label: `Ends in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` };
  }
  const over = Math.floor(-left / MIN);
  return { kind: "overtime", label: `Overtime +${over} min${waitingShow ? ` · ${waitingShow} waiting` : ""}` };
}

/** F7: how long a DJ has been on — "on 2m", "on 1h 04m". */
export function formatOnFor(sinceIso: string, nowMs: number): string {
  const total = Math.max(0, Math.floor((nowMs - new Date(sinceIso).getTime()) / MIN));
  const h = Math.floor(total / 60);
  return h > 0 ? `on ${h}h ${String(total % 60).padStart(2, "0")}m` : `on ${total}m`;
}

/** F5: "Starts 4:00 PM · in 12 min", or "Waiting to go live" once it's due. */
export function upNextStartLabel(startIso: string, nowMs: number): string {
  const left = new Date(startIso).getTime() - nowMs;
  if (left <= 0) return "Waiting to go live";
  const mins = Math.ceil(left / MIN);
  const inText = mins >= 60 ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m` : `${mins} min`;
  return `Starts ${stationClock(startIso)} · in ${inText}`;
}

/** F4: what to announce when the open episode changes; null when nothing ended. */
export function episodeTransition(
  prev: { id: string; showName: string | null } | null,
  next: { id: string; showName: string | null } | null,
): { ended: string; live: string | null } | null {
  if (!prev || prev.id === next?.id) return null;
  return { ended: prev.showName ?? "Ad-hoc episode", live: next ? next.showName ?? "Ad-hoc episode" : null };
}

/** F1: the preview from a `409 CONFIRM_END_REQUIRED` time-out, else null. */
export function parseConfirmEnd(error: unknown): ConfirmEndPreviewDto | null {
  if (!(error instanceof Error)) return null;
  const match = /^409 [^:]*: ([\s\S]*)$/.exec(error.message);
  if (!match) return null;
  try {
    const body = JSON.parse(match[1]) as { code?: string; preview?: ConfirmEndPreviewDto };
    return body.code === "CONFIRM_END_REQUIRED" && body.preview ? body.preview : null;
  } catch {
    return null;
  }
}

/** The open episode's show name for kiosk copy; null when nothing is open. */
export function openShowName(today: Pick<StudioTodayDto, "episode" | "todayShows"> | undefined): string | null {
  const episode = today?.episode;
  if (!episode) return null;
  if (episode.unscheduled) return "Ad-hoc episode";
  return today.todayShows.find((show) => show.id === episode.id)?.showName ?? "Current show";
}
