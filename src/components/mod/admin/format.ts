/**
 * Pure date formatters for /admin/staff (Staff Review, BEA-184).
 *
 * Deliberately DOM-free and clock-free — both functions are unit-testable
 * with no jsdom (SR-WU-06): `formatRelative` takes "now" as an explicit
 * parameter instead of calling `Date.now()` internally, and `formatJoined`
 * has no notion of "now" at all (it just renders a fixed instant), so
 * neither function is time-of-day flaky.
 *
 * Both are anchored to the STATION's timezone (`NEXT_PUBLIC_STATION_UTC_
 * OFFSET_MINUTES`, default 480 = UTC+8; see `src/lib/time/station.ts`), not
 * the browser's local timezone — same shift-then-read-UTC-fields technique
 * `stationDate`/`stationLongDate` use. A naive `toLocaleDateString()` in the
 * browser's own timezone can silently roll the joined month backward for a
 * viewer west of the station (SR-WU-02).
 */
import { STATION_OFFSET_MIN } from "@/lib/time/station";

const JOINED_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** ISO instant -> station-local "Aug 2025" (staff.html:90). */
export function formatJoined(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  return JOINED_FORMATTER.format(new Date(t + STATION_OFFSET_MIN * 60_000));
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

/**
 * ISO instant (or null) -> "2 hours ago" style relative string
 * (staff.html:91), anchored to the supplied `now` (ms epoch) rather than
 * the wall clock. A future timestamp (clock skew between the API server and
 * the browser) collapses to "just now" rather than "in 2 hours" — never
 * surface negative/future-looking text here.
 */
export function formatRelative(iso: string | null, now: number): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";

  const diffMs = now - then;
  if (diffMs < MINUTE_MS) return "just now"; // covers future timestamps too (diffMs < 0 < MINUTE_MS)

  if (diffMs < HOUR_MS) return plural(Math.floor(diffMs / MINUTE_MS), "minute");
  if (diffMs < DAY_MS) return plural(Math.floor(diffMs / HOUR_MS), "hour");
  if (diffMs < WEEK_MS) return plural(Math.floor(diffMs / DAY_MS), "day");
  return plural(Math.floor(diffMs / WEEK_MS), "week");
}
