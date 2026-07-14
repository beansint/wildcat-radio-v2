/**
 * Shared standing→pill mapping for /mod/users (table + the View dialog).
 * `bannedAt` wins over `mutedUntil` (a banned user can have a stale
 * mutedUntil from an earlier strike); an expired `mutedUntil` (in the past)
 * reads as Active, matching how the row would look once the mute lapses
 * without requiring a page refresh to "fix" the pill.
 */
import type { UserSummaryDto } from "@/lib/api/model";
import type { StatusPillVariant } from "@/components/mod/status-pill";

export interface UserStatus {
  variant: StatusPillVariant;
  label: string;
}

/** `mutedUntil`/`bannedAt` are UTC ISO instants — rendered in the browser's local time. */
export function userStatus(user: UserSummaryDto): UserStatus {
  if (user.bannedAt) {
    return { variant: "bad", label: "Banned" };
  }
  if (user.mutedUntil && new Date(user.mutedUntil).getTime() > Date.now()) {
    // Compact local-time label (e.g. "Muted until Jul 16, 4:11 AM") — keeps
    // the status pill a single-line stadium in the narrow table column.
    const until = new Date(user.mutedUntil).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return { variant: "warn", label: `Muted until ${until}` };
  }
  return { variant: "ok", label: "Active" };
}
