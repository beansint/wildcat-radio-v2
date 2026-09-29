/**
 * FE#44 — spec-first from the issue's derivation rule, not reverse-engineered
 * from a rendered page (this file has no jsdom, no DOM assertions).
 */
import { describe, it, expect } from "vitest";
import { episodeTitleLabel, formatEpisodeStats, isShowOnAir } from "./live";

describe("isShowOnAir (WEB-U-01)", () => {
  it("is true only when LIVE and the manifest showId is this show", () => {
    expect(isShowOnAir("LIVE", "A", "A")).toBe(true);
  });

  it("is false in station rotation or off air, even for the matching show", () => {
    expect(isShowOnAir("STATION_ROTATION", "A", "A")).toBe(false);
    expect(isShowOnAir("OFF_AIR", "A", "A")).toBe(false);
  });

  it("is false when a different show is live (shared DJs no longer matter)", () => {
    expect(isShowOnAir("LIVE", "B", "A")).toBe(false);
  });

  it("is false for an unscheduled broadcast (no showId) or a missing show id", () => {
    expect(isShowOnAir("LIVE", null, "A")).toBe(false);
    expect(isShowOnAir("LIVE", "A", null)).toBe(false);
  });
});

describe("formatEpisodeStats", () => {
  it("renders both stats, singular request pluralized correctly", () => {
    expect(formatEpisodeStats(84, 31)).toBe("84 peak listeners · 31 requests");
    expect(formatEpisodeStats(1, 1)).toBe("1 peak listener · 1 request");
  });

  it("renders only peakListeners when requestCount is null", () => {
    expect(formatEpisodeStats(84, null)).toBe("84 peak listeners");
  });

  it("renders only requestCount when peakListeners is null", () => {
    expect(formatEpisodeStats(null, 31)).toBe("31 requests");
  });

  it("returns null when both are null (e.g. a live/not-yet-ended episode)", () => {
    expect(formatEpisodeStats(null, null)).toBeNull();
  });

  it("renders 0 explicitly rather than treating it as absent", () => {
    expect(formatEpisodeStats(0, 0)).toBe("0 peak listeners · 0 requests");
  });
});

describe("episodeTitleLabel", () => {
  it("uses the title when present", () => {
    expect(episodeTitleLabel("OPM throwback Thursday", "Thu, Jun 12")).toBe(
      "OPM throwback Thursday",
    );
  });

  it("falls back to the date label when title is null", () => {
    expect(episodeTitleLabel(null, "Thu, Jun 12")).toBe("Thu, Jun 12");
  });
});
