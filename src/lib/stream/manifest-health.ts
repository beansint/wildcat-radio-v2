/**
 * live-path-hardening (#127) — when is the broadcast status "unavailable"?
 *
 * One failed `/stream/manifest` poll used to flip every listener surface to
 * "Broadcast status unavailable": play disabled, chat closed. Campus wifi and
 * API restarts make single failures routine, so the last good status is kept
 * until the outage is real — two consecutive failed polls, or 30 s without a
 * successful one. With no last good status at all there is nothing to keep,
 * so a failed first load is unavailable straight away.
 */
export type ManifestAvailability = "loading" | "ready" | "unavailable";

export const MANIFEST_FAILURES_BEFORE_UNAVAILABLE = 2;
export const MANIFEST_STALE_AFTER_MS = 30_000;
/** Per-poll retries (React Query `retry`) before a poll counts as failed. */
export const MANIFEST_POLL_RETRIES = 2;

export interface ManifestHealthInput {
  hasData: boolean;
  isPending: boolean;
  /** Failed polls since the last successful one (0 when the latest poll succeeded). */
  consecutiveFailures: number;
  lastSuccessAt: number | null;
  now: number;
}

export function resolveManifestAvailability({
  hasData,
  isPending,
  consecutiveFailures,
  lastSuccessAt,
  now,
}: ManifestHealthInput): ManifestAvailability {
  if (!hasData) return isPending && consecutiveFailures === 0 ? "loading" : "unavailable";
  if (consecutiveFailures <= 0) return "ready";
  if (consecutiveFailures >= MANIFEST_FAILURES_BEFORE_UNAVAILABLE) return "unavailable";
  if (lastSuccessAt !== null && now - lastSuccessAt >= MANIFEST_STALE_AFTER_MS) return "unavailable";
  return "ready";
}

/** React Query `retryDelay` for the manifest poll: 1 s, 2 s, … capped at 30 s. */
export function manifestRetryDelay(attempt: number): number {
  return Math.min(1_000 * 2 ** Math.max(0, attempt), 30_000);
}
