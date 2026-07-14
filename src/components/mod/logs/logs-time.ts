/**
 * `/mod/logs` timestamp rendering. `createdAt` is a UTC instant — render it
 * in station-local time (same reasoning as `src/lib/time/station.ts`: a mod
 * reading the log off-site should see "when it happened at the station",
 * not their own browser's timezone), formatted like the prototype's
 * "Jun 11 · 2:04 PM".
 */
import { stationDate, stationHhmm } from "@/lib/time/station";

export function formatLogTimestamp(iso: string): string {
  const dateStr = stationDate(iso);
  const hhmm = stationHhmm(iso);
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  // Build a Date whose *local* wall-clock fields are the station-local
  // values, purely so `toLocaleDateString`/`toLocaleTimeString` can format
  // them without re-converting timezones (mirrors attendance/page.tsx's
  // formatHhmmDisplay).
  const fake = new Date(y, mo - 1, d, h, mi);
  const datePart = fake.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timePart = fake.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}
