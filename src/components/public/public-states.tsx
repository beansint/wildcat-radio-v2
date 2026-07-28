"use client";

/**
 * Shared degraded/empty states for every public (unauthenticated) page —
 * AC-8 / INV-7: a public read must never render an infinite spinner or an
 * unhandled error boundary. Every page routes its query error through
 * `classifyQueryError` (src/lib/content/format.ts) and picks one of these:
 *   - 404              -> `PublicNotFound`
 *   - 429               -> `PublicRateLimited` (its button re-runs the query)
 *   - anything else     -> `PublicGenericError`
 *   - empty collection  -> `PublicEmpty`
 *
 * testids match the qa-plan's binding list exactly: public-not-found,
 * public-empty, public-rate-limited, public-retry.
 */
import Link from "next/link";
import { AlertTriangle, Inbox, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PublicEmpty({ message }: { message: string }) {
  return (
    <div
      data-testid="public-empty"
      className="wc-card wc-card-pad flex flex-col items-center gap-2 py-12 text-center wc-muted"
    >
      <Inbox className="h-6 w-6" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

export function PublicRateLimited({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      data-testid="public-rate-limited"
      role="alert"
      className="wc-card wc-card-pad flex flex-col items-center gap-3 py-12 text-center"
    >
      <AlertTriangle className="h-6 w-6 text-maroon" aria-hidden="true" />
      <p className="font-semibold">Too many requests — please wait a moment and try again.</p>
      <Button data-testid="public-retry" onClick={onRetry} type="button">
        Try again
      </Button>
    </div>
  );
}

export function PublicNotFound({
  heading,
  message,
}: {
  heading: string;
  message: string;
}) {
  return (
    <div
      data-testid="public-not-found"
      // `max-w-*` cannot share an element with `wc-container` — the container's
      // own max-width wins and the narrower measure is silently dropped.
      className="wc-container py-16"
    >
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
        <SearchX className="h-8 w-8 text-maroon" aria-hidden="true" />
        <h1 className="text-2xl font-extrabold">{heading}</h1>
        <p className="wc-muted">{message}</p>
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}

export function PublicGenericError({ message }: { message: string }) {
  return (
    <div role="alert" className="wc-card wc-card-pad py-8 text-center font-semibold text-destructive">
      {message}
    </div>
  );
}
