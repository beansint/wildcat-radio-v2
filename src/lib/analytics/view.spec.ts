import { describe, expect, it } from "vitest";
import {
  buildHeatmap,
  buildScatter,
  heatmapRows,
  toIsoDate,
  formatCount,
  formatDecimal,
  hitAndSleeper,
  peakSlot,
  periodRange,
} from "./view";
import type { AnalyticsDaypartDto, AnalyticsShowRankDto } from "@/lib/api/model";

function slot(
  weekday: number,
  hour: number,
  avgConcurrent: number,
  episodeCount = 1,
): AnalyticsDaypartDto {
  return { weekday, hour, avgConcurrent, episodeCount };
}

function show(over: Partial<AnalyticsShowRankDto> = {}): AnalyticsShowRankDto {
  return {
    showId: "s1",
    name: "Afternoon Vibes",
    theme: null,
    episodeCount: 4,
    avgConcurrent: 90,
    avgTlh: 12,
    avgEngagement: 40,
    trend: "flat",
    ...over,
  };
}

describe("buildHeatmap", () => {
  it("renders the full fixed grid even when the station broadcast in one slot", () => {
    const cells = buildHeatmap([slot(3, 14, 80)]);
    // 6 two-hour rows x 7 weekdays — the grid the prototype draws.
    expect(cells).toHaveLength(42);
  });

  it("keeps a never-broadcast slot as null rather than zero", () => {
    // A zero cell reads as "we aired and nobody came"; null is "we don't air
    // then". The API omits empty slots for the same reason, and the legend
    // distinguishes them.
    const cells = buildHeatmap([slot(3, 14, 80)]);
    const aired = cells.find((c) => c.weekday === 3 && c.hour === 14);
    const never = cells.find((c) => c.weekday === 0 && c.hour === 8);
    expect(aired?.avgConcurrent).toBe(80);
    expect(never?.avgConcurrent).toBeNull();
    expect(never?.intensity).toBe(0);
  });

  it("snaps an odd hour into its two-hour row", () => {
    // The grid has a 2p row covering 14:00-15:59; a 15:00 episode belongs there
    // rather than being dropped for having no exact row.
    const cells = buildHeatmap([slot(3, 15, 50)]);
    expect(cells.find((c) => c.weekday === 3 && c.hour === 14)?.avgConcurrent).toBe(50);
  });

  it("averages two slots that fall in the same row", () => {
    const cells = buildHeatmap([slot(3, 14, 40), slot(3, 15, 60)]);
    expect(cells.find((c) => c.weekday === 3 && c.hour === 14)?.avgConcurrent).toBe(50);
  });

  it("draws an out-of-hours broadcast instead of deleting it", () => {
    // The previous version asserted the opposite — that a 03:00 slot vanished —
    // which enshrined a bug: a late-night show was erased from the grid AND
    // excluded from the peak, so the caption confidently named a daytime slot
    // as the station's busiest. The prototype's own example ranking includes a
    // late-night show, so this is the normal case.
    const cells = buildHeatmap([slot(2, 22, 120), slot(5, 14, 94)]);
    expect(cells.find((c) => c.weekday === 2 && c.hour === 22)?.avgConcurrent).toBe(120);
  });

  it("names the true peak even when it falls outside the default day", () => {
    const cells = buildHeatmap([slot(2, 22, 120), slot(5, 14, 94)]);
    expect(peakSlot(cells)).toMatchObject({ weekday: 2, hour: 22, avgConcurrent: 120 });
  });

  it("grows by a row when the station broadcast outside the default day", () => {
    const cells = buildHeatmap([slot(3, 14, 80), slot(2, 22, 40)]);
    expect(cells).toHaveLength(49); // 7 rows x 7 weekdays
    expect(heatmapRows([slot(2, 22, 40)]).some((r) => r.hour === 22)).toBe(true);
  });

  it("weights a merged row by episode count, not by a flat mean of the hours", () => {
    // 14:00 -> one episode averaging 200; 15:00 -> nine averaging 20. The row's
    // true average is 38; an unweighted mean says 110 and would crown this the
    // peak.
    const cells = buildHeatmap([slot(3, 14, 200, 1), slot(3, 15, 20, 9)]);
    expect(cells.find((c) => c.weekday === 3 && c.hour === 14)?.avgConcurrent).toBe(38);
  });

  it("scales intensity against the busiest slot, not an absolute ceiling", () => {
    const cells = buildHeatmap([slot(3, 14, 100), slot(4, 14, 50)]);
    expect(cells.find((c) => c.weekday === 3 && c.hour === 14)?.intensity).toBe(1);
    expect(cells.find((c) => c.weekday === 4 && c.hour === 14)?.intensity).toBe(0.5);
  });

  it("never divides by zero when every slot is silent", () => {
    const cells = buildHeatmap([slot(3, 14, 0)]);
    expect(cells.every((c) => Number.isFinite(c.intensity))).toBe(true);
  });

  it("returns an all-null grid for a period with no broadcasts", () => {
    const cells = buildHeatmap([]);
    expect(cells).toHaveLength(42);
    expect(cells.every((c) => c.avgConcurrent === null)).toBe(true);
  });
});

describe("peakSlot", () => {
  it("finds the busiest slot for the caption", () => {
    const cells = buildHeatmap([slot(5, 14, 94), slot(3, 14, 20)]);
    expect(peakSlot(cells)).toMatchObject({ weekday: 5, hour: 14, avgConcurrent: 94 });
  });

  it("is null when nothing was broadcast, so the caption can stay silent", () => {
    expect(peakSlot(buildHeatmap([]))).toBeNull();
  });
});

describe("buildScatter / hitAndSleeper", () => {
  it("maps each show to a point sized by episode count", () => {
    const points = buildScatter([show({ episodeCount: 7 })]);
    expect(points[0]).toMatchObject({ audience: 90, engagement: 40, episodeCount: 7 });
  });

  it("keeps the synthetic Unscheduled bucket out of the plot", () => {
    // It is not a show, so "review the slot" advice about it is meaningless.
    const points = buildScatter([show(), show({ showId: null, name: "Unscheduled" })]);
    expect(points).toHaveLength(1);
    expect(points.every((p) => p.name !== "Unscheduled")).toBe(true);
  });

  it("does not call a show with zero engagement high on both", () => {
    // The previous score added raw listeners to raw engagement actions, so
    // whichever axis had the wider range became the only one that counted: a
    // show with 200 concurrent and NO engagement outranked a balanced one.
    const points = buildScatter([
      show({ showId: "loud", name: "Loud but silent", avgConcurrent: 200, avgEngagement: 0 }),
      show({ showId: "balanced", name: "Balanced", avgConcurrent: 90, avgEngagement: 90 }),
    ]);
    expect(hitAndSleeper(points).hit?.name).toBe("Balanced");
  });

  it("names the strongest and weakest shows", () => {
    const points = buildScatter([
      show({ showId: "hit", name: "Hit", avgConcurrent: 200, avgEngagement: 70 }),
      show({ showId: "mid", name: "Mid", avgConcurrent: 90, avgEngagement: 40 }),
      show({ showId: "low", name: "Sleeper", avgConcurrent: 10, avgEngagement: 5 }),
    ]);
    const { hit, sleeper } = hitAndSleeper(points);
    expect(hit?.name).toBe("Hit");
    expect(sleeper?.name).toBe("Sleeper");
  });

  it("says nothing with a single show, rather than calling it both hit and sleeper", () => {
    const { hit, sleeper } = hitAndSleeper(buildScatter([show()]));
    expect(hit).toBeNull();
    expect(sleeper).toBeNull();
  });
});

describe("formatting", () => {
  it("groups thousands for the stat cards", () => {
    expect(formatCount(1940)).toBe("1,940");
    expect(formatCount(218.4)).toBe("218");
  });

  it("shows a decimal only when it carries information", () => {
    expect(formatDecimal(612)).toBe("612");
    expect(formatDecimal(612.04)).toBe("612");
    expect(formatDecimal(612.55)).toBe("612.6");
  });
});

describe("periodRange", () => {
  // Deliberately NOT midnight UTC: that is the one instant where UTC and
  // station-local truncation agree, and pinning it there hid the bug below.
  const NOW = new Date("2026-07-29T10:00:00.000Z");

  it("last 30 days", () => {
    expect(periodRange("p30", NOW)).toEqual({ from: "2026-06-29", to: "2026-07-29" });
  });

  it("truncates to the STATION's date, not UTC's", () => {
    // 2026-07-28T23:00Z is already the 29th in Manila. Truncating in UTC gave
    // "2026-07-28", and since the API window is [from, to), the last 30 days
    // silently excluded both today and yesterday every morning before 08:00.
    const earlyMorningManila = new Date("2026-07-28T23:00:00.000Z");
    expect(toIsoDate(earlyMorningManila)).toBe("2026-07-29");
    expect(periodRange("p30", earlyMorningManila).to).toBe("2026-07-29");
  });

  it("this semester is a longer rolling window", () => {
    const { from, to } = periodRange("psem", NOW);
    expect(to).toBe("2026-07-29");
    expect(new Date(from).getTime()).toBeLessThan(new Date("2026-06-29").getTime());
  });
});
