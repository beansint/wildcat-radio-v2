/**
 * live-path-hardening (#127) — which occurrence is "Up now" on the kiosk.
 *
 * Previously derived from `todayQuery.dataUpdatedAt` (frozen on a fetch error
 * or a background tab) and counted DONE as "Up now". Pure: the caller passes a
 * ticking clock.
 *
 * Priority: ON_AIR → the open episode's row → a SCHEDULED / DELAYED /
 * PENDING_HANDOVER slot whose effective window contains now → an ENDED_EARLY
 * slot whose window contains now (flagged, so the kiosk can invite a re-time-in).
 * DONE / CANCELLED / HIATUS are never "Up now".
 */
import type { StudioTodayDto, StudioTodayShowDto } from "@/lib/api/model";

export interface ActiveSlot {
  show: StudioTodayShowDto;
  endedEarly: boolean;
}

const UPCOMING = new Set<string>(["SCHEDULED", "DELAYED", "PENDING_HANDOVER"]);

function inWindow(show: StudioTodayShowDto, now: number): boolean {
  return Date.parse(show.effectiveStart) <= now && now < Date.parse(show.effectiveEnd);
}

export function pickActiveSlot(today: StudioTodayDto | undefined | null, now: number): ActiveSlot | null {
  if (!today) return null;
  const shows = today.todayShows;
  const onAir = shows.find((s) => s.status === "ON_AIR");
  if (onAir) return { show: onAir, endedEarly: false };
  const episodeId = today.episode?.id;
  if (episodeId) {
    const open = shows.find((s) => s.id === episodeId && s.status !== "DONE");
    if (open) return { show: open, endedEarly: false };
  }
  const upcoming = shows.find((s) => UPCOMING.has(s.status) && inWindow(s, now));
  if (upcoming) return { show: upcoming, endedEarly: false };
  const ended = shows.find((s) => s.status === "ENDED_EARLY" && inWindow(s, now));
  return ended ? { show: ended, endedEarly: true } : null;
}
