/**
 * Spec-first: public/unit.md PUB-U-01/02. The server already orders
 * `items` pinned-first then publishedAt desc — this view model must not
 * re-sort, only identify the hero and never repeat it in the rest.
 */
import { describe, it, expect } from "vitest";
import { selectHero, restItems, type AnnouncementListItem } from "./list-view";

const items: AnnouncementListItem[] = [
  { id: "a", isPinned: true, publishedAt: "2026-07-20T00:00:00.000Z" },
  { id: "b", isPinned: false, publishedAt: "2026-07-19T00:00:00.000Z" },
  { id: "c", isPinned: false, publishedAt: "2026-07-18T00:00:00.000Z" },
];

describe("PUB-U-01: pinned-first ordering is preserved, not re-sorted", () => {
  it("hero is the first pinned item, rest keeps server order", () => {
    const hero = selectHero(items);
    expect(hero?.id).toBe("a");
    expect(restItems(items).map((item) => item.id)).toEqual(["b", "c"]);
  });

  it("does not reorder equal publishedAt values", () => {
    const tied: AnnouncementListItem[] = [
      { id: "x", isPinned: false, publishedAt: "2026-07-20T00:00:00.000Z" },
      { id: "y", isPinned: false, publishedAt: "2026-07-20T00:00:00.000Z" },
    ];
    expect(restItems(tied).map((item) => item.id)).toEqual(["y"]);
  });
});

describe("PUB-U-02: hero selection with no pinned item", () => {
  const unpinned: AnnouncementListItem[] = [
    { id: "m", isPinned: false, publishedAt: "2026-07-20T00:00:00.000Z" },
    { id: "n", isPinned: false, publishedAt: "2026-07-19T00:00:00.000Z" },
  ];

  it("hero is the first (most recent) item", () => {
    expect(selectHero(unpinned)?.id).toBe("m");
  });

  it("rest excludes the hero, never rendering it twice", () => {
    const rest = restItems(unpinned);
    expect(rest.some((item) => item.id === "m")).toBe(false);
    expect(rest.map((item) => item.id)).toEqual(["n"]);
  });

  it("empty input yields no hero and an empty rest", () => {
    expect(selectHero([])).toBeNull();
    expect(restItems([])).toEqual([]);
  });
});
