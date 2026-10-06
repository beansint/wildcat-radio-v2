"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useGetStreamManifest } from "@/lib/api/endpoints/stream/stream";
import { useStreamPresence, type UpNextPeek } from "@/lib/realtime/use-stream-presence";
import { ToastHost, pushToast } from "@/components/listen/toast";
import type { GetStreamManifest200Reason } from "@/lib/api/model";
import { PlayAttemptTracker } from "./play-attempt";
import {
  MANIFEST_POLL_RETRIES,
  MANIFEST_STALE_AFTER_MS,
  manifestRetryDelay,
  resolveManifestAvailability,
  type ManifestAvailability,
} from "./manifest-health";
import { reconnectDelayMs } from "./reconnect-backoff";

type StreamStatus = "LIVE" | "STATION_ROTATION" | "OFF_AIR";

/**
 * A live stream has states a boolean `isPlaying` cannot express. Pressing play
 * on HLS takes 1-3s before the first byte sounds, and campus wifi drops mid
 * broadcast — both previously looked identical to "nothing happened".
 *
 * - `idle`         nothing requested
 * - `connecting`   play() issued, no audio yet  → spinner
 * - `playing`      audio is actually sounding
 * - `reconnecting` was playing, stalled or errored, recovery in flight
 */
export type PlayerPhase = "idle" | "connecting" | "playing" | "reconnecting";

export type { ManifestAvailability };

export interface StreamState {
  /** Status resolved from socket (preferred) or manifest poll */
  status: StreamStatus;
  /** #127 — why the stream is not LIVE (manifest / `stream:status`), null when LIVE or unknown. */
  reason: GetStreamManifest200Reason | null;
  /** #127 — server auto-end deadline (ISO) while a LIVE episode's encoder is stale. */
  autoEndsAt: string | null;
  manifestUrl: string | null;
  djs: string[];
  episodeId: string | null;
  /** #106: show the active episode belongs to (null when unscheduled / off air). */
  showId: string | null;
  showName: string | null;
  /** Listener count from socket (null if no socket data yet) */
  listeners: number | null;
  manifestAvailability: ManifestAvailability;
  isPlaying: boolean;
  /** Finer-grained than `isPlaying` — drives the buffering/reconnecting UI. */
  phase: PlayerPhase;
  /** Next queue item, only while listening (see useStreamPresence). */
  upNext: UpNextPeek | null;
  play: () => void;
  pause: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

const StreamContext = createContext<StreamState | null>(null);
const LAST_GOOD_MANIFEST_MS = 60_000;

/**
 * #127 — hls.js tuned for a live radio edge that blips. Sitting three segments
 * behind live lets a short encoder reconnect drain buffer instead of stalling;
 * the loader retries a failed playlist once itself before handing the fatal
 * error to our own backoff (which rebuilds the session, see `scheduleRecovery`).
 */
const HLS_CONFIG = {
  liveSyncDurationCount: 3,
  liveMaxLatencyDurationCount: 10,
  manifestLoadPolicy: {
    default: {
      maxTimeToFirstByteMs: 10_000,
      maxLoadTimeMs: 20_000,
      timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 },
      errorRetry: { maxNumRetry: 1, retryDelayMs: 1_000, maxRetryDelayMs: 4_000 },
    },
  },
  playlistLoadPolicy: {
    default: {
      maxTimeToFirstByteMs: 10_000,
      maxLoadTimeMs: 20_000,
      timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 },
      errorRetry: { maxNumRetry: 2, retryDelayMs: 1_000, maxRetryDelayMs: 4_000 },
    },
  },
};

export function StreamProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<PlayerPhase>("idle");
  const [expiredManifestAt, setExpiredManifestAt] = useState<number | null>(null);
  // #127 — a single failed poll used to flip every surface to "unavailable"
  // (the app-wide default is `retry: false`). Retry each poll with backoff and
  // only call the status service unavailable once the outage is real.
  const {
    data: manifest,
    dataUpdatedAt,
    errorUpdatedAt,
    errorUpdateCount,
    isPending,
    isError,
  } = useGetStreamManifest({
    query: {
      refetchInterval: 15_000,
      retry: MANIFEST_POLL_RETRIES,
      retryDelay: manifestRetryDelay,
    },
  });

  // Failed polls since the last success: React Query counts errors in total,
  // so remember the count at each success (adjust-state-during-render pattern).
  const [failureBase, setFailureBase] = useState({ at: dataUpdatedAt, count: errorUpdateCount });
  if (failureBase.at !== dataUpdatedAt) {
    setFailureBase({ at: dataUpdatedAt, count: errorUpdateCount });
  }
  const baseCount = failureBase.at === dataUpdatedAt ? failureBase.count : errorUpdateCount;
  const consecutiveFailures = isError ? Math.max(1, errorUpdateCount - baseCount) : 0;
  // The 30 s "no success" deadline needs a clock tick even if no further poll
  // settles in between; read the time in a timer, never during render.
  const [staleClock, setStaleClock] = useState(0);
  useEffect(() => {
    if (!isError || !dataUpdatedAt) return;
    const timer = window.setTimeout(
      () => setStaleClock(Date.now()),
      Math.max(0, dataUpdatedAt + MANIFEST_STALE_AFTER_MS - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [dataUpdatedAt, isError]);
  const manifestAvailability: ManifestAvailability = resolveManifestAvailability({
    hasData: manifest !== undefined,
    isPending,
    consecutiveFailures,
    lastSuccessAt: dataUpdatedAt || null,
    now: Math.max(staleClock, errorUpdatedAt),
  });

  const unavailable = manifestAvailability === "unavailable";
  // Cached metadata only keeps an already sounding source alive. It does not
  // enable a fresh play or claim the status service is currently available.
  const retainManifest = unavailable && (phase === "playing" || phase === "reconnecting")
    && dataUpdatedAt > 0 && expiredManifestAt !== dataUpdatedAt && !!manifest?.url
    && manifest.status !== "OFF_AIR";
  const manifestUsable = manifestAvailability === "ready" || retainManifest;
  useEffect(() => {
    if (!unavailable || phase === "idle" || !dataUpdatedAt || !manifest?.url) return;
    // Absolute deadline from the last success, never extended by failed polls.
    const timer = window.setTimeout(() => setExpiredManifestAt(dataUpdatedAt),
      Math.max(0, dataUpdatedAt + LAST_GOOD_MANIFEST_MS - Date.now()));
    return () => window.clearTimeout(timer);
  }, [dataUpdatedAt, unavailable, phase, manifest?.url]);
  const manifestStatus: StreamStatus = manifestUsable ? (manifest?.status ?? "OFF_AIR") : "OFF_AIR";
  const manifestUrl: string | null = manifestUsable ? (manifest?.url ?? null) : null;
  // FE#47 — `manifest?.dj ?? []` produced a NEW array identity on every render.
  // The manifest query polls every 15s, so that alone re-rendered every
  // consumer (including `GlobalPlayer`, which is in the root layout and
  // therefore on every route) even when the DJ list had not changed.
  const rawDjs = manifestUsable ? manifest?.dj : undefined;
  const djs: string[] = useMemo(() => rawDjs ?? [], [rawDjs]);
  const episodeId: string | null = manifestUsable ? (manifest?.episodeId ?? null) : null;
  const showId: string | null = manifestUsable ? (manifest?.showId ?? null) : null;

  const showName = manifestUsable ? (manifest?.showName ?? null) : null;

  /** Mirror of `phase` for event handlers / timers that must not run effects in updaters. */
  const phaseRef = useRef<PlayerPhase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const changePhase = useCallback((next: PlayerPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);
  // Presence must count people who can actually HEAR the stream — a listener
  // stuck buffering or reconnecting is not an audience member.
  const isPlaying = phase === "playing";

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hlsRef = useRef<any>(null);
  const playAttempts = useRef(new PlayAttemptTracker());
  /**
   * #127 — unbounded, backed-off recovery (supersedes FE#66's three instant
   * retries + terminal idle). Each failure schedules one rebuild of the
   * session after `reconnectDelayMs(attempt)`; audio actually sounding again
   * resets the ladder. Only the listener (pause) or OFF_AIR ends the intent.
   */
  const recoveryAttempts = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  /** URL the current playback session was started with (FE#66 url-change reattach). */
  const playingUrlRef = useRef<string | null>(null);
  /** Latest usable manifest URL, for retries scheduled before it changed. */
  const latestUrlRef = useRef<string | null>(null);
  /**
   * Rebuilding a source (`src=` / hls detach) makes the element fire `pause`.
   * That is our own recovery, not the listener stopping — ignore it until
   * audio plays again (Safari native HLS used to drop to idle here).
   */
  const suppressPauseRef = useRef(false);

  const { listeners, socketStatus, socketReason, socketAutoEndsAt, socketEpisodeId, upNext } =
    useStreamPresence(episodeId, isPlaying);

  const socketMatchesCurrentStream =
    socketEpisodeId === null || socketEpisodeId === episodeId;
  const useSocket = manifestStatus !== "OFF_AIR" && socketMatchesCurrentStream && socketStatus !== null;
  const status: StreamStatus = useSocket ? socketStatus : manifestStatus;
  const reason: GetStreamManifest200Reason | null = useSocket
    ? socketReason
    : manifestUsable ? (manifest?.reason ?? null) : null;
  const autoEndsAt: string | null =
    useSocket && socketAutoEndsAt !== undefined
      ? socketAutoEndsAt
      : manifestUsable ? (manifest?.autoEndsAt ?? null) : null;

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  // `attach` and `scheduleRecovery` reference each other; the ref breaks the cycle.
  const restartRef = useRef<() => void>(() => {});

  const scheduleRecovery = useCallback(() => {
    if (phaseRef.current === "idle" || retryTimerRef.current !== null) return;
    const delay = reconnectDelayMs(recoveryAttempts.current);
    recoveryAttempts.current += 1;
    suppressPauseRef.current = true;
    changePhase("reconnecting");
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      restartRef.current();
    }, delay);
  }, [changePhase]);

  /** Start (or rebuild) a playback session on `url`. */
  const attach = useCallback(
    async (url: string, attempt: { isCurrent: () => boolean }) => {
      const audio = audioRef.current;
      if (!audio) return;
      // Lazy-import hls.js to avoid SSR issues
      const { default: Hls } = await import("hls.js");
      if (!attempt.isCurrent()) return;

      const onPlayRejected = (error: unknown) => {
        if (!attempt.isCurrent()) return;
        // Autoplay refused: only the listener can fix that, so stop and say so.
        // Anything else (source failed, load aborted) is a stream problem —
        // keep trying while they still want audio.
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          suppressPauseRef.current = false;
          changePhase("idle");
          pushToast("Playback couldn't start — tap play again");
          return;
        }
        scheduleRecovery();
      };

      suppressPauseRef.current = true;
      if (Hls.isSupported()) {
        destroyHls();
        const hls = new Hls(HLS_CONFIG);
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(audio);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!attempt.isCurrent()) return;
          // MANIFEST_PARSED fires asynchronously, outside the click's original
          // user-gesture window — autoplay rejection is a real scenario here.
          audio
            .play()
            .then(() => {
              if (!attempt.isCurrent()) return;
              suppressPauseRef.current = false;
              recoveryAttempts.current = 0;
              changePhase("playing");
            })
            .catch(onPlayRejected);
        });
        hls.on(
          Hls.Events.ERROR,
          (_: unknown, d: { fatal?: boolean; type?: string }) => {
            if (!d.fatal || !attempt.isCurrent() || hlsRef.current !== hls) return;
            const recoverable =
              d.type === Hls.ErrorTypes.NETWORK_ERROR || d.type === Hls.ErrorTypes.MEDIA_ERROR;
            if (recoverable) {
              destroyHls();
              scheduleRecovery();
              return;
            }
            destroyHls();
            suppressPauseRef.current = false;
            changePhase("idle");
            pushToast("The stream dropped — tap play to reconnect");
          },
        );
      } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
        destroyHls();
        audio.src = url;
        audio
          .play()
          .then(() => {
            if (!attempt.isCurrent()) return;
            suppressPauseRef.current = false;
            changePhase("playing");
          })
          .catch(onPlayRejected);
      } else {
        // Neither hls.js nor native HLS is supported — play() would otherwise
        // silently no-op with no feedback at all.
        pushToast("This browser can't play the live stream");
        suppressPauseRef.current = false;
        if (attempt.isCurrent()) changePhase("idle");
      }
    },
    [changePhase, destroyHls, scheduleRecovery],
  );

  const restart = useCallback(() => {
    const url = latestUrlRef.current;
    if (!url || phaseRef.current === "idle") return;
    playingUrlRef.current = url;
    void attach(url, playAttempts.current.start());
  }, [attach]);
  useEffect(() => {
    restartRef.current = restart;
  }, [restart]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !manifestUrl || manifestAvailability !== "ready") return;
    clearRetry();
    recoveryAttempts.current = 0;
    // Before anything awaits: HLS setup + first segment is 1-3s of silence, and
    // the old build showed nothing at all in that window.
    changePhase("connecting");
    latestUrlRef.current = manifestUrl;
    playingUrlRef.current = manifestUrl;
    void attach(manifestUrl, playAttempts.current.start());
  }, [attach, changePhase, clearRetry, manifestAvailability, manifestUrl]);

  const pause = useCallback(() => {
    playAttempts.current.cancel();
    clearRetry();
    suppressPauseRef.current = false;
    changePhase("idle");
    const audio = audioRef.current;
    if (audio) audio.pause();
    destroyHls();
  }, [changePhase, clearRetry, destroyHls]);

  useEffect(() => {
    if (manifestAvailability === "loading") return;
    if (manifestUsable && status !== "OFF_AIR") return;
    const timer = window.setTimeout(pause, 0);
    return () => window.clearTimeout(timer);
  }, [manifestAvailability, manifestUsable, pause, status]);

  /**
   * The <audio> element is the only thing that actually knows whether sound is
   * coming out. hls.js reporting a parsed manifest does not mean audible — so
   * the phase is driven off the media element's own events rather than assumed.
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlaying = () => {
      // Audio audibly recovered — restore the full recovery ladder.
      recoveryAttempts.current = 0;
      suppressPauseRef.current = false;
      if (phaseRef.current !== "idle") changePhase("playing");
    };
    // Native HLS (Safari): hls.js handles its own errors, but the native
    // pipeline surfaces failures only through the media element.
    const onError = () => {
      if (hlsRef.current) return; // hls.js branch owns its errors
      scheduleRecovery();
    };
    // `waiting` fires both for the initial buffer and for a mid-stream
    // underrun; only the latter is a "reconnect".
    const onWaiting = () => {
      if (phaseRef.current === "playing") changePhase("reconnecting");
    };
    const onStalled = () => {
      if (phaseRef.current !== "idle") changePhase("reconnecting");
    };
    const onPause = () => {
      if (suppressPauseRef.current) return;
      // Paused from outside the app (headphones unplugged, OS) — honour it.
      playAttempts.current.cancel();
      clearRetry();
      changePhase("idle");
    };

    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("stalled", onStalled);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("stalled", onStalled);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
    };
  }, [changePhase, clearRetry, scheduleRecovery]);

  /**
   * FE#66 — the manifest URL can change while playing (episode turnover, or
   * the backend switching origins). Reattach to the new source in place,
   * keeping the session "playing" from the user's point of view.
   */
  useEffect(() => {
    latestUrlRef.current = manifestUrl;
    if (phaseRef.current === "idle") return;
    if (!manifestUrl || playingUrlRef.current === manifestUrl) return;
    clearRetry();
    recoveryAttempts.current = 0;
    restart();
  }, [clearRetry, manifestUrl, restart]);

  /**
   * #127 — while backing off after a failure, a change in the broadcast
   * (status recovered, status service back) is the best moment to retry: do
   * it now instead of waiting out a long backoff.
   */
  useEffect(() => {
    if (retryTimerRef.current === null || phaseRef.current === "idle") return;
    clearRetry();
    recoveryAttempts.current = 0;
    restart();
  }, [status, manifestAvailability, clearRetry, restart]);

  useEffect(() => () => clearRetry(), [clearRetry]);

  /**
   * Media Session — lock-screen artwork, OS media keys and headphone
   * play/pause. This was in FE#2's scope ("player shell + Media Session") but
   * never shipped. For a radio product it matters more than anything on screen:
   * the phone is in a pocket for most of a broadcast.
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;

    ms.metadata = new MediaMetadata({
      title: status === "LIVE" ? (showName ?? djs[0] ?? "Wildcat Radio") : "Wildcat Radio",
      artist:
        status === "LIVE"
          ? djs.length > 1
            ? djs.slice(1).join(", ")
            : "Live on air"
          : status === "STATION_ROTATION"
            ? "Station rotation"
            : "Off air",
      album: "Wildcat Radio · CIT-U",
      artwork: [
        { src: "/brand/logo-mascot-mark.png", sizes: "512x512", type: "image/png" },
      ],
    });
    ms.playbackState = isPlaying ? "playing" : "paused";

    ms.setActionHandler("play", () => void play());
    ms.setActionHandler("pause", () => pause());
    ms.setActionHandler("stop", () => pause());
    // A live stream has no timeline — leaving these unset makes the OS hide
    // the scrub/skip affordances rather than showing dead controls.
    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("stop", null);
    };
  }, [status, djs, showName, isPlaying, play, pause]);

  // FE#47 — the value object previously had a NEW identity on every provider
  // render, so each 15s manifest poll (and every phase blip) re-rendered every
  // consumer even when nothing they read had changed. Memoized so identity
  // only moves when a field actually does; leaf components add `memo()` on top.
  const value = useMemo<StreamState>(
    () => ({
      status,
      reason,
      autoEndsAt,
      manifestUrl,
      djs,
      episodeId,
      showId,
      showName,
      listeners,
      manifestAvailability,
      isPlaying,
      phase,
      upNext,
      play,
      pause,
      audioRef,
    }),
    [
      status,
      reason,
      autoEndsAt,
      manifestUrl,
      djs,
      episodeId,
      showId,
      showName,
      listeners,
      manifestAvailability,
      isPlaying,
      phase,
      upNext,
      play,
      pause,
    ],
  );

  return (
    <StreamContext.Provider value={value}>
      {children}
      <ToastHost />
    </StreamContext.Provider>
  );
}

export function useStream(): StreamState {
  const ctx = useContext(StreamContext);
  if (!ctx) throw new Error("useStream must be used within <StreamProvider>");
  return ctx;
}
