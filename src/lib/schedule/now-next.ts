/**
 * Pure "Now & next" picker for the landing page (launch fix: the section was
 * a hardcoded mock — fake show, fake DJs — shipped on the homepage).
 *
 * Given the public weekly schedule and station-local time, pick:
 *  - `now`  — the slot currently in progress today (if any)
 *  - `next` — the next upcoming slot, searching today first and then forward
 *    through the week in order (wrapping), so Friday evening shows Monday's
 *    opener rather than nothing.
 */
import type { Weekday } from "../mod/types";
import { WEEKDAYS, type ScheduleDto, type ScheduleShowCell } from "./grid";

export interface NowNextPick {
  now: ScheduleShowCell | null;
  next: (ScheduleShowCell & { day: Weekday }) | null;
}

function slotsFor(schedule: ScheduleDto, day: Weekday): ScheduleShowCell[] {
  const shows = schedule.days.find((d) => d.day === day)?.shows ?? [];
  return [...shows].sort((a, b) => a.start.localeCompare(b.start));
}

export function pickNowNext(
  schedule: ScheduleDto,
  today: Weekday,
  nowHhmm: string,
): NowNextPick {
  const todaySlots = slotsFor(schedule, today);
  const now = todaySlots.find((s) => s.start <= nowHhmm && nowHhmm < s.end) ?? null;

  const upcomingToday = todaySlots.find((s) => s.start > nowHhmm);
  if (upcomingToday) return { now, next: { ...upcomingToday, day: today } };

  // Wrap forward through the rest of the week for the next scheduled slot.
  const start = WEEKDAYS.indexOf(today);
  for (let offset = 1; offset <= WEEKDAYS.length; offset += 1) {
    const day = WEEKDAYS[(start + offset) % WEEKDAYS.length];
    const [first] = slotsFor(schedule, day);
    if (first) return { now, next: { ...first, day } };
  }
  return { now, next: null };
}
