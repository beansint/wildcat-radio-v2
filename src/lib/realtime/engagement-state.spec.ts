import { describe, expect, it } from "vitest";
import { emptyEngagementState, receiptMatchesEpisode } from "./engagement-state";

describe("emptyEngagementState", () => {
  it("creates a fully empty episode-scoped state", () => {
    expect(emptyEngagementState("episode-b")).toEqual({
      episodeId: "episode-b",
      messages: [],
      livePolls: [],
      selectedOptions: {},
      receipts: [],
      upNext: [],
      pinnedTopic: null,
      hype: { count: 0, trend: "flat" },
    });
  });

  it("returns fresh collections for each episode", () => {
    const first = emptyEngagementState("episode-a");
    const second = emptyEngagementState("episode-b");
    expect(first.messages).not.toBe(second.messages);
    expect(first.selectedOptions).not.toBe(second.selectedOptions);
  });
});

describe("receiptMatchesEpisode", () => {
  const receipt = { episodeId: "episode-a", itemId: "item-1", status: "QUEUED" };

  it("accepts only the active episode", () => {
    expect(receiptMatchesEpisode(receipt, "episode-a")).toBe(true);
    expect(receiptMatchesEpisode(receipt, "episode-b")).toBe(false);
    expect(receiptMatchesEpisode(receipt, null)).toBe(false);
  });
});
