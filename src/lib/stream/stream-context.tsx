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

interface ManifestData {
  status?: StreamStatus;
  url?: string | null;
  dj?: string[];
  episodeId?: string | null;
}

export interface StreamState {
  /** Status resolved from socket (preferred) or manifest poll */
  status: StreamStatus;
  manifestUrl: string | null;
  djs: string[];
  episodeId: string | null;
  /** Listener count from socket (null if no socket data yet) */
  listeners: number | null;
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
  const { data } = useGetStreamManifest({
    query: { refetchInterval: 15_000 },
  });

  const manifest = data as unknown as ManifestData | undefined;
  const manifestStatus: StreamStatus = manifest?.status ?? "OFF_AIR";
  const manifestUrl: string | null = manifest?.url ?? null;
  // FE#47 — `manifest?.dj ?? []` produced a NEW array identity on every render.
  // The manifest query polls every 15s, so that alone re-rendered every
  // consumer (including `GlobalPlayer`, which is in the root layout and
  // therefore on every route) even when the DJ list had not changed.
  const rawDjs = manifest?.dj;
  const djs: string[] = useMemo(() => rawDjs ?? [], [rawDjs]);
  const episodeId: string | null = manifest?.episodeId ?? null;

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

  const { listeners, socketStatus, upNext } = useStreamPresence(episodeId, isPlaying);

  const status: StreamStatus = socketStatus ?? manifestStatus;

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !manifestUrl) return;

    // Before anything awaits: HLS setup + first segment is 1-3s of silence, and
    // the old build showed nothing at all in that window.
    setPhase("connecting");

    // Lazy-import hls.js to avoid SSR issues
    const { default: Hls } = await import("hls.js");

    if (Hls.isSupported()) {
      destroyHls();
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(manifestUrl);
      hls.attachMedia(audio);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // MANIFEST_PARSED fires asynchronously, outside the click's original
        // user-gesture window — autoplay rejection is a real scenario here,
        // not just in the native-HLS branch below. Mirror that branch's
        // then/catch so isPlaying reflects what actually happened instead
        // of optimistically flipping to "playing" over dead air.
        audio
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {
            setIsPlaying(false);
            pushToast("Playback couldn't start — tap play again");
          });
      });
      hls.on(
        Hls.Events.ERROR,
        (_: unknown, d: { fatal?: boolean; type?: string }) => {
          if (!d.fatal) return;
          // A campus stream drops. Previously ANY fatal error tore the player
          // down silently, so a recoverable 10-second wifi blip looked exactly
          // like the user having pressed stop. hls.js can recover the two
          // common classes in place — try, and only give up if that fails.
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setPhase("reconnecting");
            hls.startLoad();
            return;
          }
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
            setPhase("reconnecting");
            hls.recoverMediaError();
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
        .then(() => setIsPlaying(true))
        .catch(() => {
          setIsPlaying(false);
          pushToast("Playback couldn't start — tap play again");
        });
    } else {
      // Neither hls.js nor native HLS is supported — play() would otherwise
      // silently no-op with no feedback at all.
      pushToast("This browser can't play the live stream");
    }
  }, [manifestUrl, destroyHls, pushToast]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.pause();
    destroyHls();
    setPhase("idle");
  }, [destroyHls]);

  /**
   * The <audio> element is the only thing that actually knows whether sound is
   * coming out. hls.js reporting a parsed manifest does not mean audible — so
   * the phase is driven off the media element's own events rather than assumed.
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlaying = () => setPhase("playing");
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
    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("stalled", onStalled);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

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

  return (
    <StreamContext.Provider
      value={{
        status,
        manifestUrl,
        djs,
        episodeId,
        listeners,
        isPlaying,
        phase,
        upNext,
        play,
        pause,
        audioRef,
      }}
    >
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
