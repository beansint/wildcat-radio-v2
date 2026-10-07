/** live-path-hardening (#127) — studio console recovery helpers (supports W-E7 / W-E8). */
import { describe, expect, it } from "vitest";
import type { ChatMessageResponseDto, EpisodeEngagementSnapshotDto, PollResponseDto } from "@/lib/api/model";
import { isAuthFailure, mergeSnapshotChat, mergeSnapshotPolls } from "./console-snapshot";

function snapshot(overrides: Partial<EpisodeEngagementSnapshotDto> = {}): EpisodeEngagementSnapshotDto {
  return {
    episodeId: "ep",
    capturedAt: "2026-10-06T10:00:00.000Z",
    recentChat: [],
    polls: [],
    pinnedTopic: null,
    reactions: [],
    upNext: [],
    ...overrides,
  };
}

const live = (id: string, createdAt: string): ChatMessageResponseDto => ({
  id,
  episodeId: "ep",
  content: id,
  asBooth: false,
  createdAt,
  author: { id: "u", handle: "h", name: "n" },
});

describe("isAuthFailure", () => {
  it("only 401/403 are auth failures", () => {
    expect(isAuthFailure(new Error("401 Unauthorized: {}"))).toBe(true);
    expect(isAuthFailure(new Error("403 Forbidden"))).toBe(true);
    expect(isAuthFailure(new Error("503 Service Unavailable: {}"))).toBe(false);
    expect(isAuthFailure(new TypeError("Failed to fetch"))).toBe(false);
    expect(isAuthFailure("nope")).toBe(false);
  });
});

describe("mergeSnapshotChat", () => {
  it("adds snapshot chat, keeps live messages, dedupes by id and sorts by time", () => {
    const merged = mergeSnapshotChat([live("b", "2026-10-06T10:02:00.000Z")], snapshot({
      recentChat: [
        { id: "a", content: "a", asBooth: true, createdAt: "2026-10-06T10:01:00.000Z", author: null },
        { id: "b", content: "b", asBooth: false, createdAt: "2026-10-06T10:02:00.000Z", author: { handle: "h", name: "n" } },
      ],
    }));
    expect(merged.map((m) => m.id)).toEqual(["a", "b"]);
    expect(merged[0]).toMatchObject({ episodeId: "ep", asBooth: true, author: null });
  });

  it("keeps the last 100 messages", () => {
    const recentChat = Array.from({ length: 120 }, (_, i) => ({
      id: `m${i}`,
      content: "x",
      asBooth: false,
      createdAt: new Date(Date.UTC(2026, 9, 6, 10, 0, i)).toISOString(),
      author: null,
    }));
    const merged = mergeSnapshotChat([], snapshot({ recentChat }));
    expect(merged).toHaveLength(100);
    expect(merged[99].id).toBe("m119");
  });
});

describe("mergeSnapshotPolls", () => {
  it("live polls win over snapshot copies; snapshot fills the gaps", () => {
    const poll = (id: string, question: string) => ({ id, question }) as unknown as PollResponseDto;
    expect(mergeSnapshotPolls([poll("1", "live")], [poll("1", "old"), poll("2", "snap")])).toEqual([
      poll("1", "live"),
      poll("2", "snap"),
    ]);
  });
});
