"use client";

import { Users, Mic, Play, Pause, Pin, Radio, WifiOff, LoaderCircle } from "lucide-react";
import { useStream } from "@/lib/stream/stream-context";
import { ReactionBar } from "./reaction-bar";
import { EngagementTiles } from "./engagement-tiles";
import type { SheetTab } from "./engagement-tiles";
import type { CreateReactionDtoEmoji } from "@/lib/api/model";
import type { HypeState, PinnedTopic, UpNextItem } from "@/lib/realtime/use-engagement-room";

interface StageProps {
  onOpenSheet: (tab: SheetTab) => void;
  pinnedTopic: PinnedTopic | null;
  hype: HypeState;
  upNext: UpNextItem[];
  onReact: (emoji: CreateReactionDtoEmoji) => Promise<unknown>;
  reacting: boolean;
  reactionError: string | null;
  isLive: boolean;
}

export function Stage({
  onOpenSheet,
  pinnedTopic,
  hype,
  upNext,
  onReact,
  reacting,
  reactionError,
  isLive,
}: StageProps) {
  const {
    isPlaying,
    phase,
    play,
    pause,
    djs,
    listeners,
    status,
    manifestUrl,
    manifestAvailability,
  } = useStream();

  function handlePlayPause() {
    if (phase !== "idle") {
      pause();
    } else {
      play();
    }
  }

  const canPlay = manifestAvailability === "ready" && status !== "OFF_AIR" && Boolean(manifestUrl);
  const headline =
    manifestAvailability === "loading"
      ? "Checking the broadcast"
      : manifestAvailability === "unavailable"
        ? "Broadcast status unavailable"
        : status === "LIVE"
          ? "Live on air"
          : status === "STATION_ROTATION"
            ? "Station rotation"
            : "Off air";
  const description =
    manifestAvailability === "unavailable"
      ? "We could not reach the station status service. Try again shortly."
      : status === "LIVE"
        ? "Streaming live from the Wildcat Radio booth."
        : status === "STATION_ROTATION"
          ? "Automated station audio is currently playing."
          : "There is no listener stream available right now.";

  return (
    <section className="wc-grad-maroon wc-watermark text-white rounded-2xl relative overflow-hidden shadow-xl lg:sticky lg:top-[72px]">
      <div className="p-5 md:p-6">

        {/* Live badge + listener count */}
        <div className="flex items-center justify-between mb-4">
          <span className={status === "LIVE" && manifestAvailability === "ready" ? "wc-badge-live" : "wc-chip"}>
            {manifestAvailability === "loading" ? (
              <LoaderCircle className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : status === "OFF_AIR" || manifestAvailability === "unavailable" ? (
              <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Radio className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {headline}
          </span>
          {canPlay && listeners !== null && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-bold"
              style={{ background: "rgba(255,255,255,.12)" }}
            >
              <Users className="w-3.5 h-3.5 text-gold" aria-hidden="true" />
              <span className="tnum">{listeners}</span> listening
            </span>
          )}
        </div>

        {/* Now playing */}
        <div className="flex items-center gap-4">
          <div className="wc-art rounded-2xl w-24 h-24 md:w-28 md:h-28 flex-none shadow-lg" role="img" aria-label="Show art" />
          <div className="min-w-0">
            <h1 className="text-2xl md:text-[1.75rem] font-extrabold leading-tight truncate">
              {headline}
            </h1>
            <div className="text-white/75 text-sm mt-1">{description}</div>
            {status === "LIVE" && djs.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {djs.map((dj) => (
                  <span key={dj} className="wc-chip text-[.72rem]">
                    <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                    {dj}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Play row */}
        <div className="mt-5 flex items-center gap-3">
          <button
            className="wc-play w-14 h-14 flex-none"
            onClick={handlePlayPause}
            aria-label={phase !== "idle" ? "Pause live stream" : "Play live stream"}
            disabled={!canPlay && phase === "idle"}
          >
            {phase !== "idle" ? (
              <Pause className="w-6 h-6" aria-hidden="true" />
            ) : (
              <Play className="w-6 h-6" aria-hidden="true" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white/70">
              {phase === "connecting"
                ? "Connecting…"
                : phase === "reconnecting"
                  ? "Reconnecting…"
                  : isPlaying
                    ? "Playing live audio"
                    : canPlay
                      ? "Ready to play"
                      : "Playback unavailable"}
            </div>
          </div>
        </div>

        {isLive && (
          <>
            <ReactionBar
              hype={hype}
              onReact={onReact}
              reacting={reacting}
              error={reactionError}
              isLive={isLive}
            />
            <EngagementTiles onOpen={onOpenSheet} />
          </>
        )}

        {isLive && upNext.length > 0 && (
          <div
            className="mt-5 rounded-xl p-3"
            style={{ background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.16)" }}
            data-testid="engagement-up-next"
          >
            <div className="text-[.62rem] font-bold uppercase tracking-[.12em] text-white/55 mb-2">
              Up next
            </div>
            <div className="grid gap-2">
              {upNext.map((item) => (
                <div key={item.id} className="text-sm">
                  <span className="font-extrabold text-gold">{item.type.toLowerCase()}</span>{" "}
                  <span>{item.text}</span>
                  {item.recipient && <span className="text-white/65"> · for {item.recipient}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pinned topic */}
        {isLive && (
          <div
            className="mt-5 rounded-xl p-3 flex items-start gap-2.5"
            style={{ background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.16)" }}
            data-testid="engagement-pinned-topic"
          >
            <Pin className="w-4 h-4 mt-0.5 flex-none text-gold" aria-hidden="true" />
            <div>
              <div className="text-[.62rem] font-bold uppercase tracking-[.12em] text-white/55">
                Pinned by the booth
              </div>
              <div className="text-sm">
                {pinnedTopic?.text ?? "No pinned topic yet."}
              </div>
            </div>
          </div>
        )}

      </div>
    </section>
  );
}
