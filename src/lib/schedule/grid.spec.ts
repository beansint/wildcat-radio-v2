/**
 * Plain-assertion unit test for the pure schedule grid builder (Task 12).
 *
 * No test runner (jest/vitest) is configured in this workspace yet
 * (`package.json` has no test script and neither package is installed), so
 * this file intentionally avoids `describe`/`it`/`expect` globals and is
 * runnable directly: `node --experimental-strip-types src/lib/schedule/grid.spec.ts`
 * (or plain `node` on a Node version new enough to strip types unflagged).
 * It is also included in `tsc --noEmit` like any other `.ts` file.
 */
import assert from "node:assert/strict";
import { toDaypartGrid, buildScheduleFromShows, daypartLabel, type ScheduleDto } from "./grid.ts";

function scheduleWith(monShow: { id: string; name: string; start: string; end: string; roster: string[] }): ScheduleDto {
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

// A MON 13:00-16:00 show lands in the "1-4 PM" row under MON.
{
  const schedule = scheduleWith({ id: "s1", name: "Afternoon Vibes", start: "13:00", end: "16:00", roster: ["DJ Mara"] });
  const grid = toDaypartGrid(schedule);
  assert.equal(grid.rows.length, 1, "expected exactly one daypart row");
  assert.equal(grid.rows[0].label, "1–4 PM");
  assert.equal(grid.rows[0].cells.MON?.name, "Afternoon Vibes");
  assert.equal(grid.rows[0].cells.TUE, null);
}

// daypartLabel crosses AM/PM correctly.
{
  assert.equal(daypartLabel("06:00", "09:00"), "6–9 AM");
  assert.equal(daypartLabel("20:00", "22:00"), "8–10 PM");
  assert.equal(daypartLabel("11:00", "13:00"), "11 AM–1 PM");
}

// Multiple distinct time slots produce sorted, independent rows.
{
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
}

// buildScheduleFromShows mirrors the backend: WEEKLY shows bucket into every
// listed day, ONE_TIME shows are excluded entirely.
{
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
}

console.log("grid.spec.ts: all assertions passed");
