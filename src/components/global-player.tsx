"use client";

import { useEffect, useState } from "react";

type StreamStatus = "LIVE" | "STATION_ROTATION" | "OFF_AIR";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Global persistent player — lives in the root layout so it never re-mounts on
 * navigation (v2-build/00 §5.5). Skeleton: shows stream status; hls.js attach +
 * audio playback land in frontend issue M0 "global persistent player shell".
 */
export function GlobalPlayer() {
  const [status, setStatus] = useState<StreamStatus>("OFF_AIR");

  useEffect(() => {
    let alive = true;
    const poll = () =>
      fetch(`${API}/api/stream/manifest`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (alive && d?.status) setStatus(d.status as StreamStatus);
        })
        .catch(() => {
          /* manifest endpoint lands in backend Slice 1 — stay OFF_AIR until then */
        });
    poll();
    const id = setInterval(poll, 15_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const label =
    status === "LIVE"
      ? "On air"
      : status === "STATION_ROTATION"
        ? "Station rotation"
        : "Off air";

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-maroon-dark/30 bg-maroon text-white">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <button
          type="button"
          aria-label="Play"
          className="grid h-10 w-10 place-items-center rounded-full bg-gold font-bold text-maroon"
        >
          ▶
        </button>
        <div className="flex-1">
          <p className="text-sm font-semibold">Wildcat Radio</p>
          <p className="text-xs opacity-80">{label}</p>
        </div>
        <span className="rounded-full bg-black/25 px-2 py-1 text-[10px] uppercase tracking-wide">
          {status}
        </span>
      </div>
    </div>
  );
}
