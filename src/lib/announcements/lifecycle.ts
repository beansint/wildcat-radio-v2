/**
 * Announcement status/action mapping, matched to the actual lifecycle the
 * API implements (backend docs/features/013-content-announcements/feature.md
 * AC-1): `DRAFT -> PENDING_REVIEW -> PUBLISHED|SCHEDULED -> ARCHIVED`, with
 * `REJECTED` reachable only from PENDING_REVIEW. Deliberately no "publish
 * now" from SCHEDULED, no "restore" from ARCHIVED, no "archive" from DRAFT —
 * those transitions don't exist server-side, so a view offering them would
 * only ever produce a 409. There is also no second-approver concept (L34):
 * `feature` is offered on the same terms to every author.
 */
import type { StatusPillVariant } from "@/components/mod/status-pill";

export type AnnouncementStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "PUBLISHED"
  | "SCHEDULED"
  | "ARCHIVED"
  | "REJECTED";

export const ANNOUNCEMENT_STATUSES: readonly AnnouncementStatus[] = [
  "DRAFT",
  "PENDING_REVIEW",
  "PUBLISHED",
  "SCHEDULED",
  "ARCHIVED",
  "REJECTED",
];

const STATUS_LABEL: Record<AnnouncementStatus, string> = {
  DRAFT: "Draft",
  PENDING_REVIEW: "Pending review",
  PUBLISHED: "Published",
  SCHEDULED: "Scheduled",
  ARCHIVED: "Archived",
  REJECTED: "Rejected",
};

const STATUS_VARIANT: Record<AnnouncementStatus, StatusPillVariant> = {
  DRAFT: "neutral",
  PENDING_REVIEW: "warn",
  PUBLISHED: "ok",
  SCHEDULED: "warn",
  ARCHIVED: "neutral",
  REJECTED: "bad",
};

export function statusLabel(status: AnnouncementStatus): string {
  return STATUS_LABEL[status];
}

export function statusVariant(status: AnnouncementStatus): StatusPillVariant {
  return STATUS_VARIANT[status];
}

export type AnnouncementAction =
  | "edit"
  | "submit"
  | "review"
  | "archive"
  | "pin"
  | "unpin"
  | "feature"
  | "unfeature";

const ACTIONS_BY_STATUS: Record<AnnouncementStatus, readonly AnnouncementAction[]> = {
  DRAFT: ["edit", "submit"],
  PENDING_REVIEW: ["review", "edit"],
  PUBLISHED: ["edit", "archive", "pin", "unpin", "feature", "unfeature"],
  SCHEDULED: ["edit", "archive"],
  ARCHIVED: [],
  REJECTED: ["edit", "submit"],
};

export function availableActions(status: AnnouncementStatus): readonly AnnouncementAction[] {
  return ACTIONS_BY_STATUS[status];
}

export type ScheduleState = "none" | "pending" | "elapsed";

/** Real Date comparison, never a truthiness check on the field being present (conventions/07 §5). */
export function scheduleState(scheduledFor: string | null): ScheduleState {
  if (!scheduledFor) return "none";
  const time = new Date(scheduledFor).getTime();
  if (Number.isNaN(time)) return "none";
  return time > Date.now() ? "pending" : "elapsed";
}
