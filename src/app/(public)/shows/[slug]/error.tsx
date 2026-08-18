"use client";

/**
 * FE#36 — `/shows/[slug]` error boundary. Distinct from the *expected*
 * "Show not found" branch already handled inline in `page.tsx` via
 * `classifyQueryError` (that's a 404 response, not a throw) — this only
 * catches an UNEXPECTED render-time throw (e.g. a null deref on a
 * malformed payload). Renders inside `PublicShell`, so TopNav/Footer stay.
 *
 * No console.error/warn — see `src/app/error.tsx` header for why.
 */
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ShowDetailError({
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
          This show couldn&apos;t be loaded.
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
            <Link href="/shows">All shows</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
