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

import type { Weekday } from "../mod/types";

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

/**
 * `/studio` kiosk header's date display (FE#46), e.g. "Tuesday, June 10,
 * 2026" (`studio-console.html` line 30). Same station-local-shift technique
 * as `stationHhmm`/`stationDate` — shift the instant by the fixed station
 * offset, then read it back out with `timeZone: "UTC"` so the *shifted*
 * instant's UTC calendar fields are what render, not the browser's own
 * timezone reinterpreting them a second time.
 */
const STATION_LONG_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** UTC instant/ISO -> station-local long date, e.g. "Tuesday, June 10, 2026" */
export function stationLongDate(iso: string | Date): string {
  const t = (typeof iso === "string" ? new Date(iso) : iso).getTime();
  return STATION_LONG_DATE_FORMATTER.format(new Date(t + STATION_OFFSET_MIN * 60000));
}

const WEEKDAY_BY_UTC_DAY: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * UTC instant/ISO -> station-local weekday code (`"MON"`..`"SUN"`), for the
 * public `/schedule` page's "today" chip and on-air badge (FE#42). Same
 * shift-then-read-UTC-fields technique as `stationDate`/`stationLongDate` —
 * never derive this from the browser's own `Date#getDay()`.
 */
export function stationWeekday(iso: string | Date = new Date()): Weekday {
  const t = (typeof iso === "string" ? new Date(iso) : iso).getTime();
  return WEEKDAY_BY_UTC_DAY[new Date(t + STATION_OFFSET_MIN * 60000).getUTCDay()];
}
