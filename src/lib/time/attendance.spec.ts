import { describe, expect, it } from "vitest";
import {
  buildAttendanceCorrection,
  formatOvertimeMinutes,
  overtimeStatusLabel,
} from "./attendance";

describe("formatOvertimeMinutes", () => {
  it("counts only attendance after the scheduled end", () => {
    expect(formatOvertimeMinutes("2026-08-23T06:00:00.000Z", "2026-08-23T06:25:00.000Z")).toBe("25m overtime");
  });

  it("does not label an on-time finish as overtime", () => {
    expect(formatOvertimeMinutes("2026-08-23T06:00:00.000Z", "2026-08-23T05:59:00.000Z")).toBe("—");
  });
});

describe("buildAttendanceCorrection", () => {
  it("clears an incorrect time-out explicitly", () => {
    expect(
      buildAttendanceCorrection({
        timeInDate: "2026-08-23",
        timeIn: "13:00",
        timeOutDate: "",
        timeOut: "",
        note: "Left open for staff review",
        reason: "Corrected accidental time out",
      }),
    ).toMatchObject({ timeOut: null, reason: "Corrected accidental time out" });
  });

  it("preserves a cross-midnight correction in station time", () => {
    const body = buildAttendanceCorrection({
      timeInDate: "2026-08-23",
      timeIn: "23:50",
      timeOutDate: "2026-08-24",
      timeOut: "00:20",
      note: "Extended live set",
      reason: "Approved by station manager",
    });

    expect(new Date(body.timeOut ?? 0).getTime()).toBeGreaterThan(new Date(body.timeIn).getTime());
  });
});

describe("overtimeStatusLabel", () => {
  it.each([
    ["NONE", "No overtime"],
    ["PENDING", "Overtime pending"],
    ["APPROVED", "Overtime approved"],
    ["REJECTED", "Overtime declined"],
  ] as const)("labels %s unambiguously", (status, label) => {
    expect(overtimeStatusLabel(status)).toBe(label);
  });
});
