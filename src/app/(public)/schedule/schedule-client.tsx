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
 * whose shell (`public-shell.tsx`) supplies the top-nav/mobile-drawer/
 * bottom-nav/player/footer chrome, plus the skip link and #main-content
 * landmark (FE#41/FE#49).
 *
 * FE#42: the owner ruled Mon–Fri (matching the prototype) for the public
 * grid — `PUBLIC_WEEKDAYS`, not the shared 7-day `WEEKDAYS` (that stays full
 * width for `/mod/schedule`). Desktop keeps the Time x Day table
 * (`hidden md:block`); mobile gets a day-tab + card view (`md:hidden`) so a
 * 375px viewport never has to horizontally scroll an 860px table again.
 */
import { useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import {
  useGetTodaySchedule,
  useGetWeeklySchedule,
} from "@/lib/api/endpoints/schedule/schedule";
import {
  toDaypartGrid,
  buildDayItems,
  daypartLabel,
  PUBLIC_WEEKDAYS,
  type ScheduleDto,
  type ScheduleShowCell,
} from "@/lib/schedule/grid";
import type { Weekday } from "@/lib/mod/types";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { coverClassFor, initialsFor } from "@/lib/content/cover";
import { stationWeekday } from "@/lib/time/station";
import { useStationNow } from "@/lib/time/use-station-now";
import { isShowOnAir } from "@/lib/content/live";
import { todayMarks, type TodayMark } from "@/lib/schedule/today";
import { useStream } from "@/lib/stream/stream-context";

const DAY_HEADER: Record<Weekday, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

/**
 * Today's delay/cancel marker (#106). The grid itself is the recurring
 * template; only today's column carries dated changes.
 */
function TodayChip({ mark }: { mark: TodayMark | undefined }) {
  if (!mark || mark.status === "SCHEDULED") return null;
  if (mark.status === "CANCELLED") {
    return (
      <span className="wc-chip-ghost text-[.6rem]" data-testid="schedule-today-cancelled">
        Cancelled today
      </span>
    );
  }
  return (
    <span className="wc-chip text-[.6rem]" data-testid="schedule-today-delayed">
      Delayed · <span className="tnum">{daypartLabel(mark.start, mark.end)}</span>
    </span>
  );
}

function LiveBadge() {
  return (
    <span className="wc-badge-live" style={{ fontSize: ".55rem", padding: ".2rem .5rem" }}>
      <span className="dot" />
      On air
    </span>
  );
}

function ShowCard({ cell, live, mark }: { cell: ScheduleShowCell; live: boolean; mark?: TodayMark }) {
  const cancelled = mark?.status === "CANCELLED";
  const body = (
    <div className="flex items-center gap-3">
      <div className={`wc-cover ${coverClassFor(cell.id)} rounded-lg w-14 h-14 flex-none`}>
        <span className="init">{initialsFor(cell.name)}</span>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {live && <LiveBadge />}
          <span className={`font-bold truncate${cancelled ? " line-through wc-muted" : ""}`}>{cell.name}</span>
          <TodayChip mark={mark} />
        </div>
        <div className="text-sm wc-muted truncate">
          {(cell.roster.join(", ") || "—") + " · "}
          <span className="tnum">{daypartLabel(cell.start, cell.end)}</span>
        </div>
      </div>
    </div>
  );

  if (!cell.slug) {
    return <div className="wc-card wc-card-pad">{body}</div>;
  }

  return (
    <Link href={`/shows/${cell.slug}`} className="wc-card wc-card-i wc-card-pad block" data-testid="schedule-mobile-card">
      {body}
    </Link>
  );
}

export function ScheduleClient() {
  const scheduleQuery = useGetWeeklySchedule<ScheduleDto>();
  const schedule = scheduleQuery.data;
  const grid = schedule ? toDaypartGrid(schedule) : null;

  // #106: ticks each minute (the old values were frozen at mount), and "On
  // air" needs broadcast evidence for that show — stream LIVE + manifest showId.
  const now = useStationNow();
  const today = stationWeekday(now);
  const { status, showId: liveShowId } = useStream();
  const todayQuery = useGetTodaySchedule({ query: { retry: false, refetchInterval: 60_000 } });
  const marks = todayMarks(todayQuery.data?.occurrences ?? []);
  const isOnAir = (cell: ScheduleShowCell, day: Weekday) =>
    day === today && isShowOnAir(status, liveShowId, cell.id);
  const markFor = (cell: ScheduleShowCell, day: Weekday) => (day === today ? marks.get(cell.id) : undefined);
  const defaultDay: Weekday = PUBLIC_WEEKDAYS.includes(today) ? today : "MON";
  const [selectedDay, setSelectedDay] = useState<Weekday>(defaultDay);

  const dayItems = grid ? buildDayItems(grid, selectedDay) : [];

  return (
    <div className="wc-container py-6 md:py-8 pb-16">
      <header className="mb-5">
        <div className="mb-1 flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-maroon" aria-hidden="true" />
          <h1 className="text-2xl font-extrabold">Weekly schedule</h1>
        </div>
        <p className="wc-muted">
          Mon–Fri. Tap a show to see episodes. Gaps between live shows are music rotation.
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
      ) : !grid || grid.rows.length === 0 ? (
        <div className="wc-card p-8 text-center wc-muted" data-testid="schedule-empty">
          No shows scheduled this week — check back soon.
        </div>
      ) : (
        <>
          {/* ================= DESKTOP GRID ================= */}
          <div className="hidden md:block wc-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="wc-table" style={{ minWidth: 700, tableLayout: "fixed" }} data-testid="schedule-grid">
                <thead>
                  <tr>
                    <th className="w-24">Time</th>
                    {PUBLIC_WEEKDAYS.map((day) => (
                      <th key={day} scope="col">
                        {DAY_HEADER[day]}
                        {day === today && (
                          <span className="wc-chip text-[.5rem] py-0 px-1.5 align-middle ml-1.5">today</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map((row) => (
                    <tr key={row.key}>
                      <td className="tnum wc-muted font-semibold">{row.label}</td>
                      {PUBLIC_WEEKDAYS.map((day) => {
                        const cell = row.cells[day];
                        return (
                          <td key={day} data-testid="schedule-cell" className="p-1.5">
                            {cell ? (
                              cell.slug ? (
                                <Link
                                  href={`/shows/${cell.slug}`}
                                  className={`wc-slot${isOnAir(cell, day) ? " on" : ""}`}
                                >
                                  {isOnAir(cell, day) && (
                                    <div className="mb-1">
                                      <LiveBadge />
                                    </div>
                                  )}
                                  {markFor(cell, day) && markFor(cell, day)!.status !== "SCHEDULED" && (
                                    <div className="mb-1">
                                      <TodayChip mark={markFor(cell, day)} />
                                    </div>
                                  )}
                                  <div
                                    className={`font-bold text-sm leading-tight${markFor(cell, day)?.status === "CANCELLED" ? " line-through wc-muted" : ""}`}
                                  >
                                    {cell.name}
                                  </div>
                                  <div className="text-xs wc-muted">
                                    {cell.roster.join(", ") || "—"} ·{" "}
                                    <span className="tnum">{daypartLabel(cell.start, cell.end)}</span>
                                  </div>
                                </Link>
                              ) : (
                                <div className="wc-slot">
                                  <div className="font-bold text-sm leading-tight">{cell.name}</div>
                                  <div className="text-xs wc-muted">
                                    {cell.roster.join(", ") || "—"} ·{" "}
                                    <span className="tnum">{daypartLabel(cell.start, cell.end)}</span>
                                  </div>
                                </div>
                              )
                            ) : (
                              <div className="wc-slot-empty" aria-hidden="true">—</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ================= MOBILE DAY TABS + CARDS ================= */}
          <div className="md:hidden">
            <div className="wc-seg w-full mb-4 flex" role="tablist" aria-label="Day">
              {PUBLIC_WEEKDAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  role="tab"
                  aria-selected={selectedDay === day}
                  className={`flex-1${selectedDay === day ? " active" : ""}`}
                  style={{ minHeight: 44 }}
                  onClick={() => setSelectedDay(day)}
                  data-testid={`schedule-day-tab-${day}`}
                >
                  {DAY_HEADER[day]}
                  {day === today && <span className="sr-only"> (today)</span>}
                </button>
              ))}
            </div>

            <div className="wc-stack" role="tabpanel" data-testid="schedule-mobile-panel">
              {dayItems.length === 0 ? (
                <p className="wc-muted text-sm">No shows scheduled on {DAY_HEADER[selectedDay]}.</p>
              ) : (
                dayItems.map((item) =>
                  item.type === "show" ? (
                    <ShowCard
                      key={item.cell.id}
                      cell={item.cell}
                      live={isOnAir(item.cell, selectedDay)}
                      mark={markFor(item.cell, selectedDay)}
                    />
                  ) : (
                    <div
                      key={`gap-${item.start}-${item.end}`}
                      className="wc-card wc-card-pad bg-muted text-sm wc-muted"
                    >
                      <span className="tnum">{daypartLabel(item.start, item.end)}</span> · Music rotation
                    </div>
                  ),
                )
              )}
            </div>
          </div>
        </>
      )}
      <p className="wc-help mt-2">Off-air slots are music rotation — no live host.</p>
    </div>
  );
}
