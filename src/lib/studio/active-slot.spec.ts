/** live-path-hardening W-U10..W-U14 — which slot is "Up now" on the kiosk. */
import { describe, expect, it } from "vitest";
import type { StudioTodayDto, StudioTodayShowDto } from "@/lib/api/model";
import { pickActiveSlot } from "./active-slot";

const NOW = Date.parse("2026-10-06T10:30:00.000Z");

function show(overrides: Partial<StudioTodayShowDto>): StudioTodayShowDto {
  return {
    id: null,
    showId: "show",
    scheduledFor: "2026-10-06T10:00:00.000Z",
    effectiveStart: "2026-10-06T10:00:00.000Z",
    effectiveEnd: "2026-10-06T11:00:00.000Z",
    status: "SCHEDULED",
    showName: "Show",
    djs: [],
    ...overrides,
  };
}

function today(todayShows: StudioTodayShowDto[], episodeId: string | null = null): StudioTodayDto {
  return {
    episode: episodeId ? ({ id: episodeId } as StudioTodayDto["episode"]) : null,
    attendees: [],
    slotRoster: [],
    todayShows,
    pendingHandover: null,
  };
}

describe("pickActiveSlot", () => {
  it("W-U10: ON_AIR wins over a SCHEDULED slot whose window contains now", () => {
    const onAir = show({ id: "ep1", showId: "a", status: "ON_AIR", effectiveStart: "2026-10-06T09:00:00.000Z" });
    const scheduled = show({ showId: "b" });
    expect(pickActiveSlot(today([scheduled, onAir], "ep1"), NOW)).toEqual({ show: onAir, endedEarly: false });
  });

  it("W-U11: no ON_AIR, now inside a SCHEDULED window → that slot", () => {
    const earlier = show({ showId: "a", effectiveStart: "2026-10-06T08:00:00.000Z", effectiveEnd: "2026-10-06T09:00:00.000Z" });
    const current = show({ showId: "b" });
    expect(pickActiveSlot(today([earlier, current]), NOW)).toEqual({ show: current, endedEarly: false });
  });

  it("W-U11b: DELAYED slot uses its effective window", () => {
    const delayed = show({ status: "DELAYED", effectiveStart: "2026-10-06T10:20:00.000Z" });
    expect(pickActiveSlot(today([delayed]), NOW)?.show).toBe(delayed);
    expect(pickActiveSlot(today([delayed]), Date.parse("2026-10-06T10:10:00.000Z"))).toBeNull();
  });

  it("W-U12: DONE is never Up now, even inside its window", () => {
    expect(pickActiveSlot(today([show({ status: "DONE", id: "ep0" })]), NOW)).toBeNull();
  });

  it("W-U13: ENDED_EARLY inside its window is returned with the endedEarly flag", () => {
    const ended = show({ status: "ENDED_EARLY", id: "ep0" });
    expect(pickActiveSlot(today([ended]), NOW)).toEqual({ show: ended, endedEarly: true });
  });

  it("W-U13b: a SCHEDULED slot beats an overlapping ENDED_EARLY one", () => {
    const ended = show({ status: "ENDED_EARLY", id: "ep0", showId: "a" });
    const next = show({ showId: "b" });
    expect(pickActiveSlot(today([ended, next]), NOW)?.show).toBe(next);
  });

  it("W-U14: nothing airing → null", () => {
    const later = show({ effectiveStart: "2026-10-06T12:00:00.000Z", effectiveEnd: "2026-10-06T13:00:00.000Z" });
    const cancelled = show({ status: "CANCELLED" });
    expect(pickActiveSlot(today([later, cancelled]), NOW)).toBeNull();
    expect(pickActiveSlot(undefined, NOW)).toBeNull();
  });

  it("the window end is exclusive", () => {
    expect(pickActiveSlot(today([show({})]), Date.parse("2026-10-06T11:00:00.000Z"))).toBeNull();
  });

  it("an open episode whose occurrence row is not ON_AIR still resolves by episode id", () => {
    const pending = show({ id: "ep9", status: "PENDING_HANDOVER", effectiveStart: "2026-10-06T07:00:00.000Z", effectiveEnd: "2026-10-06T08:00:00.000Z" });
    expect(pickActiveSlot(today([pending], "ep9"), NOW)).toEqual({ show: pending, endedEarly: false });
  });
});
