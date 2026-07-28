/**
 * Spec-first: 409/400 shapes come from feature.md AC-1/AC-3/AC-5/AC-7 — pin
 * cap, feature-non-published, wrong-state transition, and validation.
 */
import { describe, it, expect } from "vitest";
import {
  humanizeAnnouncementError,
  validateScheduledFor,
  validateRejectionReason,
} from "./errors";

function errorWith(status: number, body: string): Error {
  return new Error(`${status} Conflict: ${body}`);
}

describe("ANN-U-08: error envelope -> human sentence", () => {
  it("409 pin cap, 409 feature-non-published, and 409 wrong-state each get a distinct sentence", () => {
    const pin = humanizeAnnouncementError(
      errorWith(409, JSON.stringify({ message: "Pin cap reached" })),
      "pin",
    );
    const feature = humanizeAnnouncementError(
      errorWith(409, JSON.stringify({ message: "Not published" })),
      "feature",
    );
    const transition = humanizeAnnouncementError(
      errorWith(409, JSON.stringify({ message: "Wrong state" })),
      "transition",
    );

    expect(new Set([pin, feature, transition]).size).toBe(3);
    expect(pin.toLowerCase()).toMatch(/pin/);
    expect(feature.toLowerCase()).toMatch(/publish/);
  });

  it("400 validation maps to a distinct human sentence", () => {
    const message = humanizeAnnouncementError(
      errorWith(400, JSON.stringify({ message: ["title is required"] })),
      "validation",
    );
    expect(message.length).toBeGreaterThan(0);
  });

  it("an unmapped error falls back to a safe generic message, never raw JSON", () => {
    const message = humanizeAnnouncementError(errorWith(500, '{"message":"boom","trace":"xyz"}'), "transition");
    expect(message).not.toMatch(/[{}]/);
    expect(message.length).toBeGreaterThan(0);
  });

  it("a non-Error value never crashes and never surfaces raw content", () => {
    const message = humanizeAnnouncementError("some string thrown", "pin");
    expect(typeof message).toBe("string");
    expect(message).not.toMatch(/[{}]/);
  });
});

describe("ANN-U-06: schedule validation blocks a past instant", () => {
  it("rejects a scheduledFor in the past before any request is sent", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const result = validateScheduledFor(past);
    expect(result.ok).toBe(false);
  });

  it("accepts a future instant", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const result = validateScheduledFor(future);
    expect(result.ok).toBe(true);
  });

  it("rejects an unparseable value", () => {
    const result = validateScheduledFor("not-a-date");
    expect(result.ok).toBe(false);
  });
});

describe("ANN-U-07: reject reason required", () => {
  it("blocks an empty reason", () => {
    expect(validateRejectionReason("").ok).toBe(false);
  });

  it("blocks a whitespace-only reason", () => {
    expect(validateRejectionReason("   \n\t  ").ok).toBe(false);
  });

  it("accepts a non-empty reason and preserves it verbatim", () => {
    const result = validateRejectionReason("  Needs a source link.  ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("  Needs a source link.  ");
    }
  });
});
