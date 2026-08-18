"use client";

/**
 * Studio "Attendance" segment — 1:1 with
 * docs/frontend-design-basis-prototype/studio/studio-attendance.html.
 *
 * Left: the current slot's check-in card. One row per `slotRoster` entry
 * (the open episode's show roster merged with this episode's attendance);
 * not-timed-in rows get a gold `studio-timein` button, timed-in rows get a
 * "Timed in ✓ HH:MM" pill. When there's no open episode / no show roster to
 * merge (`slotRoster` empty), falls back to listing `attendees` (whoever has
 * actually tapped in) with guidance copy instead of a blank card.
 *
 * Right: "Today's schedule" — every episode scheduled today, ported from the
 * same `GET /api/studio/today` payload the left card uses, so both sides
 * always agree.
 *
 * FE#46: the sub/guest time-in dialog + toast host moved up to `StudioPage`
 * so the kiosk header's persistent "add a DJ" button (visible in both
 * Attendance and Console mode) can open the *same* dialog this panel's own
 * "Time in a sub / guest DJ" button opens, instead of forking a second
 * instance. This panel now takes `pushToast`/`onOpenSubDialog` as props
 * rather than owning `useToast()`/`useState` for the dialog itself.
 */
import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  Check,
  LogIn,
  SlidersHorizontal,
  UserPlus,
} from "lucide-react";
import {
  getGetStudioTodayQueryKey,
  timeInStudio,
  timeOutStudio,
  useGetStudioToday,
} from "@/lib/api/endpoints/studio/studio";
import { getApiErrorMessage } from "@/lib/api/error-message";
import type { StudioTodayDto, StudioTodayShowDto } from "@/lib/api/model";
import { stationHhmm } from "@/lib/time/station";
import { Button } from "@/components/ui/button";

const MONO_CLASSES = ["wc-mono-1", "wc-mono-2", "wc-mono-3", "wc-mono-4", "wc-mono-5", "wc-mono-6"];

function monoClassFor(index: number): string {
  return MONO_CLASSES[index % MONO_CLASSES.length];
}

/** `iso` is a UTC instant — render it in station-local time, not the browser's timezone. */
function formatClock(iso: string | null): string {
  if (!iso) return "";
  const [h, m] = stationHhmm(iso).split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * `show.status` is the episode's live stream status (`ON_AIR` / `OFF_AIR` /
 * `TECH_DIFFICULTIES`) — it doesn't distinguish "already aired" from
 * "hasn't started yet" for an episode that's currently off air. We derive
 * that distinction from `scheduledFor` vs. now, same as the prototype's
 * Done/On air/Upcoming pills.
 */
function scheduleRowMeta(show: StudioTodayShowDto): { label: string; pillClass: string } {
  if (show.status === "ON_AIR") return { label: "On air", pillClass: "wc-badge-live" };
  if (show.status === "TECH_DIFFICULTIES") return { label: "Tech issues", pillClass: "wc-pill-bad" };
  // `scheduledFor` is nullable for an ad-hoc episode with no show attached —
  // treat "no schedule" the same as "already happened" (Done), same as an
  // episode whose scheduled time has passed.
  const scheduledMs = show.scheduledFor ? new Date(show.scheduledFor).getTime() : 0;
  if (scheduledMs <= Date.now()) return { label: "Done", pillClass: "wc-pill-neutral" };
  return { label: "Upcoming", pillClass: "wc-pill-warn" };
}

interface AttendancePanelProps {
  onOpenConsole: () => void;
  pushToast: (message: string) => void;
  onOpenSubDialog: () => void;
}

export function AttendancePanel({ onOpenConsole, pushToast, onOpenSubDialog }: AttendancePanelProps) {
  const queryClient = useQueryClient();

  const todayQuery = useGetStudioToday<StudioTodayDto>({
    query: { refetchInterval: 15_000 },
  });
  const today = todayQuery.data;

  const activeShow = useMemo(
    () => today?.todayShows.find((s) => s.id === today.episode?.id) ?? null,
    [today],
  );

  function invalidateToday() {
    return queryClient.invalidateQueries({ queryKey: getGetStudioTodayQueryKey() });
  }

  const timeInMutation = useMutation({
    mutationFn: (rosterId: string) => timeInStudio({ body: JSON.stringify({ rosterId }) }),
  });

  const timeOutMutation = useMutation({
    mutationFn: (rosterId: string) => timeOutStudio({ body: JSON.stringify({ rosterId }) }),
  });

  function handleTimeIn(rosterId: string, displayName: string) {
    timeInMutation.mutate(rosterId, {
      onSuccess: async () => {
        await invalidateToday();
        pushToast(`✓ ${displayName} timed in ${new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`);
      },
    });
  }

  function handleTimeOut(rosterId: string, displayName: string) {
    timeOutMutation.mutate(rosterId, {
      onSuccess: async () => {
        await invalidateToday();
        pushToast(`↩ ${displayName} timed out ${new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`);
      },
    });
  }

  // `attendees` is the open episode's full attendance-record set (every
  // timed-in roster member, including subs merged into `slotRoster` and
  // ad-hoc episodes that have no `slotRoster` at all) — it's the
  // authoritative timed-in count, unlike filtering `slotRoster` which is
  // empty for ad-hoc episodes even when people are timed in.
  const timedInCount = today?.attendees.length ?? 0;
  const consoleLive = timedInCount > 0;

  // Single role="alert" region for the panel — query load failures win over a
  // stale time-in mutation error (matches the design gate's "one alert
  // region per view" rule).
  const panelAlert = todayQuery.isError
    ? getApiErrorMessage(todayQuery.error)
    : timeInMutation.isError
      ? getApiErrorMessage(timeInMutation.error)
      : timeOutMutation.isError
        ? getApiErrorMessage(timeOutMutation.error)
        : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
      <div className="wc-stack min-w-0">
        <section className="wc-card">
          <div className="wc-card-pad border-b border-border flex items-center gap-3 flex-wrap">
            {today?.episode ? (
              <span className="wc-badge-live text-[.6rem] py-0.5">
                <span className="dot" />
                On air now
              </span>
            ) : (
              <span className="wc-pill wc-pill-neutral">No open episode</span>
            )}
            <div className="font-extrabold text-lg flex-1">
              {activeShow?.showName ?? (today?.episode?.unscheduled ? "Ad-hoc episode" : "No show scheduled")}
            </div>
            {activeShow && (
              <span className="wc-chip-ghost tnum">Scheduled {formatClock(activeShow.scheduledFor)}</span>
            )}
          </div>

          <div className="p-3 sm:p-4 flex flex-col gap-3">
            {panelAlert && (
              <div role="alert" className="text-sm font-semibold text-destructive">
                {panelAlert}
              </div>
            )}

            {todayQuery.isLoading ? (
              <p className="wc-muted text-sm">Loading today&apos;s check-in…</p>
            ) : todayQuery.isError ? null : today && today.slotRoster.length > 0 ? (
              today.slotRoster.map((entry, index) => (
                <div
                  key={entry.rosterId}
                  data-testid="studio-slot-row"
                  className={
                    entry.timedIn
                      ? "flex items-center gap-3 p-3 rounded-xl"
                      : "flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-border"
                  }
                  style={entry.timedIn ? { background: "var(--muted)" } : undefined}
                >
                  <span className={`wc-mono ${monoClassFor(index)} h-12 w-12 flex-none text-lg`}>
                    {entry.displayName.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{entry.displayName}</div>
                    <div className="text-xs wc-muted tnum">
                      {activeShow ? `Scheduled ${formatClock(activeShow.scheduledFor)} · ` : ""}
                      {entry.timedIn ? `in ${formatClock(entry.timeIn)}` : "not yet in"}
                    </div>
                  </div>
                  {entry.timedIn ? (
                    <div className="flex items-center gap-2">
                      <span className="wc-pill wc-pill-ok" data-testid="studio-timedin-pill">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        Timed in ✓ {formatClock(entry.timeIn)}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="studio-timeout"
                        aria-label={`Time out ${entry.displayName}`}
                        disabled={timeOutMutation.isPending}
                        onClick={() => handleTimeOut(entry.rosterId, entry.displayName)}
                      >
                        <LogIn className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
                        Time out
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      data-testid="studio-timein"
                      aria-label={`Time in ${entry.displayName}`}
                      disabled={timeInMutation.isPending}
                      onClick={() => handleTimeIn(entry.rosterId, entry.displayName)}
                    >
                      <LogIn className="h-4 w-4" aria-hidden="true" />
                      Time in
                    </Button>
                  )}
                </div>
              ))
            ) : today && today.attendees.length > 0 ? (
              <>
                <p className="wc-help" data-testid="studio-attendance-guidance">
                  This episode isn&apos;t tied to a scheduled show roster — showing everyone who&apos;s
                  timed in below.
                </p>
                {today.attendees.map((attendee, index) => (
                  <div
                    key={attendee.rosterId}
                    data-testid="studio-attendee-row"
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: "var(--muted)" }}
                  >
                    <span className={`wc-mono ${monoClassFor(index)} h-12 w-12 flex-none text-lg`}>
                      {attendee.displayName.charAt(0).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{attendee.displayName}</div>
                      <div className="text-xs wc-muted tnum">in {formatClock(attendee.timeIn)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="wc-pill wc-pill-ok">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        Timed in ✓ {formatClock(attendee.timeIn)}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="studio-timeout"
                        aria-label={`Time out ${attendee.displayName}`}
                        disabled={timeOutMutation.isPending}
                        onClick={() => handleTimeOut(attendee.rosterId, attendee.displayName)}
                      >
                        <LogIn className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
                        Time out
                      </Button>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div
                className="rounded-xl border border-dashed border-border p-6 text-center text-sm wc-muted"
                data-testid="studio-attendance-empty"
              >
                Nobody&apos;s timed in yet. Tap &quot;Time in a sub / guest DJ&quot; below once the first
                DJ arrives.
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              className="wc-btn-block"
              data-testid="studio-timein-sub"
              onClick={onOpenSubDialog}
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Time in a sub / guest DJ
            </Button>
          </div>
        </section>

        {consoleLive && (
          <button
            type="button"
            data-testid="studio-console-cta"
            className="wc-card wc-card-i block w-full text-left"
            style={{
              background: "linear-gradient(150deg,var(--maroon),var(--maroon-deep))",
              borderColor: "transparent",
              color: "#fff",
            }}
            onClick={onOpenConsole}
          >
            <div className="wc-card-pad flex items-center gap-3">
              <span
                className="h-11 w-11 rounded-xl grid place-items-center flex-none"
                style={{ background: "rgba(255,255,255,.15)" }}
              >
                <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="flex-1">
                <div className="font-extrabold">Console is live</div>
                <div className="text-sm text-white/80">
                  {timedInCount} timed in · open the inbox, polls &amp; chat for this episode
                </div>
              </div>
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </div>
          </button>
        )}
      </div>

      <section className="wc-card overflow-hidden self-start">
        <div className="wc-card-pad border-b border-border flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-gold" aria-hidden="true" />
          <h2 className="font-extrabold flex-1">Today&apos;s schedule</h2>
          <span className="wc-muted text-sm tnum">{today?.todayShows.length ?? 0} shows</span>
        </div>
        {today && today.todayShows.length > 0 ? (
          <ul>
            {today.todayShows.map((show) => {
              const meta = scheduleRowMeta(show);
              return (
                <li
                  key={show.id}
                  data-testid="studio-schedule-row"
                  className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0"
                  style={show.status === "ON_AIR" ? { background: "var(--accent)" } : undefined}
                >
                  <div className="w-16 text-xs wc-muted tnum flex-none">{formatClock(show.scheduledFor)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{show.showName ?? "Ad-hoc episode"}</div>
                    <div className="text-xs wc-muted truncate">{show.djs.join(" · ") || "No roster"}</div>
                  </div>
                  {meta.pillClass === "wc-badge-live" ? (
                    <span className="wc-badge-live text-[.6rem] py-0.5">
                      <span className="dot" />
                      {meta.label}
                    </span>
                  ) : (
                    <span className={`wc-pill ${meta.pillClass}`}>{meta.label}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-6 text-center wc-muted text-sm" data-testid="studio-schedule-empty">
            No episodes scheduled today.
          </div>
        )}
      </section>
    </div>
  );
}
