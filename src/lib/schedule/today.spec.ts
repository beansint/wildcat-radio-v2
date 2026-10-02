/** WEB-U-02 — spec-first from .agent/test-suites/live-schedule-handover/web/unit.md */
import { describe, expect, it } from "vitest";
import { overlayToday, todayMarks, type TodayOccurrence } from "./today";
import { pickNowNext } from "./now-next";
import { clockRangeLabel, type ScheduleDto } from "./grid";

// Station UTC+8: local 07:00 on 2026-10-01 = 2026-09-30T23:00Z
const occ = (showId: string, status: string, start: string, end: string, oStart = start, oEnd = end): TodayOccurrence => ({
  showId,
  showName: showId.toUpperCase(),
  slug: showId,
  status,
  originalStart: oStart,
  originalEnd: oEnd,
  effectiveStart: start,
  effectiveEnd: end,
});

const weekly: ScheduleDto = {
  days: [
    {
      day: "THU",
      shows: [
        { id: "a", name: "A", slug: "a", start: "07:00", end: "08:00", roster: ["Ana"] },
        { id: "b", name: "B", slug: "b", start: "08:00", end: "09:00", roster: ["Ben"] },
      ],
    },
    { day: "FRI", shows: [{ id: "c", name: "C", slug: "c", start: "10:00", end: "11:00", roster: [] }] },
  ],
};

describe("todayMarks", () => {
  it("maps each occurrence to status + station-local effective HH:MM", () => {
    const marks = todayMarks([
      occ("a", "DELAYED", "2026-09-30T23:30:00Z", "2026-10-01T00:30:00Z", "2026-09-30T23:00:00Z", "2026-10-01T00:00:00Z"),
      occ("b", "CANCELLED", "2026-10-01T00:00:00Z", "2026-10-01T01:00:00Z"),
    ]);
    expect(marks.get("a")).toEqual({ status: "DELAYED", start: "07:30", end: "08:30" });
    expect(marks.get("b")).toEqual({ status: "CANCELLED", start: "08:00", end: "09:00" });
  });
});

describe("overlayToday + pickNowNext (WEB-U-02)", () => {
  it("cancelled shows are never 'now' and are skipped for 'next'", () => {
    const today = overlayToday(weekly, "THU", [
      occ("a", "SCHEDULED", "2026-09-30T23:00:00Z", "2026-10-01T00:00:00Z"),
      occ("b", "CANCELLED", "2026-10-01T00:00:00Z", "2026-10-01T01:00:00Z"),
    ]);
    expect(pickNowNext(today, "THU", "08:15").now).toBeNull();
    const pick = pickNowNext(today, "THU", "07:15");
    expect(pick.now?.id).toBe("a");
    expect(pick.next).toMatchObject({ id: "c", day: "FRI" });
  });

  it("delayed shows use their effective window and keep the template roster", () => {
    const today = overlayToday(weekly, "THU", [
      occ("a", "DELAYED", "2026-09-30T23:30:00Z", "2026-10-01T00:30:00Z"),
    ]);
    expect(pickNowNext(today, "THU", "07:10").now).toBeNull();
    const pick = pickNowNext(today, "THU", "07:45");
    expect(pick.now).toMatchObject({ id: "a", start: "07:30", end: "08:30", roster: ["Ana"] });
  });

  it("without today's data the template is returned unchanged", () => {
    expect(overlayToday(weekly, "THU", undefined)).toBe(weekly);
  });

  it("other days are untouched", () => {
    const today = overlayToday(weekly, "THU", []);
    expect(today.days.find((d) => d.day === "FRI")).toEqual(weekly.days[1]);
    expect(today.days.find((d) => d.day === "THU")?.shows).toEqual([]);
  });
});

describe("clockRangeLabel (found in live verification: a 30-min delay read as no change)", () => {
  it("keeps minutes when they matter", () => {
    expect(clockRangeLabel("12:30", "14:30")).toBe("12:30–2:30 PM");
    expect(clockRangeLabel("11:18", "11:55")).toBe("11:18–11:55 AM");
    expect(clockRangeLabel("11:30", "13:00")).toBe("11:30 AM–1 PM");
  });
  it("stays compact on the hour", () => {
    expect(clockRangeLabel("12:00", "14:00")).toBe("12–2 PM");
  });
});
