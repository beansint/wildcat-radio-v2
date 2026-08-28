import { describe, expect, it } from "vitest";
import type { EpisodeEngagementSnapshotDto, PollResponseDto } from "@/lib/api/model";
import {
  emptyEngagementState,
  mergeEngagementSnapshot,
  receiptMatchesEpisode,
} from "./engagement-state";

const poll = (id: string, question: string): PollResponseDto =>
  ({ id, question } as PollResponseDto);

const snapshot = (): EpisodeEngagementSnapshotDto => ({
  episodeId: "episode-a",
  capturedAt: "2026-08-29T08:00:00.000Z",
  recentChat: [
    {
      id: "chat-snapshot",
      content: "Already here",
      asBooth: false,
      createdAt: "2026-08-29T07:59:00.000Z",
      author: { handle: "listener", name: "Listener" },
    },
  ],
  polls: [poll("poll-1", "Snapshot question")],
  pinnedTopic: {
    episodeId: "episode-a",
    text: "Snapshot pin",
    expiresAt: "2026-08-29T09:00:00.000Z",
    expiresAtEpisodeEnd: true,
  },
  reactions: [
    { emoji: "🔥", count: 4 },
    { emoji: "💙", count: 2 },
  ],
  upNext: [
    {
      id: "queue-snapshot",
      type: "REQUEST",
      text: "Snapshot request",
      recipient: null,
      by: "listener",
      createdAt: "2026-08-29T07:58:00.000Z",
    },
  ],
});

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

describe("mergeEngagementSnapshot", () => {
  it("hydrates a matching episode while retaining only live entries by id", () => {
    const current = {
      ...emptyEngagementState("episode-a"),
      messages: [
        { id: "chat-live", name: "Live", body: "Just arrived" },
        { id: "chat-stale", name: "Stale", body: "No longer public" },
      ],
      livePolls: [poll("poll-1", "Live replacement"), poll("poll-live", "Live only")],
      upNext: [
        { id: "queue-live", type: "MESSAGE", text: "Live request" },
        { id: "queue-stale", type: "MESSAGE", text: "No longer queued" },
      ],
    };

    const result = mergeEngagementSnapshot(current, snapshot(), {
      preserveLiveIds: new Set(["chat-live", "poll-1", "poll-live", "queue-live"]),
    });

    expect(result.messages.map((message) => message.id)).toEqual([
      "chat-snapshot",
      "chat-live",
    ]);
    expect(result.livePolls).toEqual([
      poll("poll-1", "Live replacement"),
      poll("poll-live", "Live only"),
    ]);
    expect(result.upNext.map((item) => item.id)).toEqual([
      "queue-snapshot",
      "queue-live",
    ]);
    expect(result.hype).toEqual({ count: 6, trend: "flat" });
    expect(result.pinnedTopic).toEqual({
      text: "Snapshot pin",
      expiresAt: "2026-08-29T09:00:00.000Z",
    });
  });

  it("drops chat, poll, queue, pin, and hype state absent from an authoritative snapshot", () => {
    const current = {
      ...emptyEngagementState("episode-a"),
      messages: [{ id: "chat-stale", name: "Stale", body: "Hidden while away" }],
      livePolls: [poll("poll-stale", "Closed while away")],
      upNext: [{ id: "queue-stale", type: "MESSAGE", text: "Acted on while away" }],
      pinnedTopic: { text: "Expired while away" },
      hype: { count: 99, trend: "up" },
    };

    const result = mergeEngagementSnapshot(current, snapshot());

    expect(result.messages.map((message) => message.id)).toEqual(["chat-snapshot"]);
    expect(result.livePolls).toEqual([poll("poll-1", "Snapshot question")]);
    expect(result.upNext.map((item) => item.id)).toEqual(["queue-snapshot"]);
    expect(result.pinnedTopic).toEqual({
      text: "Snapshot pin",
      expiresAt: "2026-08-29T09:00:00.000Z",
    });
    expect(result.hype).toEqual({ count: 6, trend: "flat" });
  });

  it("does not let a late snapshot replace pin or hype updated by a socket event", () => {
    const current = {
      ...emptyEngagementState("episode-a"),
      pinnedTopic: { text: "Live pin" },
      hype: { count: 9, trend: "up" },
    };

    const result = mergeEngagementSnapshot(current, snapshot(), {
      preserveLiveScalars: true,
    });

    expect(result.pinnedTopic).toEqual({ text: "Live pin" });
    expect(result.hype).toEqual({ count: 9, trend: "up" });
  });

  it("ignores a snapshot for another episode", () => {
    const current = {
      ...emptyEngagementState("episode-a"),
      messages: [{ id: "chat-live", name: "Live", body: "Keep me" }],
    };

    const result = mergeEngagementSnapshot(current, {
      ...snapshot(),
      episodeId: "episode-b",
    });

    expect(result).toBe(current);
  });
});
