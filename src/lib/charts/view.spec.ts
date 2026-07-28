/**
 * Spec-first: public/unit.md PUB-U-03.
 */
import { describe, it, expect } from "vitest";
import { chartView } from "./view";

describe("PUB-U-03: chart empty state", () => {
  it("reports isEmpty and no rank rows for an empty week", () => {
    const result = chartView({ weekOf: "2026-07-20T00:00:00.000Z", entries: [] });
    expect(result.isEmpty).toBe(true);
    expect(result.rows).toEqual([]);
  });

  it("ranks three entries 1,2,3 in count-descending order", () => {
    const result = chartView({
      weekOf: "2026-07-20T00:00:00.000Z",
      entries: [
        { title: "Song A", count: 3 },
        { title: "Song B", count: 9 },
        { title: "Song C", count: 6 },
      ],
    });
    expect(result.isEmpty).toBe(false);
    expect(result.rows).toEqual([
      { rank: 1, title: "Song B", count: 9 },
      { rank: 2, title: "Song C", count: 6 },
      { rank: 3, title: "Song A", count: 3 },
    ]);
  });

  it("keeps server order for tied counts", () => {
    const result = chartView({
      weekOf: "2026-07-20T00:00:00.000Z",
      entries: [
        { title: "First tied", count: 5 },
        { title: "Second tied", count: 5 },
        { title: "Lowest", count: 1 },
      ],
    });
    expect(result.rows.map((row) => row.title)).toEqual(["First tied", "Second tied", "Lowest"]);
    expect(result.rows.map((row) => row.rank)).toEqual([1, 2, 3]);
  });
});
