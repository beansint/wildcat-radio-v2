"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useGetStreamManifest } from "@/lib/api/endpoints/stream/stream";
import { useStreamPresence } from "@/lib/realtime/use-stream-presence";

type StreamStatus = "LIVE" | "STATION_ROTATION" | "OFF_AIR";

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
  const djs: string[] = manifest?.dj ?? [];
  const episodeId: string | null = manifest?.episodeId ?? null;

  const [isPlaying, setIsPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hlsRef = useRef<any>(null);

  const { listeners, socketStatus } = useStreamPresence(episodeId, isPlaying);

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

    // Lazy-import hls.js to avoid SSR issues
    const { default: Hls } = await import("hls.js");

    if (Hls.isSupported()) {
      destroyHls();
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(manifestUrl);
      hls.attachMedia(audio);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        audio.play().catch(() => {});
        setIsPlaying(true);
      });
      hls.on(Hls.Events.ERROR, (_: unknown, d: { fatal?: boolean }) => {
        if (d.fatal) {
          destroyHls();
          setIsPlaying(false);
        }
      });
    } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
      destroyHls();
      audio.src = manifestUrl;
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [manifestUrl, destroyHls]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.pause();
    destroyHls();
    setIsPlaying(false);
  }, [destroyHls]);

  return (
    <StreamContext.Provider
      value={{
        status,
        manifestUrl,
        djs,
        episodeId,
        listeners,
        isPlaying,
        play,
        pause,
        audioRef,
      }}
    >
      {children}
    </StreamContext.Provider>
  );
}

export function useStream(): StreamState {
  const ctx = useContext(StreamContext);
  if (!ctx) throw new Error("useStream must be used within <StreamProvider>");
  return ctx;
}
