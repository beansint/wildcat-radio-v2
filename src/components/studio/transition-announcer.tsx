"use client";

/**
 * FE#132 F4 — the moment one show hands over to the next: "Show A ended ·
 * Show B is live — welcome DJ X". The polite live region is always mounted so
 * screen readers announce the change when its text appears.
 */
import { Radio } from "lucide-react";

export interface TransitionAnnouncement {
  ended: string;
  live: string | null;
  welcome: string[];
}

export function TransitionAnnouncer({ announcement }: { announcement: TransitionAnnouncement | null }) {
  return (
    <div aria-live="polite" role="status" className="wc-container">
      {announcement && (
        <div
          data-testid="studio-transition"
          className="wc-card wc-card-pad mt-3 flex items-center gap-3"
          style={{ background: "linear-gradient(150deg,var(--maroon),var(--maroon-deep))", borderColor: "transparent", color: "#fff" }}
        >
          <Radio className="h-5 w-5 flex-none" aria-hidden="true" />
          <div className="min-w-0">
            <span className="font-bold">{announcement.ended} ended</span>
            {announcement.live ? (
              <>
                {" · "}
                <span className="font-extrabold">{announcement.live} is live</span>
                {announcement.welcome.length > 0 && ` — welcome ${announcement.welcome.join(", ")}`}
              </>
            ) : (
              " · the station is playing rotation"
            )}
          </div>
        </div>
      )}
    </div>
  );
}
