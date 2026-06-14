"use client";

import { Mic, MessageSquare, Pause, Play, Users } from "lucide-react";
import Image from "next/image";
import { TopNav } from "@/components/layout/top-nav";
import { BottomNav } from "@/components/layout/bottom-nav";
import { useStream } from "@/lib/stream/stream-context";

export default function ListenPage() {
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

  const subLine =
    status === "LIVE"
      ? djs.join(", ") || "Live on air"
      : status === "STATION_ROTATION"
        ? "Auto-curated playlist"
        : "No stream currently";

  return (
    <>
      <TopNav />

      {/* Sticky live-player header */}
      <div
        className="sticky z-30 wc-grad-ink text-white"
        style={{ top: "57px" }}
        role="region"
        aria-label="Live stream header"
      >
        <div className="wc-container py-3 flex items-center gap-3">
          {/* Show art */}
          <div
            className="wc-art rounded-xl w-12 h-12 flex-none"
            role="img"
            aria-label="Show art"
          />

          {/* Meta */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {status === "LIVE" ? (
                <span
                  className="wc-badge-live"
                  style={{ fontSize: ".6rem", padding: ".2rem .5rem" }}
                  data-testid="live-badge"
                >
                  <span className="dot" aria-hidden="true" />
                  Live
                </span>
              ) : status === "STATION_ROTATION" ? (
                <span
                  className="wc-badge-rotation"
                  style={{ fontSize: ".6rem", padding: ".2rem .5rem" }}
                  data-testid="live-badge"
                >
                  Rotation
                </span>
              ) : (
                <span
                  className="wc-badge-off"
                  style={{ fontSize: ".6rem", padding: ".2rem .5rem" }}
                  data-testid="live-badge"
                >
                  Off air
                </span>
              )}
              <span className="font-bold truncate" data-testid="now-playing">
                {showName}
              </span>
            </div>
            <div className="text-xs truncate" style={{ color: "rgba(255,255,255,.7)" }}>
              {subLine}
            </div>
          </div>

          {/* Listener count */}
          <span
            className="wc-chip-ghost"
            style={{ background: "rgba(255,255,255,.12)", color: "rgba(255,255,255,.8)" }}
            data-testid="listener-count"
          >
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="tnum">{listeners ?? "—"}</span>
          </span>

          {/* Play/pause */}
          <button
            type="button"
            className="wc-play w-11 h-11"
            style={{ width: "44px", height: "44px" }}
            onClick={handlePlayPause}
            disabled={!canPlay && !isPlaying}
            aria-label={isPlaying ? "Pause live stream" : "Play live stream"}
            data-testid="listen-play"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Play className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Main area */}
      <main
        className="flex-1 wc-container w-full grid lg:grid-cols-[1fr_320px] gap-4 py-4 pb-28"
        style={{ background: "var(--muted)", minHeight: "calc(100dvh - 57px - 64px)" }}
      >
        {/* Station info card */}
        <section className="flex flex-col gap-4">
          <div className="wc-card wc-card-pad">
            <div className="flex items-center gap-4 mb-4">
              <div
                className="wc-art rounded-xl w-24 h-24 flex-none"
                role="img"
                aria-label="Station art"
              />
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wide wc-muted mb-1">
                  Now on air
                </div>
                <h1 className="text-2xl font-extrabold truncate">{showName}</h1>
                {status === "LIVE" && djs.length > 0 && (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {djs.map((dj) => (
                      <span key={dj} className="wc-chip">
                        <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                        {dj}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <p className="wc-muted text-sm leading-relaxed">
              {status === "LIVE"
                ? "You're listening live. Use the player above to adjust volume, or pop open the full player at the bottom of the screen."
                : status === "STATION_ROTATION"
                  ? "Wildcat Radio is playing an auto-curated playlist. A live show will be on soon — stay tuned!"
                  : "Wildcat Radio is currently off air. Check back during broadcasting hours for live shows."}
            </p>
          </div>

          {/* About card */}
          <div className="wc-card wc-card-pad flex items-center gap-4">
            <Image
              src="/brand/logo-mascot-mark.png"
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 flex-none"
              aria-hidden="true"
            />
            <div>
              <div className="font-bold mb-1">About Wildcat Radio</div>
              <p className="text-sm wc-muted">
                The official campus radio station of Cebu Institute of Technology –
                University. Broadcasting student voices since day one.
              </p>
            </div>
          </div>
        </section>

        {/* Engagement sidebar placeholder */}
        <aside>
          <div className="wc-card wc-card-pad sticky" style={{ top: "130px" }}>
            <div className="flex items-center gap-3 mb-3">
              <div
                className="rounded-xl p-2 flex-none"
                style={{ background: "color-mix(in srgb, var(--muted) 80%, transparent)" }}
              >
                <MessageSquare className="w-5 h-5 wc-muted" aria-hidden="true" />
              </div>
              <div>
                <div className="font-extrabold text-sm">Chat &amp; requests</div>
                <div className="text-xs wc-muted">Coming soon</div>
              </div>
            </div>
            <p className="text-sm wc-muted leading-relaxed">
              Live chat, song requests, dedications, and Q&amp;A with the DJ are coming
              in a future update. Stay tuned!
            </p>
            <div
              className="mt-4 rounded-xl p-3 text-center"
              style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
            >
              <div className="text-xs font-bold uppercase tracking-wide mb-1">Coming in v2.2</div>
              <div className="text-sm font-semibold">Listener engagement features</div>
            </div>
          </div>
        </aside>
      </main>

      <BottomNav />
    </>
  );
}
