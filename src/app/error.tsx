"use client";

/**
 * FE#36 — root error boundary. Catches any unexpected throw from a page or
 * layout below the root (root `layout.tsx` itself isn't covered — that
 * escalates to `global-error.tsx`). Renders inside `<body>` so `globals.css`
 * / `wc-*` tokens are available, but there is no shell chrome guaranteed at
 * this level (some route groups render error.tsx of their own closer to the
 * problem — this is the fallback for anything that slips past them).
 *
 * No console.error/warn: the repo's e2e console guard
 * (`e2e/_console.ts` `assertClean()`) fails a spec on ANY console.error or
 * console.warn, and there's no existing precedent in this codebase for
 * gating that around test mode. Next still surfaces the original stack in
 * the terminal for SSR-time throws; client-thrown errors are visible via
 * `error.digest` here and via the browser's own uncaught-exception overlay
 * in dev. Trading away console-based observability was judged worth keeping
 * INV-8 (zero console noise) intact for the existing spec suite.
 *
 * Never renders `error.message` / stack — at most `error.digest`.
 */
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RootError({
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
        className="mx-auto flex max-w-md flex-col items-center gap-3 text-center"
      >
        <AlertTriangle className="h-8 w-8 text-maroon" aria-hidden="true" />
        <h1 className="text-2xl font-extrabold">Something went wrong</h1>
        <p className="wc-muted">
          This page hit an unexpected error. Try again, or head back to the homepage.
        </p>
        {error.digest ? (
          <p className="text-xs wc-muted opacity-70">Reference: {error.digest}</p>
        ) : null}
        <div className="flex gap-3 mt-1">
          <Button data-testid="route-error-retry" type="button" onClick={reset}>
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
