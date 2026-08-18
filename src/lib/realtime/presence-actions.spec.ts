import { describe, expect, it } from "vitest";
import { computePresenceTransition } from "./presence-actions";

describe("computePresenceTransition", () => {
  it("does not connect when inactive and there was no prior room (marketing pages, no play pressed)", () => {
    const t = computePresenceTransition({
      active: false,
      episodeId: null,
      prevEpisodeId: null,
    });
    expect(t).toEqual({
      shouldConnect: false,
      leave: null,
      join: null,
      nextPrevEpisodeId: null,
    });
  });

  it("connects and joins the room when active with a fresh episodeId", () => {
    const t = computePresenceTransition({
      active: true,
      episodeId: "ep-1",
      prevEpisodeId: null,
    });
    expect(t).toEqual({
      shouldConnect: true,
      leave: null,
      join: "ep-1",
      nextPrevEpisodeId: "ep-1",
    });
  });

  it("connects but does not join when active with no episodeId (e.g. station rotation)", () => {
    const t = computePresenceTransition({
      active: true,
      episodeId: null,
      prevEpisodeId: null,
    });
    expect(t).toEqual({
      shouldConnect: true,
      leave: null,
      join: null,
      nextPrevEpisodeId: null,
    });
  });

  it("leaves the old room and joins the new one when the episode changes while active", () => {
    const t = computePresenceTransition({
      active: true,
      episodeId: "ep-2",
      prevEpisodeId: "ep-1",
    });
    expect(t).toEqual({
      shouldConnect: true,
      leave: "ep-1",
      join: "ep-2",
      nextPrevEpisodeId: "ep-2",
    });
  });

  it("does not re-emit leave/join when the episode is unchanged", () => {
    const t = computePresenceTransition({
      active: true,
      episodeId: "ep-1",
      prevEpisodeId: "ep-1",
    });
    expect(t).toEqual({
      shouldConnect: true,
      leave: null,
      join: "ep-1",
      nextPrevEpisodeId: "ep-1",
    });
  });

  it("tears down and leaves the prior room when going idle (play -> pause)", () => {
    const t = computePresenceTransition({
      active: false,
      episodeId: "ep-1",
      prevEpisodeId: "ep-1",
    });
    expect(t).toEqual({
      shouldConnect: false,
      leave: "ep-1",
      join: null,
      nextPrevEpisodeId: null,
    });
  });

  it("going idle with no prior room is a true no-op (nothing to leave)", () => {
    const t = computePresenceTransition({
      active: false,
      episodeId: "ep-9",
      prevEpisodeId: null,
    });
    expect(t).toEqual({
      shouldConnect: false,
      leave: null,
      join: null,
      nextPrevEpisodeId: null,
    });
  });
});
