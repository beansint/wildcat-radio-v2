"use client";

/**
 * FE#36 — `(public)` segment error boundary. Renders inside `PublicShell`
 * (TopNav + Footer stay put), so it reuses `PublicGenericError`'s bare-card
 * shape (src/components/public/public-states.tsx) plus a working retry.
 * This is for UNEXPECTED throws only — expected 404/empty/rate-limit states
 * are already handled per-page via `classifyQueryError` (see
 * `(public)/shows/[slug]/page.tsx`); this boundary never overlaps that.
 *
 * No console.error/warn — see `src/app/error.tsx` header for why.
 */
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PublicSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="wc-container py-10">
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
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
