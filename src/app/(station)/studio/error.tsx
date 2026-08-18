"use client";

/**
 * FE#36 — `/studio` segment error boundary. `(station)` has no layout of
 * its own (see AGENTS.md route-groups section) — `/studio` inherits only
 * the root layout, so this renders with no TopNav/Footer/StaffSidebar, just
 * whatever `src/app/layout.tsx` provides (`globals.css` + `QueryProvider`).
 * Booth-specific: a crash here likely means the live console (HLS/socket)
 * broke mid-broadcast, so the copy says so and points back to `/studio`
 * itself rather than home.
 *
 * No console.error/warn — see `src/app/error.tsx` header for why.
 */
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StudioSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="wc-container py-16">
      <div
        data-testid="route-error"
        role="alert"
        className="wc-card wc-card-pad flex flex-col items-center gap-3 py-12 text-center max-w-md mx-auto"
      >
        <p className="font-semibold text-destructive">
          The booth console hit an unexpected error.
        </p>
        <p className="wc-muted text-sm">
          Your broadcast connection may have dropped. Try reloading the console below.
        </p>
        {error.digest ? (
          <p className="text-xs wc-muted opacity-70">Reference: {error.digest}</p>
        ) : null}
        <Button data-testid="route-error-retry" type="button" onClick={reset}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reload console
        </Button>
      </div>
    </div>
  );
}
