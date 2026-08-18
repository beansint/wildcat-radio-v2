import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { stationLongDate, stationWeekday } from "./station";

// STATION_OFFSET_MIN defaults to 480 (UTC+8, Manila) via
// NEXT_PUBLIC_STATION_UTC_OFFSET_MINUTES — these instants are chosen so the
// +8h shift doesn't cross a day boundary in a way that would make the
// expected weekday ambiguous to a reader of this test.
describe("stationLongDate", () => {
  it("renders the station-local weekday, month, day and year", () => {
    // 2026-06-10T01:00:00Z + 8h = 2026-06-10T09:00 station-local (Wednesday).
    assert.equal(stationLongDate("2026-06-10T01:00:00.000Z"), "Wednesday, June 10, 2026");
  });

  it("rolls the date forward across midnight when the station-local shift crosses it", () => {
    // 2026-06-10T20:00:00Z + 8h = 2026-06-11T04:00 station-local (Thursday).
    assert.equal(stationLongDate("2026-06-10T20:00:00.000Z"), "Thursday, June 11, 2026");
  });

  it("accepts a Date instance as well as an ISO string", () => {
    assert.equal(
      stationLongDate(new Date("2026-06-10T01:00:00.000Z")),
      stationLongDate("2026-06-10T01:00:00.000Z"),
    );
  });
});

// FE#42 — the public /schedule "today" chip and on-air badge both key off
// this, so it must shift by the station offset the same way stationLongDate
// does, not the browser's own Date#getDay().
describe("stationWeekday", () => {
  it("returns the station-local weekday code", () => {
    // 2026-06-10T01:00:00Z + 8h = 2026-06-10T09:00 station-local (Wednesday).
    assert.equal(stationWeekday("2026-06-10T01:00:00.000Z"), "WED");
  });

  it("rolls the weekday forward across midnight when the shift crosses it", () => {
    // 2026-06-10T20:00:00Z + 8h = 2026-06-11T04:00 station-local (Thursday).
    assert.equal(stationWeekday("2026-06-10T20:00:00.000Z"), "THU");
  });

  it("wraps SAT -> SUN across the week boundary", () => {
    // 2026-06-13T20:00:00Z (Saturday) + 8h = 2026-06-14T04:00 (Sunday).
    assert.equal(stationWeekday("2026-06-13T20:00:00.000Z"), "SUN");
  });
});
