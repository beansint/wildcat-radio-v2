"use client";

/**
 * Landing "Now & next" — wired to the real public schedule (was a hardcoded
 * mock show/DJ, which meant the homepage could claim someone was on air who
 * doesn't exist). The "On air" badge needs broadcast evidence for THAT show
 * (#106: stream LIVE + manifest showId), never the schedule or any-show-LIVE:
 * a scheduled slot with no matching broadcast shows as "Scheduled now".
 * Today's delays/cancellations are overlaid, and the clock ticks each minute.
 */
import Link from "next/link";
import { useGetTodaySchedule, useGetWeeklySchedule } from "@/lib/api/endpoints/schedule/schedule";
import { daypartLabel, type ScheduleDto, type ScheduleShowCell } from "@/lib/schedule/grid";
import { pickNowNext } from "@/lib/schedule/now-next";
import { overlayToday } from "@/lib/schedule/today";
import { coverClassFor, initialsFor } from "@/lib/content/cover";
import { isShowOnAir } from "@/lib/content/live";
import { stationHhmm, stationWeekday } from "@/lib/time/station";
import { useStationNow } from "@/lib/time/use-station-now";
import { useStream } from "@/lib/stream/stream-context";
import type { Weekday } from "@/lib/mod/types";

const DAY_LABEL: Record<Weekday, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

function SlotCard({
  cell,
  badge,
  coverVariant,
}: {
  cell: ScheduleShowCell;
  badge: React.ReactNode;
  coverVariant: string;
}) {
  const body = (
    <>
      <div className={`wc-cover ${coverVariant} rounded-lg w-16 h-16 flex-none`}>
        <span className="init">{initialsFor(cell.name)}</span>
      </div>
      <div className="min-w-0">
        {badge}
        <div className="font-bold truncate mt-1">{cell.name}</div>
        <div className="text-sm wc-muted truncate">
          {cell.roster.length > 0 ? `${cell.roster.join(", ")} · ` : ""}
          <span className="tnum">{daypartLabel(cell.start, cell.end)}</span>
        </div>
      </div>
    </>
  );
  if (!cell.slug) return <div className="wc-card wc-card-pad flex items-center gap-3">{body}</div>;
  return (
    <Link
      href={`/shows/${cell.slug}`}
      className="wc-card wc-card-i wc-card-pad flex items-center gap-3"
      data-testid="landing-now-next-card"
    >
      {body}
    </Link>
  );
}

export function NowNext() {
  const { status, manifestAvailability, showId: liveShowId } = useStream();
  const now = useStationNow();
  const query = useGetWeeklySchedule<ScheduleDto>({ query: { retry: false, refetchInterval: 60_000 } });
  // #106: today's delays/cancellations; refetched with the minute ticker's cadence.
  const todayQuery = useGetTodaySchedule({ query: { retry: false, refetchInterval: 60_000 } });

  const weekly = query.data;
  if (!weekly) return null;

  const today = stationWeekday(now);
  const schedule = overlayToday(weekly, today, todayQuery.data?.occurrences);
  const pick = pickNowNext(schedule, today, stationHhmm(now));

  // Broadcast truth beats the clock: if a show is actually live (e.g. an
  // overrun past its slot), it is the "now" card, not whatever is scheduled.
  const liveCell =
    manifestAvailability === "ready" && status === "LIVE" && liveShowId
      ? schedule.days.flatMap((d) => d.shows).find((c) => c.id === liveShowId) ?? null
      : null;
  const nowCell = liveCell ?? pick.now;
  const next = pick.next && pick.next.id === nowCell?.id ? null : pick.next;
  if (!nowCell && !next) return null;
  const nowLive = manifestAvailability === "ready" && !!nowCell && isShowOnAir(status, liveShowId, nowCell.id);

  return (
    <section className="wc-container py-2">
      <h2 className="text-lg font-extrabold mb-3">Now &amp; next</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {nowCell && (
          <SlotCard
            cell={nowCell}
            coverVariant={coverClassFor(nowCell.id)}
            badge={
              nowLive ? (
                <span className="wc-badge-live text-[.65rem]">
                  <span className="dot"></span>On air
                </span>
              ) : (
                <span className="wc-chip-ghost text-[.65rem]">Scheduled now</span>
              )
            }
          />
        )}
        {next && (
          <SlotCard
            cell={next}
            coverVariant={coverClassFor(next.id)}
            badge={
              <span className="wc-chip-ghost text-[.65rem]">
                Up next{next.day !== today ? ` · ${DAY_LABEL[next.day]}` : ""}
              </span>
            }
          />
        )}
      </div>
    </section>
  );
}
