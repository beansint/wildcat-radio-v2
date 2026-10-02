/**
 * Today's dated occurrences (#106 / FE#84) layered over the recurring weekly
 * template. The weekly grid (`GET /api/schedule`) is the *template*; what is
 * actually planned today — delays, cancellations — comes from
 * `GET /api/schedule/today`. Pure: callers pass both payloads plus the
 * station weekday.
 */
import type { Weekday } from "../mod/types";
import { stationHhmm } from "../time/station";
import type { ScheduleDto, ScheduleShowCell } from "./grid";

export type TodayStatus = "SCHEDULED" | "DELAYED" | "CANCELLED";

export interface TodayOccurrence {
  showId: string;
  showName: string;
  slug: string;
  status: TodayStatus | string;
  originalStart: string;
  originalEnd: string;
  effectiveStart: string;
  effectiveEnd: string;
}

/** Per-show marker for today's column: status + effective HH:MM window. */
export interface TodayMark {
  status: TodayStatus;
  start: string;
  end: string;
}

export function todayMarks(occurrences: readonly TodayOccurrence[]): Map<string, TodayMark> {
  const marks = new Map<string, TodayMark>();
  for (const o of occurrences) {
    marks.set(o.showId, {
      status: (o.status as TodayStatus) ?? "SCHEDULED",
      start: stationHhmm(o.effectiveStart),
      end: stationHhmm(o.effectiveEnd),
    });
  }
  return marks;
}

/**
 * The weekly schedule with TODAY's row replaced by today's airable
 * occurrences at their effective times (cancelled ones removed), so
 * now/next picking honours delays and cancellations. Other days untouched.
 */
export function overlayToday(
  schedule: ScheduleDto,
  today: Weekday,
  occurrences: readonly TodayOccurrence[] | undefined,
): ScheduleDto {
  if (!occurrences) return schedule;
  const templateCells = new Map<string, ScheduleShowCell>();
  for (const d of schedule.days) for (const c of d.shows) templateCells.set(c.id, c);

  const todayCells: ScheduleShowCell[] = occurrences
    .filter((o) => o.status !== "CANCELLED")
    .map((o) => ({
      id: o.showId,
      name: o.showName,
      slug: o.slug,
      start: stationHhmm(o.effectiveStart),
      end: stationHhmm(o.effectiveEnd),
      roster: templateCells.get(o.showId)?.roster ?? [],
    }));

  const hasToday = schedule.days.some((d) => d.day === today);
  const days = schedule.days.map((d) => (d.day === today ? { day: d.day, shows: todayCells } : d));
  return { days: hasToday ? days : [...days, { day: today, shows: todayCells }] };
}
