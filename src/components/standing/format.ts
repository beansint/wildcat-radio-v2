/**
 * Small date-format helpers shared by the standing-page components.
 * API timestamps are UTC ISO strings — always format them in the
 * viewer's local time, never render the raw string.
 */

/** e.g. "Jun 12, 2:00 PM" — matches the prototype's "Muted until …" copy. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** e.g. "Jun 10, 2026" — matches the prototype's strike-history date. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** e.g. "Sep 8" — matches the prototype's compact "Expires Sep 8" pill. */
export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function isFuture(iso: string): boolean {
  return new Date(iso).getTime() > Date.now();
}
