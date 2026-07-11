/**
 * Station-local time helpers.
 *
 * The backend treats attendance times (and everything else "today"-shaped —
 * scheduled shows, episode start/end) in station-local time, which is a
 * fixed UTC offset (Manila, UTC+8 — no DST, so a plain constant works). The
 * frontend must match: attendance corrections are entered as a station-local
 * date + HH:MM and need to become the *station's* midnight-relative instant,
 * not the browser's local midnight, or a correction near midnight rolls to
 * the wrong day for any user outside Manila's timezone. Likewise, displaying
 * a UTC instant with `toLocaleTimeString()` shows the *browser's* local
 * clock, not the station's — station-local rendering needs this file too.
 */

export const STATION_OFFSET_MIN = Number.parseInt(
  process.env.NEXT_PUBLIC_STATION_UTC_OFFSET_MINUTES ?? "480",
  10,
);

/** station-local 'YYYY-MM-DD' + 'HH:MM' -> UTC ISO string */
export function stationLocalToUtcISO(dateISO: string, hhmm: string): string {
  const [y, mo, d] = dateISO.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - STATION_OFFSET_MIN * 60000).toISOString();
}

/** UTC instant/ISO -> station-local 'HH:MM' */
export function stationHhmm(iso: string | Date): string {
  const t = (typeof iso === "string" ? new Date(iso) : iso).getTime();
  return new Date(t + STATION_OFFSET_MIN * 60000).toISOString().slice(11, 16);
}

/** UTC instant/ISO -> station-local 'YYYY-MM-DD' */
export function stationDate(iso: string | Date): string {
  const t = (typeof iso === "string" ? new Date(iso) : iso).getTime();
  return new Date(t + STATION_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}
