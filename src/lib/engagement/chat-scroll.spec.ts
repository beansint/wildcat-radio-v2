import { describe, expect, it } from "vitest";
import { isChatAtBottom, unreadMessageCount } from "./chat-scroll";

describe("reading position", () => {
  it("follows a reader near the bottom but preserves an older-message position", () => {
    expect(isChatAtBottom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 595 })).toBe(true);
    expect(isChatAtBottom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 250 })).toBe(false);
  });
  it("counts new IDs even when a capped feed drops an older item", () => {
    expect(unreadMessageCount(["b", "c", "d"], new Set(["a", "b", "c"]))).toBe(1);
    expect(unreadMessageCount(["b", "c"], new Set(["a", "b", "c"]))).toBe(0);
  });
});
