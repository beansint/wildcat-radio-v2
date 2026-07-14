/**
 * Typed wrapper over the `wc-pill wc-pill-*` tokens (globals.css) — the
 * leading dot is `.wc-pill::before`, so this component only needs to pick
 * the right modifier class per status semantics (design-notes.md):
 *   ok      → green  (Active / Overturned / Eligible)
 *   warn    → amber  (Muted / Expires / Reduced)
 *   bad     → maroon-red (Banned / Upheld / Moderation)
 *   neutral → muted  (Expired / Schedule)
 *
 * Used by /mod/users, /mod/logs, /admin/escalations, /profile/standing.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusPillVariant = "ok" | "warn" | "bad" | "neutral";

const VARIANT_CLASS: Record<StatusPillVariant, string> = {
  ok: "wc-pill-ok",
  warn: "wc-pill-warn",
  bad: "wc-pill-bad",
  neutral: "wc-pill-neutral",
};

interface StatusPillProps {
  variant: StatusPillVariant;
  children: ReactNode;
  className?: string;
  /** Optional stable testid for e2e specs, e.g. `mod-user-status`. */
  testid?: string;
}

export function StatusPill({ variant, children, className, testid }: StatusPillProps) {
  return (
    <span className={cn("wc-pill", VARIANT_CLASS[variant], className)} data-testid={testid}>
      {children}
    </span>
  );
}
