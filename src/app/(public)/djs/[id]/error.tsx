"use client";

/**
 * FE#36 — `/djs/[id]` error boundary. Distinct from the *expected* "DJ not
 * found" branch already handled inline in `page.tsx` via
 * `classifyQueryError` (a 404 response, not a throw) — this only catches an
 * UNEXPECTED render-time throw. Renders inside `PublicShell`, so
 * TopNav/Footer stay.
 *
 * No console.error/warn — see `src/app/error.tsx` header for why.
 */
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DjProfileError({
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
          This DJ profile couldn&apos;t be loaded.
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
