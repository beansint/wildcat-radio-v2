"use client";

import { useStream } from "@/lib/stream/stream-context";
import { Pause, Play } from "lucide-react";

/**
 * Global persistent player — lives in the root layout so it never remounts on
 * navigation (v2-build/00 §5.5). Plays an HLS audio stream via hls.js (or
 * native HLS on Safari). Reads status from StreamContext (manifest + socket).
 */
export function GlobalPlayer() {
  const { status, djs, isPlaying, play, pause, audioRef } = useStream();

  const canPlay = status !== "OFF_AIR";

  const showTitle =
    status === "LIVE"
      ? djs.length > 0
        ? djs[0]
        : "Wildcat Radio"
      : status === "STATION_ROTATION"
        ? "Wildcat Radio"
        : "Wildcat Radio";

  const showSub =
    status === "LIVE"
      ? djs.length > 1
        ? djs.slice(1).join(", ")
        : "Live on air"
      : status === "STATION_ROTATION"
        ? "Station rotation"
        : "Off air";

  function handlePlayPause() {
    if (isPlaying) {
      pause();
    } else if (canPlay) {
      play();
    }
  }

  return (
    <div className="wc-player" role="region" aria-label="Now playing">
      {/* Hidden audio element — controlled via ref from StreamContext */}
      <audio ref={audioRef} data-testid="player-audio" />

      <div className="wc-player-inner">
        {/* Cover art */}
        <div className="wc-art cover rounded-[10px] w-11 h-11 flex-none" />

        {/* Meta */}
        <div className="meta">
          <div className="title flex items-center gap-2">
            <span data-testid="now-playing">{showTitle}</span>
            {status === "LIVE" && (
              <span className="wc-badge-live" style={{ fontSize: ".6rem", padding: ".2rem .5rem" }}>
                <span className="dot" />
                Live
              </span>
            )}
          </div>
          <div className="sub">{showSub}</div>
        </div>

        {/* EQ bars — animate while playing */}
        {isPlaying && (
          <div className="eq text-gold mr-1" aria-hidden="true">
            <i /><i /><i /><i />
          </div>
        )}

        {/* Status badge (for test targeting) */}
        <span
          data-testid="player-status"
          className="sr-only"
        >
          {status}
        </span>

        {/* Play / Pause button */}
        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play live stream"}
          data-testid="player-play"
          onClick={handlePlayPause}
          disabled={!canPlay && !isPlaying}
          className="wc-play"
        >
          {isPlaying ? (
            <Pause className="w-6 h-6" aria-hidden="true" />
          ) : (
            <Play className="w-6 h-6" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
