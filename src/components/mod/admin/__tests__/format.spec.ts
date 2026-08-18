/**
 * Staff Review (BEA-184) web unit tier — SR-WU-01..09.
 * `.agent/test-suites/staff-review/web/unit.md`
 *
 * Pure logic only — no DOM. `environment: 'node'`, no jsdom, per house
 * policy (vitest.config.ts).
 */
import { describe, it, expect } from "vitest";
import { formatJoined, formatRelative } from "@/components/mod/admin/format";
import { promoteSchema, deactivateSchema, REASON_MAX_LENGTH } from "@/components/mod/admin/schemas";

describe("formatJoined (SR-WU-01, SR-WU-02)", () => {
  it("SR-WU-01: renders the three prototype shapes as station-local 'Mon YYYY'", () => {
    expect(formatJoined("2025-08-14T00:00:00.000Z")).toBe("Aug 2025");
    expect(formatJoined("2026-01-02T00:00:00.000Z")).toBe("Jan 2026");
    expect(formatJoined("2024-06-30T00:00:00.000Z")).toBe("Jun 2024");
  });

  it("SR-WU-02: a month-boundary timestamp renders the STATION's month (UTC+8 default), not a naive browser-local one", () => {
    // 2025-09-01T00:30:00Z shifted by the default station offset (+480min /
    // UTC+8) lands at 2025-09-01T08:30 station-local — unambiguously
    // September. A formatter anchored to a browser timezone west of UTC
    // (e.g. UTC-5) would instead read 2025-08-31T19:30 and wrongly render
    // "Aug 2025".
    expect(formatJoined("2025-09-01T00:30:00.000Z")).toBe("Sep 2025");
  });
});

describe("formatRelative (SR-WU-03, SR-WU-04, SR-WU-05)", () => {
  const NOW = new Date("2026-08-09T12:00:00.000Z").getTime();

  it("SR-WU-03: the relative-time table, singular vs. plural correct", () => {
    expect(formatRelative(new Date(NOW - 45_000).toISOString(), NOW)).toBe("just now");
    expect(formatRelative(new Date(NOW - 60 * 60_000).toISOString(), NOW)).toBe("1 hour ago");
    expect(formatRelative(new Date(NOW - 2 * 60 * 60_000).toISOString(), NOW)).toBe("2 hours ago");
    expect(formatRelative(new Date(NOW - 24 * 60 * 60_000).toISOString(), NOW)).toBe("1 day ago");
    expect(formatRelative(new Date(NOW - 3 * 24 * 60 * 60_000).toISOString(), NOW)).toBe("3 days ago");
    expect(formatRelative(new Date(NOW - 8 * 24 * 60 * 60_000).toISOString(), NOW)).toBe("1 week ago");
  });

  it("SR-WU-04: null renders '—', never 'Invalid Date' or 'NaN ago'", () => {
    expect(formatRelative(null, NOW)).toBe("—");
  });

  it("SR-WU-04b: an unparseable string also renders '—', not a throw", () => {
    expect(formatRelative("not-a-date", NOW)).toBe("—");
  });

  it("SR-WU-05: a future timestamp (clock skew) renders 'just now', never 'in N hours'", () => {
    expect(formatRelative(new Date(NOW + 2 * 60 * 60_000).toISOString(), NOW)).toBe("just now");
  });

  it("SR-WU-06: deterministic for a fixed (iso, now) pair — same inputs, same output, repeatedly", () => {
    const iso = new Date(NOW - 90 * 60_000).toISOString();
    const first = formatRelative(iso, NOW);
    const second = formatRelative(iso, NOW);
    expect(first).toBe(second);
    expect(first).toBe("1 hour ago");
  });
});

describe("promoteSchema (SR-WU-07, SR-WU-09)", () => {
  it("SR-WU-07: rejects empty email with a human-readable message", () => {
    const result = promoteSchema.safeParse({ email: "", reason: "Elected for AY 2026-2027" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.find((i) => i.path[0] === "email")?.message).toBe("Enter an email.");
    }
  });

  it.each([["a@"], ["@b.com"], ["a b@c.com"]])("SR-WU-07: rejects malformed email %s", (email) => {
    const result = promoteSchema.safeParse({ email, reason: "Elected for AY 2026-2027" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.find((i) => i.path[0] === "email")?.message).toBe(
        "Enter a valid campus email.",
      );
    }
  });

  it("SR-WU-07: rejects empty reason", () => {
    const result = promoteSchema.safeParse({ email: "a@b.cit.edu", reason: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.find((i) => i.path[0] === "reason")?.message).toBe("Add a reason.");
    }
  });

  it("SR-WU-07/SR-WU-09: rejects a whitespace-only reason (trimmed length 0)", () => {
    const result = promoteSchema.safeParse({ email: "a@b.cit.edu", reason: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.find((i) => i.path[0] === "reason")?.message).toBe("Add a reason.");
    }
  });

  it("SR-WU-07: accepts a valid campus address with a non-blank reason", () => {
    const result = promoteSchema.safeParse({
      email: "firstname.lastname@cit.edu",
      reason: "Elected by the org for AY 2026-2027",
    });
    expect(result.success).toBe(true);
  });

  it("SR-WU-09: trims before validating — a padded reason passes and is emitted trimmed", () => {
    const result = promoteSchema.safeParse({ email: "a@b.cit.edu", reason: "  reason  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe("reason");
    }
  });

  it("SR-WU-09: trims the email too", () => {
    const result = promoteSchema.safeParse({ email: "  a@b.cit.edu  ", reason: "reason" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("a@b.cit.edu");
    }
  });
});

describe("deactivateSchema (SR-WU-08, SR-WU-09)", () => {
  it("SR-WU-08: rejects empty reason", () => {
    const result = deactivateSchema.safeParse({ reason: "" });
    expect(result.success).toBe(false);
  });

  it("SR-WU-08: rejects whitespace-only reason", () => {
    const result = deactivateSchema.safeParse({ reason: "\n\t  " });
    expect(result.success).toBe(false);
  });

  it("SR-WU-08: accepts a non-blank reason", () => {
    const result = deactivateSchema.safeParse({ reason: "Term ended" });
    expect(result.success).toBe(true);
  });

  it("SR-WU-08: the reason cap matches the API's cap (500 — REASON_MAX_LENGTH in staff-review.service.ts)", () => {
    expect(REASON_MAX_LENGTH).toBe(500);
    const atCap = deactivateSchema.safeParse({ reason: "x".repeat(REASON_MAX_LENGTH) });
    expect(atCap.success).toBe(true);
    const overCap = deactivateSchema.safeParse({ reason: "x".repeat(REASON_MAX_LENGTH + 1) });
    expect(overCap.success).toBe(false);
  });

  it("SR-WU-09: trims before validating", () => {
    const result = deactivateSchema.safeParse({ reason: "  Term ended  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe("Term ended");
    }
  });
});
