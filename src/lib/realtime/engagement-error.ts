import { getApiErrorMessage } from "@/lib/api/error-message";

/**
 * Typed engagement failures (FE#65). The backend refuses engagement writes
 * with short codes on the socket ack (`auth-required`, `verify-email`) and
 * sentences on REST guards (muted/banned/rate-limit). Surfacing those as raw
 * text gave every refusal the same look; classifying them lets each state
 * carry its own way out — a sign-in link, a verify link, a countdown.
 */
export type EngagementErrorKind =
  | "auth-required"
  | "verify-email"
  | "muted"
  | "banned"
  | "rate-limited"
  | "socket-unavailable"
  | "timeout"
  | "not-live"
  | "other";

export interface EngagementError {
  kind: EngagementErrorKind;
  message: string;
  /** muted: when the mute lifts, when the backend knows. */
  until?: Date;
  /** muted / banned: the moderator's reason, when one was given. */
  reason?: string;
  /** rate-limited: seconds until the next attempt is accepted, when known. */
  retryAfterSec?: number;
}

/** Client-side transport codes, thrown by the chat sender. */
export const SOCKET_UNAVAILABLE = "socket-unavailable";
export const SEND_TIMEOUT = "send-timeout";

const REASON = /\s+—\s+(.+)$/;

export function classifyEngagementError(error: unknown): EngagementError {
  const raw = (typeof error === "string" ? error : getApiErrorMessage(error)).trim();

  if (raw === "auth-required" || /no valid session|unauthorized/i.test(raw)) {
    return { kind: "auth-required", message: "Sign in to take part in the live room." };
  }
  if (raw === "verify-email" || /email verification required/i.test(raw)) {
    return { kind: "verify-email", message: "Verify your email to chat, vote and send requests." };
  }

  const muted = /^(?:Strike \d: )?Muted until (\S+)(.*)$/.exec(raw);
  if (muted) {
    const date = new Date(muted[1]);
    const reason = REASON.exec(muted[2])?.[1];
    const until = Number.isNaN(date.getTime()) ? undefined : date;
    return {
      kind: "muted",
      message: until
        ? `You're muted until ${until.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.`
        : "You're muted for now.",
      until,
      reason,
    };
  }

  if (/account has been banned/i.test(raw)) {
    return {
      kind: "banned",
      message: "Your account is banned from the live room.",
      reason: REASON.exec(raw)?.[1],
    };
  }

  if (/slow down|too many/i.test(raw)) {
    const seconds = /try again in (\d+)s/i.exec(raw);
    return {
      kind: "rate-limited",
      message: "You're going a little fast.",
      retryAfterSec: seconds ? Number(seconds[1]) : undefined,
    };
  }

  if (raw === SOCKET_UNAVAILABLE) {
    return {
      kind: "socket-unavailable",
      message: "Can't reach the live room right now. Check your connection and try again.",
    };
  }
  if (raw === SEND_TIMEOUT || /timed out/i.test(raw)) {
    return { kind: "timeout", message: "That took too long to send. Try again." };
  }
  if (/no live episode/i.test(raw)) {
    return { kind: "not-live", message: "No live episode right now." };
  }

  return { kind: "other", message: raw || "Something went wrong." };
}
