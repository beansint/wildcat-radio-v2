"use client";

/**
 * Public `/schedule` — read-only weekly Time x Day grid, ported from
 * docs/frontend-design-basis-prototype/public/schedule.html but sharing the
 * same `wc-table` grid pipeline as `/mod/schedule` (src/lib/schedule/grid.ts)
 * instead of hand-rolling a second layout: `GET /api/schedule` already
 * returns the same `ScheduleDto` shape `toDaypartGrid` expects, so no
 * client-side reshaping (`buildScheduleFromShows`) is needed here — that
 * helper is mod-only, for the richer `GET /api/shows` payload.
 *
 * No `/mod` chrome, no auth — this route sits in the `(public)` route group,
 * which already supplies the top-nav/bottom-nav/player shell.
 */
import { CalendarDays } from "lucide-react";
import {
  useGetWeeklySchedule,
} from "@/lib/api/endpoints/schedule/schedule";
import { toDaypartGrid, WEEKDAYS, type ScheduleDto } from "@/lib/schedule/grid";
import type { Weekday } from "@/lib/mod/types";
import { getApiErrorMessage } from "@/lib/api/error-message";

const DAY_HEADER: Record<Weekday, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

export default function PublicSchedulePage() {
  const scheduleQuery = useGetWeeklySchedule<ScheduleDto>();
  const schedule = scheduleQuery.data;
  const grid = schedule ? toDaypartGrid(schedule) : null;

  return (
    <div className="wc-container py-6 md:py-8 pb-16">
      <header className="mb-5">
        <div className="mb-1 flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-maroon" aria-hidden="true" />
          <h1 className="text-2xl font-extrabold">Weekly schedule</h1>
        </div>
        <p className="wc-muted">
          What&apos;s on, day by day. Gaps between live shows are music rotation.
        </p>
      </header>

      {scheduleQuery.isLoading ? (
        <p className="wc-muted" data-testid="schedule-loading">
          Loading the weekly schedule…
        </p>
      ) : scheduleQuery.isError ? (
        <div role="alert" className="text-sm font-semibold text-destructive">
          {getApiErrorMessage(scheduleQuery.error)}
        </div>
      ) : (
        <div className="wc-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="wc-table min-w-[860px]" data-testid="schedule-grid">
              <thead>
                <tr>
                  <th className="w-24">Time</th>
                  {WEEKDAYS.map((day) => (
                    <th key={day} scope="col">
                      {DAY_HEADER[day]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!grid || grid.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center wc-muted py-8" data-testid="schedule-empty">
                      No shows scheduled this week — check back soon.
                    </td>
                  </tr>
                ) : (
                  grid.rows.map((row) => (
                    <tr key={row.key}>
                      <td className="tnum wc-muted font-semibold">{row.label}</td>
                      {WEEKDAYS.map((day) => {
                        const cell = row.cells[day];
                        return (
                          <td
                            key={day}
                            data-testid="schedule-cell"
                            className={cell ? "p-0" : "text-center wc-muted p-0"}
                            style={cell ? undefined : { background: "var(--muted)" }}
                          >
                            {cell ? (
                              <div className="px-[.85rem] py-[.72rem]">
                                <span className="font-bold">{cell.name}</span>
                                <br />
                                <span className="wc-muted text-xs tnum">
                                  {cell.start}–{cell.end}
                                </span>
                                <br />
                                <span className="text-xs">{cell.roster.join(", ") || "—"}</span>
                              </div>
                            ) : (
                              <span className="block py-3" aria-hidden="true">
                                —
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="wc-help mt-2">Off-air slots are music rotation — no live host.</p>
    </div>
  );
}
