import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { elapsedHhmm } from "./elapsed";

describe("elapsedHhmm", () => {
  it("formats minutes under an hour with a leading '0:'", () => {
    const since = "2026-06-10T08:00:00.000Z";
    const now = new Date("2026-06-10T08:07:00.000Z").getTime();
    assert.equal(elapsedHhmm(since, now), "0:07");
  });

  it("formats hours + minutes, zero-padding minutes", () => {
    const since = "2026-06-10T08:00:00.000Z";
    const now = new Date("2026-06-10T10:03:00.000Z").getTime();
    assert.equal(elapsedHhmm(since, now), "2:03");
  });

  it("rounds down to the nearest whole minute", () => {
    const since = "2026-06-10T08:00:00.000Z";
    const now = new Date("2026-06-10T08:00:59.000Z").getTime();
    assert.equal(elapsedHhmm(since, now), "0:00");
  });

  it("clamps to 0:00 instead of going negative when 'now' is before 'since'", () => {
    const since = "2026-06-10T08:00:00.000Z";
    const now = new Date("2026-06-10T07:00:00.000Z").getTime();
    assert.equal(elapsedHhmm(since, now), "0:00");
  });

  it("rolls minutes over past 59 into the next hour", () => {
    const since = "2026-06-10T08:00:00.000Z";
    const now = new Date("2026-06-10T09:00:00.000Z").getTime();
    assert.equal(elapsedHhmm(since, now), "1:00");
  });
});
