"use client";

/**
 * `/studio` kiosk top bar (FE#46) — 1:1 with
 * docs/frontend-design-basis-prototype/studio/studio-console.html lines
 * 22-41, which the React app previously had no equivalent of at all.
 *
 * Row 1: mascot mark + wordmark, the Attendance/Console `wc-seg` switch
 * (moved here from its old standalone `<div className="wc-seg">` in
 * page.tsx so it lives inside the persistent header instead of the
 * per-mode content), a station-local date, a "Session active" pill (this
 * component only ever mounts once the station session is confirmed active,
 * so the pill is unconditional), and the staff dark/light toggle.
 *
 * Row 2 (attendance strip): on-air badge + per-DJ time-in chips, sourced
 * from the same `GET /api/studio/today` payload `AttendancePanel` reads —
 * React Query dedupes the two `useGetStudioToday` calls onto one request
 * since both use the same query key. Renders nothing extra when there's no
 * open episode / nobody's timed in yet (no fake placeholder chips).
 */
import Image from "next/image";
import { useEffect, useState } from "react";
import { CircleDot, ClipboardCheck, Plus, SlidersHorizontal } from "lucide-react";
import { StaffThemeToggle } from "@/components/layout/staff-sidebar";
import { Button } from "@/components/ui/button";
import type { StudioTodayDto } from "@/lib/api/model";
import { stationLongDate } from "@/lib/time/station";
import { elapsedHhmm } from "@/lib/time/elapsed";

export type StudioMode = "attendance" | "console";

interface KioskHeaderProps {
  mode: StudioMode;
  onModeChange: (mode: StudioMode) => void;
  today: StudioTodayDto | undefined;
  onAddDj: () => void;
}

export function KioskHeader({ mode, onModeChange, today, onAddDj }: KioskHeaderProps) {
  const activeShow = today?.episode
    ? today.todayShows.find((s) => s.id === today.episode?.id) ?? null
    : null;
  const onAirLabel = today?.episode
    ? `On air${activeShow?.showName ? ` · ${activeShow.showName}` : ""}`
    : null;
  // Resolved after mount, never during render: reading the clock while
  // rendering would make the server and client emit different text and
  // hydration would mismatch. The booth stays open for a whole shift, so the
  // date is also re-checked each minute to survive a midnight rollover.
  // `now` also drives the per-DJ time-in durations below, so it ticks each
  // minute rather than being read once at mount — a booth shift runs for hours.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  const stationDate = now === null ? null : stationLongDate(new Date(now));

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
      data-testid="studio-kiosk-header"
    >
      <div className="wc-container flex flex-wrap items-center gap-3 py-3">
        <Image
          src="/brand/logo-mascot-mark.png"
          alt=""
          width={36}
          height={36}
          className="h-9 w-9"
        />
        <span className="font-extrabold">
          Wildcat Radio · <span className="text-gold">Studio</span>
        </span>

        <div className="wc-seg ml-1" role="tablist" aria-label="Studio mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "attendance"}
            className={mode === "attendance" ? "active" : undefined}
            data-testid="studio-seg-attendance"
            onClick={() => onModeChange("attendance")}
          >
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            Attendance
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "console"}
            className={mode === "console" ? "active" : undefined}
            data-testid="studio-seg-console"
            onClick={() => onModeChange("console")}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Console
          </button>
        </div>

        <span className="ml-auto hidden sm:block wc-muted text-sm tnum" data-testid="studio-kiosk-date">
          {stationDate}
        </span>
        <span className="wc-pill wc-pill-ok" data-testid="studio-kiosk-session-pill">
          <CircleDot className="h-3.5 w-3.5" aria-hidden="true" />
          Session active
        </span>
        <StaffThemeToggle />
      </div>

      {(onAirLabel || (today && today.attendees.length > 0)) && (
        <div className="wc-container flex flex-wrap items-center gap-2 pb-3">
          {onAirLabel && (
            <span className="wc-badge-live text-[.6rem] py-0.5" data-testid="studio-kiosk-onair">
              <span className="dot" />
              {onAirLabel}
            </span>
          )}
          {today?.attendees.map((attendee) => (
            <span key={attendee.rosterId} className="wc-chip-ghost text-xs" data-testid="studio-kiosk-dj-chip">
              ✓ {attendee.displayName}{" "}
              {attendee.timeIn && now !== null && (
                <span className="tnum">{elapsedHhmm(attendee.timeIn, now)}</span>
              )}
            </span>
          ))}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="wc-btn-sm"
            aria-label="Add a DJ"
            data-testid="studio-kiosk-add-dj"
            onClick={onAddDj}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </header>
  );
}
