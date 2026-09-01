import { describe, expect, it } from "vitest";
import { pickNowNext } from "./now-next";
import type { ScheduleDto } from "./grid";

const schedule: ScheduleDto = {
  days: [
    {
      day: "MON",
      shows: [
        { id: "a", name: "Morning Rush", slug: "morning-rush", start: "08:00", end: "10:00", roster: ["Ana"] },
        { id: "b", name: "Lunch Beats", slug: "lunch-beats", start: "12:00", end: "13:00", roster: [] },
      ],
    },
    {
      day: "WED",
      shows: [{ id: "c", name: "Midweek", slug: "midweek", start: "15:00", end: "17:00", roster: ["Cy"] }],
    },
  ],
};

describe("pickNowNext", () => {
  it("finds the in-progress slot and the next one today", () => {
    const pick = pickNowNext(schedule, "MON", "08:30");
    expect(pick.now?.id).toBe("a");
    expect(pick.next?.id).toBe("b");
    expect(pick.next?.day).toBe("MON");
  });

  it("boundary: a slot's end time is exclusive, start inclusive", () => {
    expect(pickNowNext(schedule, "MON", "10:00").now).toBeNull();
    expect(pickNowNext(schedule, "MON", "12:00").now?.id).toBe("b");
  });

  it("wraps forward across days when today is done", () => {
    const pick = pickNowNext(schedule, "MON", "20:00");
    expect(pick.now).toBeNull();
    expect(pick.next?.id).toBe("c");
    expect(pick.next?.day).toBe("WED");
  });

  it("wraps past the weekend back to Monday", () => {
    const pick = pickNowNext(schedule, "THU", "23:00");
    expect(pick.next?.id).toBe("a");
    expect(pick.next?.day).toBe("MON");
  });

  it("returns nothing for an empty schedule", () => {
    expect(pickNowNext({ days: [] }, "MON", "09:00")).toEqual({ now: null, next: null });
  });
});
