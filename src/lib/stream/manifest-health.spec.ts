/** live-path-hardening W-U1..W-U3 — one failed manifest poll must not flip the listener UI. */
import { describe, expect, it } from "vitest";
import {
  MANIFEST_FAILURES_BEFORE_UNAVAILABLE,
  MANIFEST_STALE_AFTER_MS,
  resolveManifestAvailability,
} from "./manifest-health";

const LAST_SUCCESS = 1_000_000;

describe("resolveManifestAvailability", () => {
  it("W-U1: one failed poll keeps the last good status (not unavailable)", () => {
    expect(
      resolveManifestAvailability({
        hasData: true,
        isPending: false,
        consecutiveFailures: 1,
        lastSuccessAt: LAST_SUCCESS,
        now: LAST_SUCCESS + 18_000,
      }),
    ).toBe("ready");
  });

  it("W-U2: two consecutive failures → unavailable", () => {
    expect(MANIFEST_FAILURES_BEFORE_UNAVAILABLE).toBe(2);
    expect(
      resolveManifestAvailability({
        hasData: true,
        isPending: false,
        consecutiveFailures: 2,
        lastSuccessAt: LAST_SUCCESS,
        now: LAST_SUCCESS + 5_000,
      }),
    ).toBe("unavailable");
  });

  it("W-U3: 30 s since the last success → unavailable, even after a single failure", () => {
    expect(MANIFEST_STALE_AFTER_MS).toBe(30_000);
    const input = { hasData: true, isPending: false, consecutiveFailures: 1, lastSuccessAt: LAST_SUCCESS };
    expect(resolveManifestAvailability({ ...input, now: LAST_SUCCESS + 29_999 })).toBe("ready");
    expect(resolveManifestAvailability({ ...input, now: LAST_SUCCESS + 30_000 })).toBe("unavailable");
  });

  it("a healthy poll is ready regardless of age", () => {
    expect(
      resolveManifestAvailability({
        hasData: true,
        isPending: false,
        consecutiveFailures: 0,
        lastSuccessAt: LAST_SUCCESS,
        now: LAST_SUCCESS + 120_000,
      }),
    ).toBe("ready");
  });

  it("first load in flight is loading; first load failed (no last good status) is unavailable", () => {
    const base = { hasData: false, consecutiveFailures: 0, lastSuccessAt: null, now: LAST_SUCCESS };
    expect(resolveManifestAvailability({ ...base, isPending: true })).toBe("loading");
    expect(resolveManifestAvailability({ ...base, isPending: false, consecutiveFailures: 1 })).toBe("unavailable");
  });
});
