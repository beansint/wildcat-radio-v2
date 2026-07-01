"use client";

import { Users, Mic, Play, Pause, Pin } from "lucide-react";
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
  const { isPlaying, play, pause, djs, listeners } = useStream();

  function handlePlayPause() {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }

  const djName = djs?.[0] ?? "DJ Mara";
  const listenerCount = listeners ?? 142;

  return (
    <section className="wc-grad-maroon wc-watermark text-white rounded-2xl relative overflow-hidden shadow-xl lg:sticky lg:top-[72px]">
      <div className="p-5 md:p-6">

        {/* Live badge + listener count */}
        <div className="flex items-center justify-between mb-4">
          <span className="wc-badge-live">
            <span className="dot" aria-hidden="true" />
            On air
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-bold"
            style={{ background: "rgba(255,255,255,.12)" }}
          >
            <Users className="w-3.5 h-3.5 text-gold" aria-hidden="true" />
            <span className="tnum">{listenerCount}</span> listening
          </span>
        </div>

        {/* Now playing */}
        <div className="flex items-center gap-4">
          <div className="wc-art rounded-2xl w-24 h-24 md:w-28 md:h-28 flex-none shadow-lg" role="img" aria-label="Show art" />
          <div className="min-w-0">
            <div className="text-[.68rem] font-bold uppercase tracking-[.12em] text-white/55">
              On air now
            </div>
            {/* TODO(M5/M6): wire to live show title from manifest/API */}
            <h1 className="text-2xl md:text-[1.75rem] font-extrabold leading-tight truncate">
              Afternoon Vibes
            </h1>
            {/* TODO(M5/M6): wire to now-playing track from API */}
            <div className="text-white/75 truncate text-sm">&ldquo;Golden Hour&rdquo; - JVKE</div>
            <span className="wc-chip mt-2 text-[.72rem]">
              <Mic className="w-3.5 h-3.5" aria-hidden="true" />
              {djName}
            </span>
          </div>
        </div>

        {/* Play row */}
        <div className="mt-5 flex items-center gap-3">
          <button
            className="wc-play w-14 h-14 flex-none"
            onClick={handlePlayPause}
            aria-label={isPlaying ? "Pause live stream" : "Play live stream"}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6" aria-hidden="true" />
            ) : (
              <Play className="w-6 h-6" aria-hidden="true" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            {/* TODO(M5/M6): replace static 66% with real stream progress if available */}
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,.16)" }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={66}
              aria-label="Stream progress"
            >
              <div className="h-full" style={{ width: "66%", background: "var(--gold)" }} />
            </div>
            <div className="flex items-center justify-between text-[.7rem] font-semibold text-white/55 mt-1.5">
              <span className="flex items-center gap-1.5">
                {isPlaying && (
                  <span className="eq text-gold" aria-hidden="true">
                    <i /><i /><i /><i />
                  </span>
                )}
                Live · streaming
              </span>
              <span className="tnum">2:14 / live</span>
            </div>
          </div>
        </div>

        {/* Reaction bar (hype meter + emoji reactions) */}
        <ReactionBar
          hype={hype}
          onReact={onReact}
          reacting={reacting}
          error={reactionError}
          isLive={isLive}
        />

        {/* Engagement tiles */}
        <EngagementTiles onOpen={onOpenSheet} />

        {upNext.length > 0 && (
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
              {pinnedTopic?.text ?? "No pinned topic yet. The booth can pin prompts during the show."}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
