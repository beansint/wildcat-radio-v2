/**
 * Pure Time x Day grid builder for `/mod/schedule` and the public `/schedule`
 * page (FE#5 Task 12/15). Two entry points:
 *
 * - `toDaypartGrid(scheduleDto)` — maps a `ScheduleDto` (the shape returned
 *   by the public `GET /api/schedule`) into daypart rows, one per distinct
 *   start/end time slot, with one cell per weekday.
 * - `buildScheduleFromShows(shows)` — a client-side mirror of the backend's
 *   `buildWeeklyGrid` (wildcat-radio-v2-backend/apps/api/src/shows/schedule.ts)
 *   that buckets the mod-only `GET /api/shows` list (which includes
 *   ONE_TIME shows and full roster/cadence detail) into the same
 *   `ScheduleDto` shape, so `/mod/schedule` can share one grid pipeline with
 *   the public page while still carrying the show id needed to open the
 *   edit dialog. ONE_TIME shows are excluded from the weekly grid — same
 *   rule as the backend.
 */
import type { Weekday, Cadence } from "../mod/types";

export const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export interface ScheduleShowCell {
  id: string;
  name: string;
  /** HH:MM */
  start: string;
  /** HH:MM */
  end: string;
  roster: string[];
}

export interface ScheduleDayRow {
  day: Weekday;
  shows: ScheduleShowCell[];
}

export interface ScheduleDto {
  days: ScheduleDayRow[];
}

export interface DaypartRow {
  /** e.g. "1–4 PM" */
  label: string;
  start: string;
  end: string;
  cells: Record<Weekday, ScheduleShowCell | null>;
}

export interface DaypartGrid {
  rows: DaypartRow[];
}

function formatHour(hhmm: string): { h12: number; suffix: "AM" | "PM" } {
  const h = parseInt(hhmm.slice(0, 2), 10);
  const suffix: "AM" | "PM" = h < 12 ? "AM" : "PM";
  const h12raw = h % 12;
  return { h12: h12raw === 0 ? 12 : h12raw, suffix };
}

export function daypartLabel(start: string, end: string): string {
  const s = formatHour(start);
  const e = formatHour(end);
  if (s.suffix === e.suffix) return `${s.h12}–${e.h12} ${e.suffix}`;
  return `${s.h12} ${s.suffix}–${e.h12} ${e.suffix}`;
}

export function toDaypartGrid(schedule: ScheduleDto): DaypartGrid {
  const slotMap = new Map<string, { start: string; end: string }>();
  for (const day of schedule.days) {
    for (const show of day.shows) {
      slotMap.set(`${show.start}-${show.end}`, { start: show.start, end: show.end });
    }
  }

  const slots = [...slotMap.values()].sort((a, b) => a.start.localeCompare(b.start));

  const rows: DaypartRow[] = slots.map(({ start, end }) => {
    const cells = {} as Record<Weekday, ScheduleShowCell | null>;
    for (const weekday of WEEKDAYS) {
      const dayRow = schedule.days.find((d) => d.day === weekday);
      cells[weekday] = dayRow?.shows.find((s) => s.start === start && s.end === end) ?? null;
    }
    return { label: daypartLabel(start, end), start, end, cells };
  });

  return { rows };
}

export interface ScheduleSourceShow {
  id: string;
  name: string;
  cadence: Cadence;
  roster: { displayName: string }[];
}

export function buildScheduleFromShows(shows: ScheduleSourceShow[]): ScheduleDto {
  const days: ScheduleDayRow[] = WEEKDAYS.map((day) => ({ day, shows: [] }));

  for (const show of shows) {
    const cadence = show.cadence;
    if (!cadence || cadence.kind !== "WEEKLY" || !cadence.days) continue;
    const cell: ScheduleShowCell = {
      id: show.id,
      name: show.name,
      start: cadence.start,
      end: cadence.end,
      roster: show.roster.map((r) => r.displayName),
    };
    for (const day of cadence.days) {
      const bucket = days.find((d) => d.day === day);
      bucket?.shows.push(cell);
    }
  }

  for (const day of days) day.shows.sort((a, b) => a.start.localeCompare(b.start));

  return { days };
}
