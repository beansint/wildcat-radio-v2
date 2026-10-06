"use client";

import { useEffect, useState } from "react";
import {
  LIVE_GRACE_MS,
  liveGraceView,
  reduceLiveGrace,
  type LiveGraceMemory,
  type LiveGraceView,
  type LiveStatus,
} from "./live-grace";

const CLOSED: LiveGraceView = { episodeId: null, open: false, interrupted: false };

/**
 * #127 — React binding for {@link reduceLiveGrace}. Observations are folded in
 * from effects/timers (the clock is never read during render), and a timer
 * re-checks the grace window so chat closes on its own after
 * {@link LIVE_GRACE_MS} of non-LIVE.
 *
 * `status: null` means "unknown" (status service unavailable) — a blip, not an end.
 */
export function useLiveGrace(status: LiveStatus | null, episodeId: string | null): LiveGraceView {
  const [memory, setMemory] = useState<LiveGraceMemory | null>(null);

  useEffect(() => {
    const observation = { status, episodeId };
    const fold = () => setMemory((current) => reduceLiveGrace(current, observation, Date.now()));
    // Deferred one task so the effect only subscribes; the fold itself is the
    // external (clock-driven) update.
    const now = window.setTimeout(fold, 0);
    // Re-evaluate once the grace window can have run out.
    const expiry = status === "LIVE" ? null : window.setTimeout(fold, LIVE_GRACE_MS + 50);
    return () => {
      window.clearTimeout(now);
      if (expiry !== null) window.clearTimeout(expiry);
    };
  }, [status, episodeId]);

  // Render-time short-cuts so the deferred fold never shows a stale frame:
  // a LIVE episode is open now; OFF_AIR / another episode closes now.
  if (status === "LIVE" && episodeId) {
    return memory?.episodeId === episodeId && memory.leftLiveAt === null
      ? liveGraceView(memory)
      : { episodeId, open: true, interrupted: false };
  }
  if (status === "OFF_AIR" || (memory && episodeId && episodeId !== memory.episodeId)) {
    return CLOSED;
  }
  return liveGraceView(memory);
}
