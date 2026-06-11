"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

type StreamStatus = "LIVE" | "STATION_ROTATION" | "OFF_AIR";

interface ManifestResponse {
  status: StreamStatus;
  type: "hls";
  url: string | null;
  dj: string[];
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Global persistent player — lives in the root layout so it never re-mounts on
 * navigation (v2-build/00 §5.5). Plays an HLS audio stream via hls.js (or native
 * HLS on Safari). Polls /api/stream/manifest every 15s for live status.
 */
export function GlobalPlayer() {
  const [status, setStatus] = useState<StreamStatus>("OFF_AIR");
  const [manifestUrl, setManifestUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // --- Poll manifest ---
  useEffect(() => {
    let alive = true;

    const poll = () =>
      fetch(`${API}/api/stream/manifest`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: ManifestResponse | null) => {
          if (!alive || !d) return;
          if (d.status) setStatus(d.status);
          if (d.url !== undefined) setManifestUrl(d.url);
        })
        .catch(() => {
          /* manifest endpoint not yet live — stay OFF_AIR */
        });

    poll();
    const id = setInterval(poll, 15_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // --- Cleanup Hls instance on unmount ---
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  // --- Destroy existing Hls instance helper ---
  function destroyHls() {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }

  // --- Play / Pause toggle ---
  function handlePlayPause() {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      destroyHls();
      setIsPlaying(false);
      return;
    }

    if (!manifestUrl) return;

    if (Hls.isSupported()) {
      // Modern browsers — use hls.js
      destroyHls();
      const hls = new Hls();
      hlsRef.current = hls;

      hls.loadSource(manifestUrl);
      hls.attachMedia(audio);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        audio.play().catch(() => {
          /* autoplay blocked — user has already clicked so this shouldn't happen */
        });
        setIsPlaying(true);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          destroyHls();
          setIsPlaying(false);
        }
      });
    } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari — native HLS support
      destroyHls();
      audio.src = manifestUrl;
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    }
  }

  const statusLabel =
    status === "LIVE"
      ? "On air"
      : status === "STATION_ROTATION"
        ? "Station rotation"
        : "Off air";

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-maroon-dark/30 bg-maroon text-white">
      {/* Hidden audio element — controlled via ref */}
      <audio ref={audioRef} data-testid="player-audio" />

      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play"}
          data-testid="player-play"
          onClick={handlePlayPause}
          className="grid h-10 w-10 place-items-center rounded-full bg-gold font-bold text-maroon"
        >
          {isPlaying ? "⏸" : "▶"}
        </button>

        <div className="flex-1">
          <p className="text-sm font-semibold">Wildcat Radio</p>
          <p className="text-xs opacity-80">{statusLabel}</p>
        </div>

        <span
          data-testid="player-status"
          className="rounded-full bg-black/25 px-2 py-1 text-[10px] uppercase tracking-wide"
        >
          {status}
        </span>
      </div>
    </div>
  );
}
