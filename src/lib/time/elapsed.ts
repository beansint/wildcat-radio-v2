/**
 * Pure elapsed-time formatting for the `/studio` kiosk header's per-DJ
 * time-in chips (FE#46), e.g. `studio-console.html`'s `<span class="tnum">2:03</span>`
 * next to "✓ Mara". Split out from `src/lib/time/station.ts` because it isn't
 * station-timezone-specific — it's just "how long ago was this UTC instant",
 * independent of the station's fixed UTC offset.
 */

/** UTC instant (ISO) + "now" (epoch ms) -> "H:MM" elapsed, clamped at 0. */
export function elapsedHhmm(sinceIso: string, nowMs: number): string {
  const sinceMs = new Date(sinceIso).getTime();
  const totalMinutes = Math.max(0, Math.floor((nowMs - sinceMs) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}
