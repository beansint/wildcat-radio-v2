/** live-path-hardening W-U4..W-U7 — a LIVE→ROTATION blip must not close chat. */
import { describe, expect, it } from "vitest";
import { LIVE_GRACE_MS, liveGraceView, reduceLiveGrace, type LiveGraceMemory } from "./live-grace";

const T0 = 5_000_000;
const live = (episodeId = "E") => ({ status: "LIVE" as const, episodeId });
const rotation = (episodeId: string | null = "E") => ({ status: "STATION_ROTATION" as const, episodeId });

function liveThenRotation(): LiveGraceMemory | null {
  const m = reduceLiveGrace(null, live(), T0);
  return reduceLiveGrace(m, rotation(), T0 + 1_000);
}

describe("live grace", () => {
  it("opens chat for the LIVE episode without an interruption", () => {
    expect(liveGraceView(reduceLiveGrace(null, live(), T0))).toEqual({
      episodeId: "E",
      open: true,
      interrupted: false,
    });
  });

  it("W-U4: LIVE(E) → ROTATION for 20 s keeps chat open and flags the interruption", () => {
    const m = reduceLiveGrace(liveThenRotation(), rotation(), T0 + 21_000);
    expect(liveGraceView(m)).toEqual({ episodeId: "E", open: true, interrupted: true });
  });

  it("W-U4b: a ROTATION observation without an episode id is still the same blip", () => {
    const m = reduceLiveGrace(liveThenRotation(), rotation(null), T0 + 10_000);
    expect(liveGraceView(m).open).toBe(true);
  });

  it("W-U4c: back to LIVE(E) clears the interruption", () => {
    const m = reduceLiveGrace(liveThenRotation(), live(), T0 + 30_000);
    expect(liveGraceView(m)).toEqual({ episodeId: "E", open: true, interrupted: false });
  });

  it("W-U5: non-LIVE for ≥60 s closes chat", () => {
    expect(LIVE_GRACE_MS).toBe(60_000);
    const left = liveThenRotation();
    expect(liveGraceView(reduceLiveGrace(left, rotation(), T0 + 1_000 + 59_999)).open).toBe(true);
    expect(liveGraceView(reduceLiveGrace(left, rotation(), T0 + 1_000 + 60_000)).open).toBe(false);
  });

  it("W-U6: a different episode closes the old one immediately", () => {
    expect(liveGraceView(reduceLiveGrace(liveThenRotation(), rotation("F"), T0 + 2_000)).open).toBe(false);
    expect(liveGraceView(reduceLiveGrace(liveThenRotation(), live("F"), T0 + 2_000))).toEqual({
      episodeId: "F",
      open: true,
      interrupted: false,
    });
  });

  it("W-U7: OFF_AIR closes immediately", () => {
    const m = reduceLiveGrace(reduceLiveGrace(null, live(), T0), { status: "OFF_AIR", episodeId: null }, T0 + 500);
    expect(liveGraceView(m)).toEqual({ episodeId: null, open: false, interrupted: false });
  });

  it("never opens chat from a non-LIVE first observation", () => {
    expect(liveGraceView(reduceLiveGrace(null, rotation(), T0)).open).toBe(false);
    expect(liveGraceView(reduceLiveGrace(null, { status: null, episodeId: null }, T0)).open).toBe(false);
  });

  it("an unknown status (status service unavailable) is treated as a blip, not an end", () => {
    const m = reduceLiveGrace(reduceLiveGrace(null, live(), T0), { status: null, episodeId: null }, T0 + 1_000);
    expect(liveGraceView(m)).toEqual({ episodeId: "E", open: true, interrupted: true });
  });

  it("keeps the leave timestamp from the first non-LIVE observation", () => {
    const left = liveThenRotation();
    expect(reduceLiveGrace(left, rotation(), T0 + 30_000)).toBe(left);
  });
});
