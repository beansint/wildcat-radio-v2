"use client";

/**
 * FE#132 F6 — "Ends 4:00 PM" / amber "Ends in 4:59" / "Overtime +3 min · B
 * waiting" on the On Air card. Ticks every second on its own so the panel
 * doesn't re-render for the countdown.
 */
import { slotTimingCue } from "@/lib/studio/show-transition";
import { useNow } from "@/lib/time/use-now";

export function SlotTimingCue({ endIso, waitingShow }: { endIso: string | null; waitingShow: string | null }) {
  const now = useNow(1_000);
  const cue = slotTimingCue(endIso, now, waitingShow);
  if (!cue) return null;
  return (
    <span
      data-testid="studio-slot-cue"
      data-kind={cue.kind}
      className={`tnum ${cue.kind === "ends" ? "wc-chip-ghost" : "wc-pill wc-pill-warn font-bold"}`}
    >
      {cue.label}
    </span>
  );
}
