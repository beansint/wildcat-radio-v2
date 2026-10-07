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
 * Right: "Today's schedule" — every occurrence of the station day (#106:
 * including shows nobody has tapped into yet, with Delayed / Cancelled /
 * Waiting-for-handover states), from the same `GET /api/studio/today`
 * payload the left card uses, so both sides always agree.
 *
 * #106 handover: a DJ who taps in while the previous show is still running
 * is *waiting*, not on air. The banner shows who is waiting and gives them an
 * explicit "Start my show" — the outgoing show otherwise ends on its last
 * tap-out.
 *
 * FE#46: the sub/guest time-in dialog + toast host moved up to `StudioPage`
 * so the kiosk header's persistent "add a DJ" button (visible in both
 * Attendance and Console mode) can open the *same* dialog this panel's own
 * "Time in a sub / guest DJ" button opens, instead of forking a second
 * instance. This panel now takes `pushToast`/`onOpenSubDialog` as props
 * rather than owning `useToast()`/`useState` for the dialog itself.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Hourglass,
  LogIn,
  Play,
  SlidersHorizontal,
  UserPlus,
} from "lucide-react";
import {
  getGetStudioTodayQueryKey,
  handoverStudio,
  timeInStudio,
  timeOutStudio,
  useGetStudioToday,
} from "@/lib/api/endpoints/studio/studio";
import { occurrencePill } from "@/lib/studio/occurrence-status";
import { pickActiveSlot } from "@/lib/studio/active-slot";
import { useNow } from "@/lib/time/use-now";
import { BroadcastBadge, type KioskBroadcastStatus } from "@/components/studio/broadcast-badge";
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

/** Occurrence start (effective, i.e. after a delay) as station-local clock text. */
function startLabel(show: StudioTodayShowDto): string {
  return formatClock(show.effectiveStart ?? show.scheduledFor);
}

interface AttendancePanelProps {
  onOpenConsole: () => void;
  pushToast: (message: string) => void;
  onOpenSubDialog: () => void;
  /** #127 — the stream's real status, so "On air" is never claimed over rotation. */
  broadcast: KioskBroadcastStatus;
}

export function AttendancePanel({ onOpenConsole, pushToast, onOpenSubDialog, broadcast }: AttendancePanelProps) {
  const queryClient = useQueryClient();

  const todayQuery = useGetStudioToday<StudioTodayDto>({
    query: { refetchInterval: 15_000, retry: 2 },
  });
  // #127 — stale-while-error: React Query keeps the last good payload on a
  // failed refetch; the roster stays on screen with a "Connection lost" note
  // instead of disappearing on the first blip.
  const today = todayQuery.data;
  const connectionLost = todayQuery.isError && today !== undefined;

  // #127 — a ticking clock, not the fetch time (which froze on a fetch error
  // or in a background tab). With nothing open yet, the slot airing right now
  // is the one DJs tap into; DONE is never "Up now".
  const now = useNow(15_000);
  const activeSlot = pickActiveSlot(today, now);
  const activeShow = activeSlot?.show ?? null;

  function invalidateToday() {
    return queryClient.invalidateQueries({ queryKey: getGetStudioTodayQueryKey() });
  }

  // #127 — every mutation refetches today's view when it settles, success OR
  // failure: a 409/timeout usually means the kiosk's picture is out of date.
  // Returning the promise keeps the mutation pending until the refetch lands,
  // so buttons never flash pre-mutation state.
  const timeInMutation = useMutation({
    mutationFn: (rosterId: string) => timeInStudio({ body: JSON.stringify({ rosterId }) }),
    onSettled: () => invalidateToday(),
  });

  const timeOutMutation = useMutation({
    mutationFn: (rosterId: string) => timeOutStudio({ rosterId }),
    onSettled: () => invalidateToday(),
  });

  const handoverMutation = useMutation({
    mutationFn: (rosterId: string) => handoverStudio({ body: JSON.stringify({ rosterId }) }),
    onSettled: () => invalidateToday(),
  });

  const pending = today?.pendingHandover ?? null;

  function handleTimeIn(rosterId: string, displayName: string) {
    timeInMutation.mutate(rosterId, {
      onSuccess: (result) => {
        const at = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
        pushToast(
          result.state === "PENDING_HANDOVER"
            ? `✓ ${displayName} checked in ${at} — waiting for the current show to hand over`
            : `✓ ${displayName} timed in ${at}`,
        );
      },
    });
  }

  function handleHandover() {
    const first = pending?.attendees[0];
    if (!first) return;
    handoverMutation.mutate(first.rosterId, {
      onSuccess: () => pushToast(`▶ ${pending?.showName ?? "Next show"} is on air`),
    });
  }

  function handleTimeOut(rosterId: string, displayName: string) {
    timeOutMutation.mutate(rosterId, {
      onSuccess: () => {
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
  const panelAlert = connectionLost
    ? `Connection lost — updated ${stationHhmm(new Date(todayQuery.dataUpdatedAt))}`
    : todayQuery.isError
    ? getApiErrorMessage(todayQuery.error)
    : timeInMutation.isError
      ? getApiErrorMessage(timeInMutation.error)
      : timeOutMutation.isError
        ? getApiErrorMessage(timeOutMutation.error)
        : handoverMutation.isError
          ? getApiErrorMessage(handoverMutation.error)
          : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
      <div className="wc-stack min-w-0">
        <section className="wc-card">
          <div className="wc-card-pad border-b border-border flex items-center gap-3 flex-wrap">
            {today?.episode ? (
              <BroadcastBadge
                broadcast={broadcast}
                episodeOpen
                showName={activeShow?.showName ?? null}
                liveLabel="On air now"
                testid="studio-attendance-broadcast"
              />
            ) : activeSlot?.endedEarly ? (
              <span className="wc-pill wc-pill-warn" data-testid="studio-ended-early">
                {occurrencePill("ENDED_EARLY").label}
              </span>
            ) : activeShow ? (
              <span className="wc-pill wc-pill-warn" data-testid="studio-up-now">Up now · nobody timed in</span>
            ) : (
              <span className="wc-pill wc-pill-neutral">No open episode</span>
            )}
            <div className="font-extrabold text-lg flex-1">
              {activeShow?.showName ?? (today?.episode?.unscheduled ? "Ad-hoc episode" : "No show scheduled")}
            </div>
            {activeShow && (
              <span className="wc-chip-ghost tnum">Scheduled {startLabel(activeShow)}</span>
            )}
          </div>

          {pending && (
            <div
              role="status"
              data-testid="studio-handover-banner"
              className="wc-card-pad border-b border-border flex items-center gap-3 flex-wrap"
              style={{ background: "var(--accent)" }}
            >
              <Hourglass className="h-5 w-5 text-gold flex-none" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <div className="font-bold">
                  {pending.showName ?? "Next show"} {pending.continuingCrew ? "is ready to start" : "is waiting to go on air"}
                </div>
                <div className="text-sm wc-muted">
                  {pending.attendees.map((a) => `${a.displayName} (in ${formatClock(a.timeIn)})`).join(", ")}
                  {today?.episode ? " · the current show is still running" : ""}
                </div>
              </div>
              <Button
                type="button"
                data-testid="studio-handover"
                disabled={handoverMutation.isPending}
                onClick={handleHandover}
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                {handoverMutation.isPending ? "Starting…" : pending.continuingCrew ? "Start next show" : "Start my show"}
              </Button>
            </div>
          )}

          <div className="p-3 sm:p-4 flex flex-col gap-3">
            {panelAlert && (
              <div role="alert" className="text-sm font-semibold text-destructive" data-testid="studio-attendance-alert">
                {panelAlert}
              </div>
            )}

            {todayQuery.isLoading ? (
              <p className="wc-muted text-sm">Loading today&apos;s check-in…</p>
            ) : !today ? null : today.slotRoster.length > 0 ? (
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
                      {activeShow ? `Scheduled ${startLabel(activeShow)} · ` : ""}
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
            ) : today.attendees.length > 0 ? (
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
              // #127 — the occurrence is open, but listeners hear rotation:
              // never pulse "On air" over a known non-LIVE stream.
              const meta =
                show.status === "ON_AIR" && broadcast.status !== null && broadcast.status !== "LIVE"
                  ? {
                      label: broadcast.reason === "SOURCE_STALE" || broadcast.reason === "SEGMENT_STALE"
                        ? "Open · encoder offline"
                        : "Open · not on air",
                      pillClass: "wc-pill-warn",
                    }
                  : occurrencePill(show.status);
              const muted = show.status === "CANCELLED" || show.status === "HIATUS";
              return (
                <li
                  key={`${show.showId ?? show.id}-${show.scheduledFor}`}
                  data-testid="studio-schedule-row"
                  data-status={show.status}
                  className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0"
                  style={show.status === "ON_AIR" ? { background: "var(--accent)" } : undefined}
                >
                  <div className="w-16 text-xs wc-muted tnum flex-none">
                    {startLabel(show)}
                    {show.status === "DELAYED" && show.scheduledFor && (
                      <div>
                        <span className="sr-only">originally </span>
                        <span className="line-through">{formatClock(show.scheduledFor)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-bold truncate${muted ? " line-through wc-muted" : ""}`}>
                      {show.showName ?? "Ad-hoc episode"}
                    </div>
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
            No shows scheduled today.
          </div>
        )}
      </section>
    </div>
  );
}
