"use client";

/**
 * FE#132 F5 — "Up next" under the On Air card: the show that goes live next,
 * when it starts, and which of its DJs are already here.
 */
import { Check, Clock } from "lucide-react";
import type { StudioNextUpDto } from "@/lib/api/model";
import { upNextStartLabel } from "@/lib/studio/show-transition";

export function UpNextCard({ nextUp, now }: { nextUp: StudioNextUpDto; now: number }) {
  return (
    <section className="wc-card" data-testid="studio-up-next" aria-labelledby="studio-up-next-title">
      <div className="wc-card-pad flex items-start gap-3">
        <span className="h-11 w-11 rounded-xl grid place-items-center flex-none" style={{ background: "var(--accent)" }}>
          <Clock className="h-5 w-5 text-gold" aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold uppercase wc-muted">Up next</div>
          <h2 id="studio-up-next-title" className="font-extrabold text-lg truncate">{nextUp.showName}</h2>
          <div className="text-sm wc-muted tnum" data-testid="studio-up-next-start">
            {upNextStartLabel(nextUp.effectiveStart, now)}
          </div>
          {nextUp.djs.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="Next show's DJs">
              {nextUp.djs.map((dj) => (
                <li
                  key={dj.rosterId}
                  data-testid="studio-up-next-dj"
                  data-checked-in={dj.checkedIn}
                  className={`wc-pill ${dj.checkedIn ? "wc-pill-ok" : "wc-pill-neutral"}`}
                >
                  {dj.checkedIn && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  {dj.displayName} · {dj.checkedIn ? "here" : "not here"}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 text-sm wc-muted">No DJs on this show&apos;s roster.</div>
          )}
        </div>
      </div>
    </section>
  );
}
