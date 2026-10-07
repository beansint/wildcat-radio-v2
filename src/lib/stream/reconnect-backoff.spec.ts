/** live-path-hardening W-U9 — player reconnect backoff. */
import { describe, expect, it } from "vitest";
import { reconnectDelayMs } from "./reconnect-backoff";

describe("reconnectDelayMs", () => {
  it("W-U9: doubles from 1 s and caps at 30 s", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10, 50].map(reconnectDelayMs)).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000, 30_000,
    ]);
  });

  it("treats a negative attempt as the first", () => {
    expect(reconnectDelayMs(-1)).toBe(1_000);
  });
});
