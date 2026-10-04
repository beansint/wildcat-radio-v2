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

/**
 * Public `/schedule` page only — the owner ruled Mon–Fri (matching the
 * prototype) for the public-facing grid. Deliberately a SEPARATE array from
 * `WEEKDAYS`, which stays all seven days: `WEEKDAYS` is shared with
 * `/mod/schedule`, and narrowing it would silently hide weekend programming
 * from staff. Never use `PUBLIC_WEEKDAYS` for anything mod-facing.
 */
export const PUBLIC_WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];

export interface ScheduleShowCell {
  id: string;
  name: string;
  /**
   * Show slug for `/shows/[slug]` links. Present on the public
   * `GET /api/schedule` payload (`ScheduleShowDto.slug`). Optional because
   * `buildScheduleFromShows` (mod-only, built from `GET /api/shows`) has no
   * use for it — `/mod/schedule` opens an edit dialog by `id` instead.
   */
  slug?: string;
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
  /**
   * Exact clock window plus an overflow index. Legacy duplicate shows get
   * separate rows instead of silently disappearing.
   */
  key: string;
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

/**
 * Minute-precise clock range, e.g. "12:30–2:30 PM" ("12–2 PM" when both ends
 * are on the hour). `daypartLabel` rounds to hours on purpose — it names grid
 * rows — so it must not be used where the minutes are the information, like
 * a delayed occurrence's new time (#106).
 */
export function clockRangeLabel(start: string, end: string): string {
  const fmt = (hhmm: string) => {
    const { h12, suffix } = formatHour(hhmm);
    const mm = hhmm.slice(3, 5);
    return { text: mm === "00" ? `${h12}` : `${h12}:${mm}`, suffix };
  };
  const s = fmt(start);
  const e = fmt(end);
  if (s.suffix === e.suffix) return `${s.text}–${e.text} ${e.suffix}`;
  return `${s.text} ${s.suffix}–${e.text} ${e.suffix}`;
}

export function toDaypartGrid(schedule: ScheduleDto): DaypartGrid {
  const slotMap = new Map<string, { start: string; end: string }>();
  for (const day of schedule.days) {
    for (const show of day.shows) {
      slotMap.set(`${show.start}-${show.end}`, { start: show.start, end: show.end });
    }
  }

  const slots = [...slotMap.values()].sort((a, b) => a.start.localeCompare(b.start));

  const rows: DaypartRow[] = slots.flatMap(({ start, end }) => {
    const matches = Object.fromEntries(WEEKDAYS.map(day => [day,
      schedule.days.find(d => d.day === day)?.shows.filter(s => s.start === start && s.end === end) ?? [],
    ])) as Record<Weekday, ScheduleShowCell[]>;
    const count = Math.max(...WEEKDAYS.map(day => matches[day].length));
    return Array.from({ length: count }, (_, index) => ({
      key: `${start}-${end}:${index}`, label: clockRangeLabel(start, end), start, end,
      cells: Object.fromEntries(WEEKDAYS.map(day => [day, matches[day][index] ?? null])) as Record<Weekday, ScheduleShowCell | null>,
    }));
  });

  return { rows };
}

export type DayItem =
  | { type: "show"; cell: ScheduleShowCell }
  | { type: "gap"; start: string; end: string };

/**
 * Per-day mobile list. Rotation fills actual uncovered time between shows,
 * bounded by the grid's earliest start and latest end. Overlapping legacy
 * shows remain visible and never create a gap inside another show.
 */
export function buildDayItems(grid: DaypartGrid, day: Weekday): DayItem[] {
  if (!grid.rows.length) return [];
  const cells = grid.rows.map(row => row.cells[day]).filter((cell): cell is ScheduleShowCell => !!cell)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const items: DayItem[] = [];
  let cursor = grid.rows.reduce((min, row) => row.start < min ? row.start : min, grid.rows[0].start);
  const end = grid.rows.reduce((max, row) => row.end > max ? row.end : max, grid.rows[0].end);
  for (const cell of cells) {
    if (cursor < cell.start) items.push({ type: "gap", start: cursor, end: cell.start });
    items.push({ type: "show", cell });
    if (cell.end > cursor) cursor = cell.end;
  }
  if (cursor < end) items.push({ type: "gap", start: cursor, end });
  return items;
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
