import { describe, expect, it } from "vitest";
import { emptyEngagementState } from "./engagement-state";

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
