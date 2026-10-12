/**
 * BE#195 / FE#132 studio transition helpers — W-U1..W-U8 from
 * .agent/test-suites/show-transitions/web/unit.md. Station time is UTC+8.
 */
import { describe, expect, it } from "vitest";
import { stationLocalToUtcISO } from "@/lib/time/station";
import {
  episodeTransition,
  formatOnFor,
  openShowName,
  parseConfirmEnd,
  slotTimingCue,
  upNextStartLabel,
} from "./show-transition";

const DATE = "2026-10-01";
const at = (hhmm: string, s = 0) => new Date(stationLocalToUtcISO(DATE, hhmm)).getTime() + s * 1000;
const iso = (hhmm: string) => stationLocalToUtcISO(DATE, hhmm);

describe("slotTimingCue", () => {
  it("W-U1 normally names the end time", () => {
    expect(slotTimingCue(iso("16:00"), at("15:30"))).toEqual({ kind: "ends", label: "Ends 4:00 PM" });
  });
  it("W-U2 last 5 minutes count down (5:00 inclusive)", () => {
    expect(slotTimingCue(iso("16:00"), at("15:55", 1))).toEqual({ kind: "soon", label: "Ends in 4:59" });
    expect(slotTimingCue(iso("16:00"), at("15:55"))).toEqual({ kind: "soon", label: "Ends in 5:00" });
    expect(slotTimingCue(iso("16:00"), at("15:54", 59))?.kind).toBe("ends");
  });
  it("W-U3 overtime counts up; names who is waiting", () => {
    expect(slotTimingCue(iso("16:00"), at("16:03"))).toEqual({ kind: "overtime", label: "Overtime +3 min" });
    expect(slotTimingCue(iso("16:00"), at("16:03"), "Show B")).toEqual({
      kind: "overtime",
      label: "Overtime +3 min · Show B waiting",
    });
    expect(slotTimingCue(iso("16:00"), at("16:00"))?.label).toBe("Overtime +0 min");
  });
  it("W-U4 ad-hoc (no slot end) has no cue", () => {
    expect(slotTimingCue(null, at("15:30"))).toBeNull();
  });
});

describe("formatOnFor", () => {
  it("W-U5 minutes under an hour, h + mm above", () => {
    expect(formatOnFor(iso("15:00"), at("15:02"))).toBe("on 2m");
    expect(formatOnFor(iso("15:00"), at("16:04"))).toBe("on 1h 04m");
    expect(formatOnFor(iso("15:00"), at("15:00"))).toBe("on 0m");
    expect(formatOnFor(iso("15:00"), at("14:59"))).toBe("on 0m");
  });
});

describe("upNextStartLabel", () => {
  it("W-U6 counts down to the start, then says it is waiting", () => {
    expect(upNextStartLabel(iso("16:00"), at("15:48"))).toBe("Starts 4:00 PM · in 12 min");
    expect(upNextStartLabel(iso("16:00"), at("15:59", 30))).toBe("Starts 4:00 PM · in 1 min");
    expect(upNextStartLabel(iso("16:00"), at("16:01"))).toBe("Waiting to go live");
    expect(upNextStartLabel(iso("18:00"), at("15:30"))).toBe("Starts 6:00 PM · in 2h 30m");
  });
});

describe("episodeTransition", () => {
  const A = { id: "a", showName: "Show A" };
  const B = { id: "b", showName: "Show B" };
  it("W-U7 names what ended and what went live", () => {
    expect(episodeTransition(A, B)).toEqual({ ended: "Show A", live: "Show B" });
    expect(episodeTransition(A, null)).toEqual({ ended: "Show A", live: null });
    expect(episodeTransition(null, B)).toBeNull();
    expect(episodeTransition(A, A)).toBeNull();
    expect(episodeTransition({ id: "a", showName: null }, B)).toEqual({ ended: "Ad-hoc episode", live: "Show B" });
  });
});

describe("parseConfirmEnd", () => {
  const preview = { episodeId: "a", showName: "Show A", unscheduled: false, startedAt: iso("15:00"), nextUp: null };
  it("W-U8 extracts the preview from a CONFIRM_END_REQUIRED 409", () => {
    const err = new Error(`409 Conflict: ${JSON.stringify({ statusCode: 409, code: "CONFIRM_END_REQUIRED", message: "x", preview })}`);
    expect(parseConfirmEnd(err)).toEqual(preview);
  });
  it("W-U8 other errors → null", () => {
    expect(parseConfirmEnd(new Error(`409 Conflict: ${JSON.stringify({ message: "CHECK_IN_CHANGED: x" })}`))).toBeNull();
    expect(parseConfirmEnd(new Error("500 Internal Server Error"))).toBeNull();
    expect(parseConfirmEnd(new Error("409 Conflict: not json"))).toBeNull();
    expect(parseConfirmEnd("nope")).toBeNull();
  });
});

describe("openShowName", () => {
  const show = { id: "a", showName: "Show A" } as never;
  it("names the open episode from today's board", () => {
    expect(openShowName({ episode: { id: "a", unscheduled: false } as never, todayShows: [show] })).toBe("Show A");
    expect(openShowName({ episode: { id: "x", unscheduled: true } as never, todayShows: [show] })).toBe("Ad-hoc episode");
    expect(openShowName({ episode: { id: "z", unscheduled: false } as never, todayShows: [show] })).toBe("Current show");
    expect(openShowName({ episode: null, todayShows: [show] })).toBeNull();
    expect(openShowName(undefined)).toBeNull();
  });
});
