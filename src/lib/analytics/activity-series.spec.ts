import { describe, expect, it } from "vitest";
import { loadActivitySeries } from "./activity-series";
describe("activity chart discovery", () => {
  it("pages past unsampled completed episodes and empty legacy curves", async () => {
    const pages: number[] = [];
    const fetched: string[] = [];
    const series = await loadActivitySeries(
      { from: "2026-01-01", to: "2026-02-01" },
      undefined,
      {
        list: async (filters) => {
          pages.push(filters.page!);
          return {
            total: 101,
            items:
              filters.page === 1
                ? [{ episodeId: "unsampled", quality: { sampleCount: 0 } }]
                : filters.page === 2
                  ? [
                      {
                        episodeId: "legacy-empty",
                        quality: { sampleCount: null },
                      },
                    ]
                  : [{ episodeId: "measured", quality: { sampleCount: 1 } }],
          };
        },
        detail: async (id) => {
          fetched.push(id);
          return {
            episodeId: id,
            title: null,
            showName: "Archived",
            retention:
              id === "measured"
                ? [{ minute: 0, activeCount: 3, pctOfPeak: 100 }]
                : [],
          };
        },
      },
    );
    expect(pages).toEqual([1, 2, 3]);
    expect(fetched).toEqual(["legacy-empty", "measured"]);
    expect(series.map((s) => s.episodeId)).toEqual(["measured"]);
  });
});
