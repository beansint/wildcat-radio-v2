/**
 * Maps the 409/400 shapes the announcements API actually throws (feature.md
 * AC-1/AC-3/AC-5/AC-7 — wrong-state transition, feature-a-non-published row,
 * pin cap, and 400 validation) to a distinct human sentence per case. Falls
 * through `getApiErrorMessage` and finally a safe generic — never a raw
 * JSON dump on screen.
 */
import { getApiErrorMessage } from "@/lib/api/error-message";

export type AnnouncementErrorContext = "pin" | "feature" | "transition" | "validation";

function extractStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/^(\d{3})\s/);
  return match ? Number(match[1]) : null;
}

export function humanizeAnnouncementError(error: unknown, context: AnnouncementErrorContext): string {
  const status = extractStatus(error);

  if (status === 409 && context === "pin") {
    return "Only 2 announcements can be pinned at once — unpin one first.";
  }
  if (status === 409 && context === "feature") {
    return "Only a published announcement can be featured.";
  }
  if (status === 409 && context === "transition") {
    return "This announcement changed state before your action went through — refresh and try again.";
  }
  if (status === 400 && context === "validation") {
    return "Check the highlighted fields and try again.";
  }

  const fallback = getApiErrorMessage(error);
  if (fallback && fallback !== "Something went wrong." && !/[{}]/.test(fallback)) {
    return fallback;
  }
  return "Something went wrong. Try again.";
}

export type ScheduleValidation = { ok: true } | { ok: false; message: string };

export function validateScheduledFor(iso: string): ScheduleValidation {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) {
    return { ok: false, message: "Enter a valid date and time." };
  }
  if (time <= Date.now()) {
    return { ok: false, message: "Scheduled time must be in the future." };
  }
  return { ok: true };
}

export type RejectionReasonValidation = { ok: true; value: string } | { ok: false; message: string };

export function validateRejectionReason(text: string): RejectionReasonValidation {
  if (text.trim().length === 0) {
    return { ok: false, message: "A rejection reason is required." };
  }
  return { ok: true, value: text };
}
