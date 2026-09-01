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
import { PlayAttemptTracker } from "./play-attempt";

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

export type ManifestAvailability = "loading" | "ready" | "unavailable";

export interface StreamState {
  /** Status resolved from socket (preferred) or manifest poll */
  status: StreamStatus;
  manifestUrl: string | null;
  djs: string[];
  episodeId: string | null;
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

export function StreamProvider({ children }: { children: ReactNode }) {
  const { data: manifest, isPending, isError } = useGetStreamManifest({
    query: { refetchInterval: 15_000 },
  });

  const manifestAvailability: ManifestAvailability = isError
    ? "unavailable"
    : isPending
      ? "loading"
      : "ready";
  const manifestReady = manifestAvailability === "ready";
  const manifestStatus: StreamStatus = manifestReady ? (manifest?.status ?? "OFF_AIR") : "OFF_AIR";
  const manifestUrl: string | null = manifestReady ? (manifest?.url ?? null) : null;
  // FE#47 — `manifest?.dj ?? []` produced a NEW array identity on every render.
  // The manifest query polls every 15s, so that alone re-rendered every
  // consumer (including `GlobalPlayer`, which is in the root layout and
  // therefore on every route) even when the DJ list had not changed.
  const rawDjs = manifestReady ? manifest?.dj : undefined;
  const djs: string[] = useMemo(() => rawDjs ?? [], [rawDjs]);
  const episodeId: string | null = manifestReady ? (manifest?.episodeId ?? null) : null;

  const [phase, setPhase] = useState<PlayerPhase>("idle");
  // Presence must count people who can actually HEAR the stream — a listener
  // stuck buffering or reconnecting is not an audience member.
  const isPlaying = phase === "playing";
  const setIsPlaying = useCallback(
    (v: boolean) => setPhase(v ? "playing" : "idle"),
    [],
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hlsRef = useRef<any>(null);
  const playAttempts = useRef(new PlayAttemptTracker());
  /**
   * FE#66 — bounded recovery. hls.js used to retry NETWORK/MEDIA errors
   * unconditionally, so a genuinely dead stream span looped "reconnecting"
   * forever with no terminal state. Each fatal error consumes one attempt;
   * a successful recovery (audio actually playing again) resets the budget.
   */
  const recoveryAttempts = useRef(0);
  const MAX_RECOVERY_ATTEMPTS = 3;
  /** URL the current playback session was started with (FE#66 url-change reattach). */
  const playingUrlRef = useRef<string | null>(null);

  const { listeners, socketStatus, socketEpisodeId, upNext } = useStreamPresence(
    episodeId,
    isPlaying,
  );

  const socketMatchesCurrentStream =
    socketEpisodeId === null || socketEpisodeId === episodeId;
  const status: StreamStatus =
    manifestAvailability !== "ready" || manifestStatus === "OFF_AIR"
      ? manifestStatus
      : socketMatchesCurrentStream
        ? (socketStatus ?? manifestStatus)
        : manifestStatus;

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !manifestUrl || manifestAvailability !== "ready") return;
    const attempt = playAttempts.current.start();

    // Before anything awaits: HLS setup + first segment is 1-3s of silence, and
    // the old build showed nothing at all in that window.
    setPhase("connecting");
    recoveryAttempts.current = 0;
    playingUrlRef.current = manifestUrl;

    // Lazy-import hls.js to avoid SSR issues
    const { default: Hls } = await import("hls.js");
    if (!attempt.isCurrent()) return;

    if (Hls.isSupported()) {
      destroyHls();
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(manifestUrl);
      hls.attachMedia(audio);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!attempt.isCurrent()) return;
        // MANIFEST_PARSED fires asynchronously, outside the click's original
        // user-gesture window — autoplay rejection is a real scenario here,
        // not just in the native-HLS branch below. Mirror that branch's
        // then/catch so isPlaying reflects what actually happened instead
        // of optimistically flipping to "playing" over dead air.
        audio
          .play()
          .then(() => {
            if (attempt.isCurrent()) setIsPlaying(true);
          })
          .catch(() => {
            if (!attempt.isCurrent()) return;
            setIsPlaying(false);
            pushToast("Playback couldn't start — tap play again");
          });
      });
      hls.on(
        Hls.Events.ERROR,
        (_: unknown, d: { fatal?: boolean; type?: string }) => {
          if (!d.fatal || !attempt.isCurrent()) return;
          // A campus stream drops. Previously ANY fatal error tore the player
          // down silently, so a recoverable 10-second wifi blip looked exactly
          // like the user having pressed stop. hls.js can recover the two
          // common classes in place — try a BOUNDED number of times, then
          // reach a terminal state with an explicit retry affordance (the
          // play button) instead of looping "reconnecting" forever.
          const recoverable =
            d.type === Hls.ErrorTypes.NETWORK_ERROR || d.type === Hls.ErrorTypes.MEDIA_ERROR;
          if (recoverable && recoveryAttempts.current < MAX_RECOVERY_ATTEMPTS) {
            recoveryAttempts.current += 1;
            setPhase("reconnecting");
            if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else hls.recoverMediaError();
            return;
          }
          destroyHls();
          setPhase("idle");
          pushToast("The stream dropped — tap play to reconnect");
        },
      );
    } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
      destroyHls();
      audio.src = manifestUrl;
      audio
        .play()
        .then(() => {
          if (attempt.isCurrent()) setIsPlaying(true);
        })
        .catch(() => {
          if (!attempt.isCurrent()) return;
          setIsPlaying(false);
          pushToast("Playback couldn't start — tap play again");
        });
    } else {
      // Neither hls.js nor native HLS is supported — play() would otherwise
      // silently no-op with no feedback at all.
      pushToast("This browser can't play the live stream");
      if (attempt.isCurrent()) setPhase("idle");
    }
  }, [manifestAvailability, manifestUrl, destroyHls, setIsPlaying]);

  const pause = useCallback(() => {
    playAttempts.current.cancel();
    const audio = audioRef.current;
    if (audio) audio.pause();
    destroyHls();
    setPhase("idle");
  }, [destroyHls]);

  useEffect(() => {
    if (manifestAvailability === "loading") return;
    if (manifestAvailability === "ready" && status !== "OFF_AIR") return;
    const timer = window.setTimeout(pause, 0);
    return () => window.clearTimeout(timer);
  }, [manifestAvailability, pause, status]);

  /**
   * The <audio> element is the only thing that actually knows whether sound is
   * coming out. hls.js reporting a parsed manifest does not mean audible — so
   * the phase is driven off the media element's own events rather than assumed.
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlaying = () => {
      // Audio audibly recovered — restore the full recovery budget (FE#66).
      recoveryAttempts.current = 0;
      setPhase((current) => (current === "idle" ? current : "playing"));
    };
    // FE#66 — native-HLS (Safari) parity: hls.js handles its own errors, but
    // the native pipeline surfaces failures only through the media element.
    // Retry with the same bounded ladder, then fall terminal with the toast.
    const onError = () => {
      if (hlsRef.current) return; // hls.js branch owns its errors
      setPhase((current) => {
        if (current === "idle") return current;
        if (recoveryAttempts.current < MAX_RECOVERY_ATTEMPTS) {
          recoveryAttempts.current += 1;
          audio.load();
          void audio.play().catch(() => {});
          return "reconnecting";
        }
        pushToast("The stream dropped — tap play to reconnect");
        return "idle";
      });
    };
    // `waiting` fires both for the initial buffer and for a mid-stream
    // underrun; only the latter is a "reconnect".
    const onWaiting = () =>
      setPhase((p) => (p === "idle" ? p : p === "playing" ? "reconnecting" : p));
    const onStalled = () => setPhase((p) => (p === "idle" ? p : "reconnecting"));
    const onPause = () => setPhase("idle");

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
  }, []);

  /**
   * FE#66 — the manifest URL can change while playing (episode turnover, or
   * the backend switching origins). `play` closes over the OLD url, so without
   * this the audio keeps pulling a stale playlist until it 404s. Reattach to
   * the new source in place, keeping the session "playing" from the user's
   * point of view.
   */
  useEffect(() => {
    if (phase === "idle") return;
    if (!manifestUrl || playingUrlRef.current === manifestUrl) return;
    void play();
    // `play` is identity-stable per manifestUrl; phase deliberately excluded —
    // this must fire on URL change, not on every buffering blip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifestUrl, play]);

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
      title: status === "LIVE" && djs.length > 0 ? djs[0] : "Wildcat Radio",
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
  }, [status, djs, isPlaying, play, pause]);

  // FE#47 — the value object previously had a NEW identity on every provider
  // render, so each 15s manifest poll (and every phase blip) re-rendered every
  // consumer even when nothing they read had changed. Memoized so identity
  // only moves when a field actually does; leaf components add `memo()` on top.
  const value = useMemo<StreamState>(
    () => ({
      status,
      manifestUrl,
      djs,
      episodeId,
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
      manifestUrl,
      djs,
      episodeId,
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
