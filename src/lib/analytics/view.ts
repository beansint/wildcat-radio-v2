import type { AnalyticsDaypartDto, AnalyticsShowRankDto } from "@/lib/api/model";

/**
 * Pure view helpers for /mod/analytics. No React, no fetching — the shaping
 * that turns API rows into what the prototype's charts draw.
 */

/** Asia/Manila — matches the backend's own daypart bucketing offset. */
const STATION_UTC_OFFSET_MINUTES = 8 * 60;

/** Weekday columns as the prototype orders them: Monday first, not Sunday. */
export const HEATMAP_WEEKDAYS = [
  { label: "Mon", weekday: 1 },
  { label: "Tue", weekday: 2 },
  { label: "Wed", weekday: 3 },
  { label: "Thu", weekday: 4 },
  { label: "Fri", weekday: 5 },
  { label: "Sat", weekday: 6 },
  { label: "Sun", weekday: 0 },
] as const;

/**
 * Two-hour rows. The design basis draws 8a-6p, which is the station's usual
 * day, and that stays the default — but the rows are DERIVED, not fixed.
 *
 * A fixed 8a-6p grid silently deleted every broadcast outside it, and then
 * `peakSlot` ran over the surviving cells and printed a confident "Peak: ..."
 * that was simply wrong. The prototype's own example ranking includes a
 * late-night show ("Late Lib Lo-fi"), so this is the normal case, not an edge
 * one. A panel whose whole job is to say *when to schedule* must not hide the
 * hours the station actually broadcast in.
 */
export const DEFAULT_HEATMAP_HOURS = [8, 10, 12, 14, 16, 18] as const;

/** Two-hour row label: 0 -> "12a", 8 -> "8a", 14 -> "2p". */
export function rowLabel(hour: number): string {
  const suffix = hour < 12 ? "a" : "p";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${suffix}`;
}

/** Snap an hour to the two-hour band that contains it. */
function rowFor(hour: number): number {
  return Math.floor(hour / 2) * 2;
}

/** The rows to draw: the default day plus any band the station actually used. */
export function heatmapRows(
  dayparts: readonly AnalyticsDaypartDto[],
): { label: string; hour: number }[] {
  const hours = new Set<number>(DEFAULT_HEATMAP_HOURS);
  for (const slot of dayparts) hours.add(rowFor(slot.hour));
  return [...hours].sort((a, b) => a - b).map((hour) => ({ label: rowLabel(hour), hour }));
}

export interface HeatCell {
  weekday: number;
  hour: number;
  /** null when the station has never broadcast in this slot. */
  avgConcurrent: number | null;
  /** 0..1 against the busiest slot in the grid; 0 when never broadcast. */
  intensity: number;
}

/**
 * Fold the daypart rows into the fixed grid the prototype draws.
 *
 * A slot the API omits means *we have never broadcast then* — kept as `null`
 * rather than coerced to 0, because a zero-intensity cell and an
 * "we-don't-air-then" cell are different facts and the legend says so. The API
 * deliberately omits empty slots for the same reason.
 *
 * Rows are two-hourly, so a slot covers `hour` and `hour + 1`; an episode at
 * 15:00 belongs to the 2p row.
 */
export function buildHeatmap(dayparts: readonly AnalyticsDaypartDto[]): HeatCell[] {
  const byKey = new Map<string, { weighted: number; episodes: number }>();
  for (const slot of dayparts) {
    const key = `${slot.weekday}:${rowFor(slot.hour)}`;
    const entry = byKey.get(key) ?? { weighted: 0, episodes: 0 };
    // Weighted by episode count, not a flat mean of the two hours. An hour with
    // one episode averaging 200 and an hour with nine averaging 20 is a row
    // average of 38, not 110 — and the unweighted version would then have
    // crowned that row the peak.
    entry.weighted += slot.avgConcurrent * slot.episodeCount;
    entry.episodes += slot.episodeCount;
    byKey.set(key, entry);
  }

  const averages = new Map<string, number>();
  for (const [key, { weighted, episodes }] of byKey) {
    averages.set(key, episodes === 0 ? 0 : weighted / episodes);
  }
  const peak = Math.max(0, ...averages.values());

  const cells: HeatCell[] = [];
  for (const row of heatmapRows(dayparts)) {
    for (const col of HEATMAP_WEEKDAYS) {
      const key = `${col.weekday}:${row.hour}`;
      const avg = averages.get(key);
      cells.push({
        weekday: col.weekday,
        hour: row.hour,
        avgConcurrent: avg ?? null,
        intensity: avg === undefined || peak === 0 ? 0 : avg / peak,
      });
    }
  }
  return cells;
}

/** The prototype prints the number only on strong cells; weak ones stay bare. */
export const HEAT_LABEL_THRESHOLD = 0.6;

/** Busiest slot, for the caption under the heatmap. */
export function peakSlot(cells: readonly HeatCell[]): HeatCell | null {
  const broadcast = cells.filter((c) => c.avgConcurrent !== null);
  if (broadcast.length === 0) return null;
  return broadcast.reduce((best, c) =>
    (c.avgConcurrent as number) > (best.avgConcurrent as number) ? c : best,
  );
}

export function weekdayLabel(weekday: number): string {
  return HEATMAP_WEEKDAYS.find((d) => d.weekday === weekday)?.label ?? String(weekday);
}

export function hourLabel(hour: number): string {
  return rowLabel(hour);
}

export interface ScatterPoint {
  showId: string;
  name: string;
  /**
   * Average concurrent listeners — NOT reach. It measures simultaneity: a
   * 30-minute show with 100 listeners all present and a 3-hour show with 500
   * rotating through can sit at the same x. Named `audience` so no caller can
   * read it as a reach figure.
   */
  audience: number;
  engagement: number;
  episodeCount: number;
}

/**
 * Shows as scatter points: reach on x, engagement on y, dot size by episode
 * count. `avgConcurrent` stands in for reach on this axis because the ranking
 * row carries averages rather than a period total.
 */
export function buildScatter(shows: readonly AnalyticsShowRankDto[]): ScatterPoint[] {
  return shows
    // The API's synthetic "Unscheduled" row (showId: null) is a bucket, not a
    // show. Plotting it invited the caption to advise "review the slot" about a
    // slot that does not exist.
    .filter((s): s is AnalyticsShowRankDto & { showId: string } => s.showId !== null)
    .map((s) => ({
      showId: s.showId,
      name: s.name,
      audience: s.avgConcurrent,
      engagement: s.avgEngagement,
      episodeCount: s.episodeCount,
    }));
}

/**
 * The prototype calls out a hit (top-right) and a sleeper (bottom-left).
 * With fewer than two shows there is nothing to contrast, so it says nothing
 * rather than labelling a single show both.
 */
export function hitAndSleeper(points: readonly ScatterPoint[]): {
  hit: ScatterPoint | null;
  sleeper: ScatterPoint | null;
} {
  if (points.length < 2) return { hit: null, sleeper: null };

  // Each axis is normalised to 0..1 before they are combined. Adding raw
  // listeners to raw engagement actions adds different units, and whichever has
  // the wider range silently becomes the only one that counts — a show with 200
  // concurrent and ZERO engagement was being announced as "high on both".
  const maxAudience = Math.max(...points.map((p) => p.audience), 0);
  const maxEngagement = Math.max(...points.map((p) => p.engagement), 0);
  const score = (p: ScatterPoint) =>
    (maxAudience === 0 ? 0 : p.audience / maxAudience) +
    (maxEngagement === 0 ? 0 : p.engagement / maxEngagement);

  const sorted = [...points].sort((a, b) => score(b) - score(a));
  return { hit: sorted[0], sleeper: sorted[sorted.length - 1] };
}

/** Thousands separators for the stat cards, which use `tnum`. */
export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** One decimal, but only when it says something. */
export function formatDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString("en-US")
    : rounded.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export type PeriodKey = "p30" | "psem" | "pcustom";

/**
 * The period presets. `from`/`to` are what the API takes; the semester window
 * is a rolling ~18 weeks, which is close enough to a CIT-U term to be useful
 * without pretending to know the academic calendar.
 */
export function periodRange(key: PeriodKey, now: Date): { from: string; to: string } {
  const to = now;
  const days = key === "psem" ? 126 : 30;
  const from = new Date(to.getTime() - days * 86_400_000);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

/**
 * The calendar date **at the station**, not in UTC.
 *
 * `toISOString().slice(0,10)` in Manila (UTC+8) returns yesterday's date every
 * morning before 08:00, so "Last 30 days" quietly dropped today and yesterday,
 * and the To input's `max` refused to let anyone select the current date.
 */
export function toIsoDate(date: Date): string {
  return new Date(date.getTime() + STATION_UTC_OFFSET_MINUTES * 60_000)
    .toISOString()
    .slice(0, 10);
}
