"use client";

/**
 * Landing "Now & next" — wired to the real public schedule (was a hardcoded
 * mock show/DJ, which meant the homepage could claim someone was on air who
 * doesn't exist). The "On air" badge is bound to the live stream status, not
 * the schedule alone: a scheduled slot with no actual broadcast shows as
 * "Scheduled", never as on air.
 */
import Link from "next/link";
import { useGetWeeklySchedule } from "@/lib/api/endpoints/schedule/schedule";
import { daypartLabel, type ScheduleDto, type ScheduleShowCell } from "@/lib/schedule/grid";
import { pickNowNext } from "@/lib/schedule/now-next";
import { coverClassFor, initialsFor } from "@/lib/content/cover";
import { stationHhmm, stationWeekday } from "@/lib/time/station";
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
  const { status } = useStream();
  const query = useGetWeeklySchedule<ScheduleDto>({ query: { retry: false } });

  const schedule = query.data;
  if (!schedule) return null;

  const pick = pickNowNext(schedule, stationWeekday(), stationHhmm(new Date()));
  if (!pick.now && !pick.next) return null;

  return (
    <section className="wc-container py-2">
      <h2 className="text-lg font-extrabold mb-3">Now &amp; next</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {pick.now && (
          <SlotCard
            cell={pick.now}
            coverVariant={coverClassFor(pick.now.id)}
            badge={
              status === "LIVE" ? (
                <span className="wc-badge-live text-[.65rem]">
                  <span className="dot"></span>On air
                </span>
              ) : (
                <span className="wc-chip-ghost text-[.65rem]">Scheduled now</span>
              )
            }
          />
        )}
        {pick.next && (
          <SlotCard
            cell={pick.next}
            coverVariant={coverClassFor(pick.next.id)}
            badge={
              <span className="wc-chip-ghost text-[.65rem]">
                Up next{pick.next.day !== stationWeekday() ? ` · ${DAY_LABEL[pick.next.day]}` : ""}
              </span>
            }
          />
        )}
      </div>
    </section>
  );
}
