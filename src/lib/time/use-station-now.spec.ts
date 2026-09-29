/** WEB-U-03 */
import { describe, expect, it } from "vitest";
import { msUntilNextMinute } from "./use-station-now";
import { stationWeekday } from "./station";

describe("msUntilNextMinute", () => {
  it("lands just past the next :00", () => {
    expect(msUntilNextMinute(Date.UTC(2026, 9, 1, 0, 0, 59, 0))).toBe(1_050);
    expect(msUntilNextMinute(Date.UTC(2026, 9, 1, 0, 0, 0, 0))).toBe(60_050);
  });
});

describe("station weekday rollover", () => {
  it("flips at 16:00Z (00:00 UTC+8)", () => {
    expect(stationWeekday("2026-10-01T15:59:59Z")).toBe("THU");
    expect(stationWeekday("2026-10-01T16:00:00Z")).toBe("FRI");
  });
});
