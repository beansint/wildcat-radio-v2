"use client";

import Link from "next/link";
import { Mic, Play, Pause, Users } from "lucide-react";
import { useStream } from "@/lib/stream/stream-context";

/**
 * Hero live-status card — shows current broadcast state, listener count,
 * show art, DJ chips and a play button that triggers the GlobalPlayer.
 * Used on the landing page hero.
 */
export function LiveStatusCard() {
  const { status, djs, listeners, isPlaying, play, pause } = useStream();

  const canPlay = status !== "OFF_AIR";

  function handlePlayPause() {
    if (isPlaying) {
      pause();
    } else if (canPlay) {
      play();
    }
  }

  const showName =
    status === "LIVE"
      ? djs.length > 0
        ? `${djs[0]}'s Show`
        : "Wildcat Radio Live"
      : status === "STATION_ROTATION"
        ? "Station Rotation"
        : "Off Air";

  const nowPlayingLine =
    status === "LIVE"
      ? djs.join(", ") || "On air now"
      : status === "STATION_ROTATION"
        ? "Auto-curated playlist"
        : "Tune in later";

  return (
    <div className="wc-card text-card-foreground shadow-xl">
      <div className="wc-card-pad">
        {/* Top row: badge + listener count */}
        <div className="flex items-center justify-between mb-4">
          {status === "LIVE" ? (
            <span className="wc-badge-live" data-testid="live-badge">
              <span className="dot" aria-hidden="true" />
              Live now
            </span>
          ) : status === "STATION_ROTATION" ? (
            <span className="wc-badge-rotation" data-testid="live-badge">
              Station rotation
            </span>
          ) : (
            <span className="wc-badge-off" data-testid="live-badge">
              Off air
            </span>
          )}

          <span className="wc-chip-ghost" data-testid="listener-count">
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="tnum">{listeners ?? "—"}</span>
            {" "}listening
          </span>
        </div>

        {/* Show art + meta */}
        <div className="flex items-center gap-4">
          <div
            className="wc-art rounded-xl w-20 h-20 flex-none"
            role="img"
            aria-label="Show art"
          />
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide wc-muted">
              On air
            </div>
            <div className="text-xl font-extrabold truncate">{showName}</div>
            <div className="wc-muted text-sm flex items-center gap-2 mt-1 flex-wrap">
              {status === "LIVE" && djs.length > 0 ? (
                djs.map((dj) => (
                  <span key={dj} className="wc-chip">
                    <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                    {dj}
                  </span>
                ))
              ) : (
                <span className="wc-chip-ghost">Wildcat Radio</span>
              )}
            </div>
          </div>
        </div>

        {/* Play row */}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            className="wc-play"
            onClick={handlePlayPause}
            disabled={!canPlay && !isPlaying}
            aria-label={isPlaying ? "Pause live stream" : "Play live stream"}
            data-testid="listen-play"
          >
            {isPlaying ? (
              <Pause className="w-6 h-6" aria-hidden="true" />
            ) : (
              <Play className="w-6 h-6" aria-hidden="true" />
            )}
          </button>
          <div className="text-sm wc-muted" data-testid="now-playing">
            Now playing ·{" "}
            <span className="text-foreground font-semibold">{nowPlayingLine}</span>
          </div>
        </div>
      </div>

      <Link
        href="/listen"
        className="block text-center py-3 font-bold bg-accent text-accent-foreground border-t hover:bg-accent/80 transition-colors"
        style={{ borderColor: "var(--border)" }}
      >
        Join the chat →
      </Link>
    </div>
  );
}
