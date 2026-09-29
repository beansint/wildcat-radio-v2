"use client";

import { useEffect, useState } from "react";

/** ms until the next wall-clock minute boundary (+50ms so we land past it). */
export function msUntilNextMinute(now: number): number {
  return 60_000 - (now % 60_000) + 50;
}

/**
 * The current instant, re-rendered at every minute boundary (#106 / FE#84).
 * Clock-dependent labels (today chip, now/next, "scheduled now") advance on
 * their own instead of freezing at mount. A self-rescheduling timeout rather
 * than a 60s interval, so it stays aligned to :00 and never drifts.
 */
export function useStationNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, msUntilNextMinute(Date.now()));
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now;
}
