"use client";

import { useEffect, useState } from "react";

/**
 * The current instant (ms), re-rendered every `intervalMs`. The clock is read
 * in the lazy initializer and the interval callback only — never in render
 * (`react-hooks/purity`). Pass `null` to stop ticking.
 */
export function useNow(intervalMs: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (intervalMs === null) return;
    const tick = () => setNow(Date.now());
    const kick = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, intervalMs);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}
