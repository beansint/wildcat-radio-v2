/**
 * Spec-first: mod-announcements/unit.md ANN-U-01 (status coverage, applied
 * here to tab<->status mapping) plus the counts/filter behaviour this page
 * needs before it can trust its own tab bar.
 */
import { describe, it, expect } from "vitest";
import {
  ANNOUNCEMENT_TAB_KEYS,
  countsByTab,
  filterByTab,
  tabLabel,
  type AnnouncementLike,
} from "../tabs";
import { ANNOUNCEMENT_STATUSES, type AnnouncementStatus } from "@/lib/announcements/lifecycle";

const ITEMS: (AnnouncementLike & { id: string })[] = [
  { id: "1", status: "DRAFT" },
  { id: "2", status: "DRAFT" },
  { id: "3", status: "PENDING_REVIEW" },
  { id: "4", status: "SCHEDULED" },
  { id: "5", status: "PUBLISHED" },
  { id: "6", status: "PUBLISHED" },
  { id: "7", status: "PUBLISHED" },
  { id: "8", status: "REJECTED" },
  { id: "9", status: "ARCHIVED" },
];

describe("tab <-> status mapping is total", () => {
  it("every tab key has a distinct label", () => {
    const labels = ANNOUNCEMENT_TAB_KEYS.map(tabLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("every real status maps into exactly one non-'all' tab", () => {
    for (const status of ANNOUNCEMENT_STATUSES) {
      const matches = ANNOUNCEMENT_TAB_KEYS.filter(
        (tab) => tab !== "all" && filterByTab([{ status }], tab).length === 1,
      );
      expect(matches).toHaveLength(1);
    }
  });
});

describe("filterByTab", () => {
  it("returns only rows in that status", () => {
    expect(filterByTab(ITEMS, "draft").map((i) => i.id)).toEqual(["1", "2"]);
    expect(filterByTab(ITEMS, "published").map((i) => i.id)).toEqual(["5", "6", "7"]);
    expect(filterByTab(ITEMS, "rejected").map((i) => i.id)).toEqual(["8"]);
  });

  it("'all' is a passthrough copy — same order, same length, no re-sort", () => {
    const all = filterByTab(ITEMS, "all");
    expect(all).toEqual(ITEMS);
    expect(all).not.toBe(ITEMS);
  });

  it("empty input yields an empty result for every tab", () => {
    for (const tab of ANNOUNCEMENT_TAB_KEYS) {
      expect(filterByTab([], tab)).toEqual([]);
    }
  });
});

describe("countsByTab", () => {
  it("counts are real — one row counted in exactly one status tab, and 'all' is the total", () => {
    const counts = countsByTab(ITEMS);
    expect(counts).toEqual({
      draft: 2,
      pending: 1,
      scheduled: 1,
      published: 3,
      rejected: 1,
      archived: 1,
      all: 9,
    });
    const sumOfStatusTabs = ANNOUNCEMENT_TAB_KEYS.filter((t) => t !== "all").reduce(
      (sum, tab) => sum + counts[tab],
      0,
    );
    expect(sumOfStatusTabs).toBe(counts.all);
  });

  it("zero rows -> every count is zero", () => {
    const counts = countsByTab([]);
    for (const tab of ANNOUNCEMENT_TAB_KEYS) {
      expect(counts[tab]).toBe(0);
    }
  });

  it("is exhaustive over every AnnouncementStatus value", () => {
    for (const status of ANNOUNCEMENT_STATUSES as AnnouncementStatus[]) {
      const counts = countsByTab([{ status }]);
      const total = ANNOUNCEMENT_TAB_KEYS.filter((t) => t !== "all").reduce(
        (sum, tab) => sum + counts[tab],
        0,
      );
      expect(total).toBe(1);
    }
  });
});
