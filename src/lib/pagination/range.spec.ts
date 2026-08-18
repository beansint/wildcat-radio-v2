import { describe, expect, it } from "vitest";
import { paginationRange } from "./range";

describe("paginationRange", () => {
  it("empty result set: 0 items", () => {
    expect(paginationRange(1, 20, 0)).toEqual({ start: 0, end: 0, hasPrev: false, hasNext: false });
  });

  it("single page: fewer items than pageSize", () => {
    expect(paginationRange(1, 20, 6)).toEqual({ start: 1, end: 6, hasPrev: false, hasNext: false });
  });

  it("partial last page", () => {
    // 6 items, pageSize 4 -> page 2 shows "4-6 of 6" (the "Showing 1-4 of 6" case
    // called out in the task is page 1 of this same series, asserted below).
    expect(paginationRange(1, 4, 6)).toEqual({ start: 1, end: 4, hasPrev: false, hasNext: true });
    expect(paginationRange(2, 4, 6)).toEqual({ start: 5, end: 6, hasPrev: true, hasNext: false });
  });

  it("exact-multiple last page", () => {
    // 40 items, pageSize 20 -> page 2 is the exact final page, no remainder.
    expect(paginationRange(2, 20, 40)).toEqual({ start: 21, end: 40, hasPrev: true, hasNext: false });
  });

  it("middle page of a multi-page result set", () => {
    expect(paginationRange(2, 20, 65)).toEqual({ start: 21, end: 40, hasPrev: true, hasNext: true });
  });

  it("clamps a page below 1", () => {
    expect(paginationRange(0, 20, 40)).toEqual({ start: 1, end: 20, hasPrev: false, hasNext: true });
    expect(paginationRange(-3, 20, 40)).toEqual({ start: 1, end: 20, hasPrev: false, hasNext: true });
  });

  it("clamps a page beyond the last page", () => {
    // Stale page state after `total` shrinks (e.g. a search narrows results).
    expect(paginationRange(9, 20, 6)).toEqual({ start: 6, end: 6, hasPrev: true, hasNext: false });
  });

  it("treats a non-positive pageSize as empty rather than dividing oddly", () => {
    expect(paginationRange(1, 0, 40)).toEqual({ start: 0, end: 0, hasPrev: false, hasNext: false });
  });
});
