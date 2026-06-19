"use client";

import { BarChart3 } from "lucide-react";

export function InlinePoll() {
  return (
    <div className="wc-card wc-card-pad my-1" style={{ borderColor: "var(--maroon)" }}>
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-4 h-4 text-maroon" aria-hidden="true" />
        <span className="font-bold text-sm">Live poll · DJ Mara</span>
      </div>
      <div className="font-semibold mb-2">Next genre?</div>
      {/* TODO(M5/M6): wire to live poll API */}
      <button
        className="w-full text-left mb-2 relative rounded-xl overflow-hidden border"
        style={{ borderColor: "var(--border)" }}
        aria-label="Vote for OPM throwbacks (64%)"
      >
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: "64%", background: "var(--accent)" }}
        />
        <div className="relative flex justify-between px-3 py-2 text-sm font-medium">
          <span>OPM throwbacks</span>
          <span className="tnum">64%</span>
        </div>
      </button>
      <button
        className="w-full text-left relative rounded-xl overflow-hidden border"
        style={{ borderColor: "var(--border)" }}
        aria-label="Vote for Lo-fi chill (36%)"
      >
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: "36%", background: "var(--muted)" }}
        />
        <div className="relative flex justify-between px-3 py-2 text-sm font-medium">
          <span>Lo-fi chill</span>
          <span className="tnum">36%</span>
        </div>
      </button>
      <div className="text-xs wc-muted mt-2">Tap to vote · 88 votes · anonymous</div>
    </div>
  );
}
