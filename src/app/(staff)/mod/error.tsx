"use client";

/**
 * FE#36 — `/mod` segment error boundary. `(staff)/mod/layout.tsx` stays
 * mounted around this (StaffSidebar + `wc-shell`/`wc-main`), including its
 * own dark-mode toggle (staff is dark-by-default — see
 * `src/components/layout/staff-sidebar.tsx`), so this only fills the
 * `wc-main` content area with theme-aware `wc-card` tokens — no bespoke
 * dark-mode styling needed here.
 *
 * No console.error/warn — see `src/app/error.tsx` header for why.
 */
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ModSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6">
      <div
        data-testid="route-error"
        role="alert"
        className="wc-card wc-card-pad flex flex-col items-center gap-3 py-12 text-center"
      >
        <p className="font-semibold text-destructive">
          This page hit an unexpected error.
        </p>
        {error.digest ? (
          <p className="text-xs wc-muted opacity-70">Reference: {error.digest}</p>
        ) : null}
        <div className="flex gap-3">
          <Button data-testid="route-error-retry" type="button" onClick={reset}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/mod/roster">Back to roster</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
