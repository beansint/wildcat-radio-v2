/**
 * Studio "Today's schedule" pill for each occurrence (#106 / FE#84). The
 * backend now resolves every occurrence of the day — including ones nobody
 * has tapped into — with an explicit status, so the kiosk no longer guesses
 * "done vs upcoming" from the clock.
 */
export type StudioOccurrenceStatus =
  | "SCHEDULED"
  | "DELAYED"
  | "CANCELLED"
  | "HIATUS"
  | "PENDING_HANDOVER"
  | "ON_AIR"
  | "DONE"
  /** #127: the episode ended while its slot window is still open. */
  | "ENDED_EARLY";

export interface StatusPill {
  label: string;
  /** `wc-badge-live` renders the pulsing live badge; everything else is a `wc-pill`. */
  pillClass: string;
}

const PILLS: Record<StudioOccurrenceStatus, StatusPill> = {
  ON_AIR: { label: "On air", pillClass: "wc-badge-live" },
  PENDING_HANDOVER: { label: "Waiting for handover", pillClass: "wc-pill-warn" },
  SCHEDULED: { label: "Upcoming", pillClass: "wc-pill-neutral" },
  DELAYED: { label: "Delayed", pillClass: "wc-pill-warn" },
  CANCELLED: { label: "Cancelled", pillClass: "wc-pill-bad" },
  HIATUS: { label: "On hiatus", pillClass: "wc-pill-neutral" },
  DONE: { label: "Done", pillClass: "wc-pill-ok" },
  ENDED_EARLY: { label: "Ended early — time in to restart", pillClass: "wc-pill-warn" },
};

export function occurrencePill(status: string): StatusPill {
  return PILLS[status as StudioOccurrenceStatus] ?? { label: status, pillClass: "wc-pill-neutral" };
}
