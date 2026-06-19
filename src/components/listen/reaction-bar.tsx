"use client";

import { Flame } from "lucide-react";
import { useState, useRef } from "react";

type ReactionKey = "fire" | "heart" | "laugh" | "clap";

interface Reaction {
  emoji: string;
  label: string;
  count: number;
}

const INITIAL_REACTIONS: Record<ReactionKey, Reaction> = {
  fire:  { emoji: "🔥", label: "React fire",  count: 1200 },
  heart: { emoji: "❤️", label: "React heart", count: 340  },
  laugh: { emoji: "😂", label: "React laugh", count: 96   },
  clap:  { emoji: "👏", label: "React clap",  count: 61   },
};

const REACTION_KEYS: ReactionKey[] = ["fire", "heart", "laugh", "clap"];

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

export function ReactionBar() {
  const [reactions, setReactions] = useState<Record<ReactionKey, Reaction>>(INITIAL_REACTIONS);
  const [hypeWidth, setHypeWidth] = useState(72);
  // Hype total is its own meter (prototype shows a static 1.2k), not the sum of reactions.
  const [hypeTotal, setHypeTotal] = useState(1200);
  const bumpRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // TODO(M5/M6): wire to hype meter API and real reaction counts

  function handleReact(key: ReactionKey) {
    setReactions((prev) => ({
      ...prev,
      [key]: { ...prev[key], count: prev[key].count + 1 },
    }));
    setHypeTotal((t) => t + 1);
    setHypeWidth((w) => Math.min(100, w + 0.5));

    const btn = bumpRefs.current[key];
    if (btn) {
      btn.animate([{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], {
        duration: 220,
        easing: "ease-out",
      });
    }
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
              onClick={() => handleReact(key)}
              ref={(el) => { bumpRefs.current[key] = el; }}
            >
              {r.emoji}
              <b>{formatCount(r.count)}</b>
            </button>
          );
        })}
      </div>
    </div>
  );
}
