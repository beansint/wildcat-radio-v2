"use client";

import { useEffect, useRef, useState } from "react";
import { acquireSocket, type SocketLease } from "@/lib/realtime/socket";
import { getStreamManifest } from "@/lib/api/endpoints/stream/stream";
import type { Socket } from "socket.io-client";
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
  const [endedEpisodeId, setEndedEpisodeId] = useState<string | null>(null);
  const lifecycleVersion = useRef(0);
  const reconcileRef = useRef<() => void>(() => {});
  useEffect(() => {
    let cancelled = false;
    let lease: SocketLease<Socket> | undefined;
    const ended = (event: { episodeId: string }) => {
      lifecycleVersion.current += 1;
      setEndedEpisodeId(event.episodeId);
    };
    const started = (event: { episodeId: string }) => {
      lifecycleVersion.current += 1;
      setEndedEpisodeId(current => current === event.episodeId ? null : current);
    };
    const connected = () => reconcileRef.current();
    void acquireSocket().then(next => {
      if (cancelled) { next.release(); return; }
      lease = next;
      next.socket.on('episode:ended', ended);
      next.socket.on('episode:started', started);
      next.socket.on('connect', connected);
      if (!next.socket.connected) next.socket.connect();
    }).catch(() => { /* Existing status polling/grace remains the fallback. */ });
    return () => {
      cancelled = true;
      lease?.socket.off('episode:ended', ended);
      lease?.socket.off('episode:started', started);
      lease?.socket.off('connect', connected);
      lease?.release();
    };
  }, []);

  useEffect(() => {
    if (!endedEpisodeId) return;
    let active = true;
    let controller: AbortController | undefined;
    const reconcile = async () => {
      if (document.hidden) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      const version = lifecycleVersion.current;
      try {
        // Fetch after the end, never trust the player's cached LIVE observation.
        const manifest = await getStreamManifest({ signal: request.signal, cache: 'no-store' });
        if (active && !request.signal.aborted && version === lifecycleVersion.current
          && manifest.status === 'LIVE' && manifest.episodeId === endedEpisodeId) {
          setEndedEpisodeId(current => current === endedEpisodeId ? null : current);
        }
      } catch { /* Keep the terminal marker until a fresh observation succeeds. */ }
    };
    const resume = () => { void reconcile(); };
    reconcileRef.current = resume;
    resume();
    const timer = window.setInterval(resume, 15_000);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      controller?.abort();
      reconcileRef.current = () => {};
      window.clearInterval(timer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [endedEpisodeId]);

  useEffect(() => {
    const observation = { status, episodeId, endedEpisodeId };
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
  }, [status, episodeId, endedEpisodeId]);

  // Render-time short-cuts so the deferred fold never shows a stale frame:
  // a LIVE episode is open now; OFF_AIR / another episode closes now.
  if (endedEpisodeId && endedEpisodeId === (episodeId ?? memory?.episodeId)) return CLOSED;
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


