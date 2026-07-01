"use client";

import { Flame } from "lucide-react";
import { useRef } from "react";
import type { CreateReactionDtoEmoji } from "@/lib/api/model";
import type { HypeState } from "@/lib/realtime/use-engagement-room";

type ReactionKey = "fire" | "heart" | "laugh" | "clap";

interface Reaction {
  emoji: string;
  label: string;
  testId: string;
}

const INITIAL_REACTIONS: Record<ReactionKey, Reaction> = {
  fire:  { emoji: "🔥", label: "React fire",  testId: "engagement-reaction-fire" },
  heart: { emoji: "❤️", label: "React heart", testId: "engagement-reaction-heart" },
  laugh: { emoji: "😂", label: "React laugh", testId: "engagement-reaction-laugh" },
  clap:  { emoji: "👏", label: "React clap",  testId: "engagement-reaction-clap" },
};

const REACTION_KEYS: ReactionKey[] = ["fire", "heart", "laugh", "clap"];

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

interface ReactionBarProps {
  hype: HypeState;
  onReact: (emoji: CreateReactionDtoEmoji) => Promise<unknown>;
  reacting: boolean;
  error: string | null;
  isLive: boolean;
}

export function ReactionBar({ hype, onReact, reacting, error, isLive }: ReactionBarProps) {
  const reactions = INITIAL_REACTIONS;
  const bumpRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const hypeTotal = hype.count;
  const hypeWidth = Math.min(100, Math.max(8, hype.count));

  async function handleReact(key: ReactionKey) {
    const btn = bumpRefs.current[key];
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (btn && !prefersReducedMotion) {
      btn.animate([{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], {
        duration: 220,
        easing: "ease-out",
      });
    }
    await onReact(reactions[key].emoji as CreateReactionDtoEmoji);
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[.68rem] font-bold uppercase tracking-[.12em] text-white/55">
          Hype meter
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-gold">
          <Flame className="w-4 h-4" aria-hidden="true" />
          <span className="tnum">{formatCount(hypeTotal)}</span>
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,.16)" }}
        role="meter"
        aria-valuenow={hypeWidth}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Hype level"
        data-testid="engagement-hype-meter"
      >
        <div
          className="h-full transition-[width] duration-300"
          style={{
            width: `${hypeWidth}%`,
            background: "linear-gradient(90deg,var(--gold),var(--amber))",
          }}
        />
      </div>
      <div className="grid grid-cols-4 gap-2 mt-3">
        {REACTION_KEYS.map((key) => {
          const r = reactions[key];
          return (
            <button
              key={key}
              className="rx"
              aria-label={r.label}
              aria-busy={reacting || undefined}
              disabled={reacting || !isLive}
              onClick={() => handleReact(key)}
              ref={(el) => { bumpRefs.current[key] = el; }}
              data-testid={r.testId}
            >
              <span aria-hidden="true">{r.emoji}</span>
            </button>
          );
        })}
      </div>
      {(error || !isLive) && (
        <div role="alert" className="mt-2 text-xs font-semibold text-white/75">
          {error ?? "Reactions unlock when an episode is live."}
        </div>
      )}
    </div>
  );
}
