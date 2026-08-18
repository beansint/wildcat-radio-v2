/**
 * Unit test for the pure schedule grid builder (Task 12).
 *
 * Originally written with bare top-level `node:assert` blocks because the repo
 * had no test runner. FE#9 added Vitest (`pnpm test:unit`), so the same
 * assertions now live inside real `it()` cases and are picked up by the runner
 * instead of only executing as an import side effect.
 */
import { describe, it } from "vitest";
import assert from "node:assert/strict";
import {
  toDaypartGrid,
  buildScheduleFromShows,
  buildDayItems,
  daypartLabel,
  WEEKDAYS,
  PUBLIC_WEEKDAYS,
  type ScheduleDto,
} from "./grid";

function scheduleWith(monShow: { id: string; name: string; start: string; end: string; roster: string[]; slug?: string }): ScheduleDto {
  return {
    days: [
      { day: "MON", shows: [monShow] },
      { day: "TUE", shows: [] },
      { day: "WED", shows: [] },
      { day: "THU", shows: [] },
      { day: "FRI", shows: [] },
      { day: "SAT", shows: [] },
      { day: "SUN", shows: [] },
    ],
  };
}

describe("toDaypartGrid", () => {
it("buckets a MON 13:00-16:00 show into the 1-4 PM row under MON", () => {
  const schedule = scheduleWith({ id: "s1", name: "Afternoon Vibes", start: "13:00", end: "16:00", roster: ["DJ Mara"] });
  const grid = toDaypartGrid(schedule);
  assert.equal(grid.rows.length, 1, "expected exactly one daypart row");
  assert.equal(grid.rows[0].label, "1–4 PM");
  assert.equal(grid.rows[0].cells.MON?.name, "Afternoon Vibes");
  assert.equal(grid.rows[0].cells.TUE, null);
});

it("labels dayparts across the AM/PM boundary", () => {
  assert.equal(daypartLabel("06:00", "09:00"), "6–9 AM");
  assert.equal(daypartLabel("20:00", "22:00"), "8–10 PM");
  assert.equal(daypartLabel("11:00", "13:00"), "11 AM–1 PM");
});

it("produces sorted, independent rows for distinct time slots", () => {
  const schedule: ScheduleDto = {
    days: [
      { day: "MON", shows: [
        { id: "s1", name: "Morning Grind", start: "06:00", end: "09:00", roster: ["DJ Ben"] },
        { id: "s2", name: "Afternoon Vibes", start: "13:00", end: "16:00", roster: ["DJ Mara"] },
      ] },
      { day: "TUE", shows: [] },
      { day: "WED", shows: [] },
      { day: "THU", shows: [] },
      { day: "FRI", shows: [] },
      { day: "SAT", shows: [] },
      { day: "SUN", shows: [] },
    ],
  };
  const grid = toDaypartGrid(schedule);
  assert.equal(grid.rows.length, 2);
  assert.equal(grid.rows[0].start, "06:00");
  assert.equal(grid.rows[1].start, "13:00");
});
});

// buildScheduleFromShows mirrors the backend: WEEKLY shows bucket into every
// listed day, ONE_TIME shows are excluded entirely.
describe("buildScheduleFromShows", () => {
it("buckets WEEKLY shows into every listed day and drops ONE_TIME shows", () => {
  const built = buildScheduleFromShows([
    {
      id: "s2",
      name: "Homecoming Special",
      cadence: { kind: "ONE_TIME", date: "2026-07-20", start: "10:00", end: "12:00" },
      roster: [],
    },
    {
      id: "s1",
      name: "Afternoon Vibes",
      cadence: { kind: "WEEKLY", days: ["MON", "WED", "FRI"], start: "13:00", end: "16:00" },
      roster: [{ displayName: "DJ Mara" }, { displayName: "DJ Cha" }],
    },
  ]);

  const monday = built.days.find((d) => d.day === "MON");
  const tuesday = built.days.find((d) => d.day === "TUE");
  assert.equal(monday?.shows.length, 1, "Afternoon Vibes should appear on MON");
  assert.equal(monday?.shows[0].name, "Afternoon Vibes");
  assert.equal(tuesday?.shows.length, 0, "no show should appear on TUE");
  assert.ok(
    built.days.every((d) => d.shows.every((s) => s.name !== "Homecoming Special")),
    "ONE_TIME shows must never appear in the weekly grid",
  );

  const grid = toDaypartGrid(built);
  assert.equal(grid.rows.length, 1);
  assert.equal(grid.rows[0].cells.WED?.name, "Afternoon Vibes");
  assert.equal(grid.rows[0].cells.SAT, null);
});
});

// FE#42 — the owner ruled Mon–Fri for the PUBLIC schedule page only. This is
// a deliberate, explicit trade-off (not an accidental narrowing): the shared
// `WEEKDAYS` used by `/mod/schedule` must keep all seven days, or weekend
// programming silently disappears from staff.
describe("PUBLIC_WEEKDAYS", () => {
it("is exactly Mon-Fri, and does not mutate the shared 7-day WEEKDAYS", () => {
  assert.deepEqual(PUBLIC_WEEKDAYS, ["MON", "TUE", "WED", "THU", "FRI"]);
  assert.deepEqual(WEEKDAYS, ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
});
});

// FE#42 — `slug` plumbing: the backend's ScheduleShowDto already sends it,
// so toDaypartGrid must carry it through onto ScheduleShowCell untouched for
// the public page's `/shows/[slug]` links.
describe("slug plumbing", () => {
it("carries slug from the source show through to the daypart cell", () => {
  const schedule = scheduleWith({ id: "s1", name: "Afternoon Vibes", start: "13:00", end: "16:00", roster: ["DJ Mara"], slug: "afternoon-vibes" });
  const grid = toDaypartGrid(schedule);
  assert.equal(grid.rows[0].cells.MON?.slug, "afternoon-vibes");
});

it("leaves slug undefined for mod-only shows built via buildScheduleFromShows", () => {
  const built = buildScheduleFromShows([
    {
      id: "s1",
      name: "Afternoon Vibes",
      cadence: { kind: "WEEKLY", days: ["MON"], start: "13:00", end: "16:00" },
      roster: [],
    },
  ]);
  const grid = toDaypartGrid(built);
  assert.equal(grid.rows[0].cells.MON?.slug, undefined);
});
});

describe("buildDayItems", () => {
it("merges consecutive empty dayparts into a single gap and keeps show cells separate", () => {
  const schedule: ScheduleDto = {
    days: [
      { day: "MON", shows: [
        { id: "s1", name: "Morning Grind", start: "08:00", end: "10:00", roster: ["DJ Natz"] },
        { id: "s2", name: "Afternoon Vibes", start: "14:00", end: "16:00", roster: ["DJ Mara"] },
      ] },
      { day: "TUE", shows: [ { id: "s2", name: "Afternoon Vibes", start: "14:00", end: "16:00", roster: ["DJ Mara"] } ] },
      { day: "WED", shows: [] },
      { day: "THU", shows: [] },
      { day: "FRI", shows: [] },
      { day: "SAT", shows: [] },
      { day: "SUN", shows: [] },
    ],
  };
  // Rows (sorted by start): 08:00-10:00, 14:00-16:00.
  // MON has both filled; TUE has only the 14:00-16:00 row filled, so the
  // 08:00-10:00 row on TUE is a lone leading gap.
  const grid = toDaypartGrid(schedule);
  const mon = buildDayItems(grid, "MON");
  assert.equal(mon.length, 2);
  assert.equal(mon[0].type, "show");
  assert.equal(mon[1].type, "show");

  const tue = buildDayItems(grid, "TUE");
  assert.equal(tue.length, 2);
  assert.equal(tue[0].type, "gap");
  if (tue[0].type === "gap") {
    assert.equal(tue[0].start, "08:00");
    assert.equal(tue[0].end, "10:00");
  }
  assert.equal(tue[1].type, "show");
});
});
