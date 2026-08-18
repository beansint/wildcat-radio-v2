/**
 * FE#44 — spec-first from the issue's derivation rule, not reverse-engineered
 * from a rendered page (this file has no jsdom, no DOM assertions).
 */
import { describe, it, expect } from "vitest";
import { episodeTitleLabel, formatEpisodeStats, isShowCurrentlyLive } from "./live";

describe("isShowCurrentlyLive", () => {
  it("is false when the station is off air, regardless of roster overlap", () => {
    expect(isShowCurrentlyLive("OFF_AIR", ["DJ Mara"], ["DJ Mara"])).toBe(false);
  });

  it("is false when the station is in station-rotation", () => {
    expect(isShowCurrentlyLive("STATION_ROTATION", ["DJ Mara"], ["DJ Mara"])).toBe(false);
  });

  it("is false when live but no DJ is timed in", () => {
    expect(isShowCurrentlyLive("LIVE", [], ["DJ Mara"])).toBe(false);
  });

  it("is false when live but this show has no roster", () => {
    expect(isShowCurrentlyLive("LIVE", ["DJ Mara"], [])).toBe(false);
  });

  it("is true when live and a timed-in DJ name is on this show's roster", () => {
    expect(isShowCurrentlyLive("LIVE", ["DJ Mara", "DJ Cha"], ["DJ Cha"])).toBe(true);
  });

  it("is false when live but the timed-in DJs belong to a different show", () => {
    expect(isShowCurrentlyLive("LIVE", ["DJ Ben"], ["DJ Mara", "DJ Cha"])).toBe(false);
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
