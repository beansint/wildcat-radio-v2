import { describe, expect, it } from "vitest";
import { classifyEngagementError, SOCKET_UNAVAILABLE, SEND_TIMEOUT } from "./engagement-error";

// Inputs are the backend's literal contract strings (engagement.gateway.ts,
// email-verified.guard.ts, standing.util.ts, socket-rate-limit), not
// whatever the classifier happens to match.
describe("classifyEngagementError", () => {
  it("EE-01 socket ack codes: auth-required / verify-email", () => {
    expect(classifyEngagementError("auth-required").kind).toBe("auth-required");
    expect(classifyEngagementError("verify-email").kind).toBe("verify-email");
  });

  it("EE-02 HTTP guard messages map to the same kinds", () => {
    expect(classifyEngagementError("No valid session").kind).toBe("auth-required");
    expect(classifyEngagementError("Email verification required").kind).toBe("verify-email");
  });

  it("EE-03 muted carries the parsed expiry and reason, with or without a strike prefix", () => {
    const plain = classifyEngagementError("Muted until 2026-10-02T12:30:00.000Z — spam");
    expect(plain.kind).toBe("muted");
    expect(plain.until?.toISOString()).toBe("2026-10-02T12:30:00.000Z");
    expect(plain.reason).toBe("spam");

    const strike = classifyEngagementError("Strike 2: Muted until 2026-10-03T00:00:00.000Z");
    expect(strike.kind).toBe("muted");
    expect(strike.until?.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(strike.reason).toBeUndefined();
  });

  it("EE-04 muted with an unknown expiry has no date", () => {
    const e = classifyEngagementError("Muted until unknown");
    expect(e.kind).toBe("muted");
    expect(e.until).toBeUndefined();
  });

  it("EE-05 banned keeps the moderator reason", () => {
    const e = classifyEngagementError("Your account has been banned — harassment");
    expect(e.kind).toBe("banned");
    expect(e.reason).toBe("harassment");
  });

  it("EE-06 socket rate limit parses the retry delay", () => {
    const e = classifyEngagementError("Slow down — try again in 4s");
    expect(e.kind).toBe("rate-limited");
    expect(e.retryAfterSec).toBe(4);
  });

  it("EE-07 REST rate limits (reaction bucket, HTTP 429) are rate-limited without a delay", () => {
    expect(classifyEngagementError("Slow down a moment — too many reactions.").kind).toBe("rate-limited");
    const throttled = classifyEngagementError("ThrottlerException: Too Many Requests");
    expect(throttled.kind).toBe("rate-limited");
    expect(throttled.retryAfterSec).toBeUndefined();
  });

  it("EE-08 transport failures are distinct from server refusals", () => {
    expect(classifyEngagementError(SOCKET_UNAVAILABLE).kind).toBe("socket-unavailable");
    expect(classifyEngagementError(SEND_TIMEOUT).kind).toBe("timeout");
  });

  it("EE-09 no live episode", () => {
    expect(classifyEngagementError("No live episode right now.").kind).toBe("not-live");
  });

  it("EE-10 anything else passes its message through unchanged", () => {
    const e = classifyEngagementError("Message too long (max 500 characters)");
    expect(e.kind).toBe("other");
    expect(e.message).toBe("Message too long (max 500 characters)");
  });

  it("EE-11 accepts Error objects including API JSON envelopes", () => {
    const e = classifyEngagementError(
      new Error('403 Forbidden: {"statusCode":403,"message":"Email verification required"}'),
    );
    expect(e.kind).toBe("verify-email");
  });

  it("EE-12 every kind produces a human sentence, never a raw code", () => {
    for (const raw of ["auth-required", "verify-email", SOCKET_UNAVAILABLE, SEND_TIMEOUT]) {
      const { message } = classifyEngagementError(raw);
      expect(message).not.toBe(raw);
      expect(message.length).toBeGreaterThan(10);
    }
  });
});
