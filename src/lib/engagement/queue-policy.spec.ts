import { describe, expect, it } from "vitest";
import { groupStudioQueue, queueActionMessage, listenerRestrictions, quotaMessage } from "./queue-policy";

describe("operator queue decisions", () => {
  it("counts only pending and keeps terminal history separate from accepted work", () => {
    const items = ["READ", "PENDING", "HANDLED", "QUEUED", "DECLINED", "EXPIRED", "REMOVED"].map((status, i) => ({ id: String(i), status }));
    const groups = groupStudioQueue(items);
    expect(groups.pending.map(i => i.status)).toEqual(["PENDING"]);
    expect(groups.upNext.map(i => i.status)).toEqual(["QUEUED"]);
    expect(groups.history.map(i => i.status)).toEqual(["READ", "HANDLED", "DECLINED", "EXPIRED", "REMOVED"]);
  });
  it("reports the actual positive outcome even when receipts are opted out", () => {
    expect(queueActionMessage({ status: "QUEUED", receipt: false })).toBe("Added to Up Next.");
    expect(queueActionMessage({ status: "READ", receipt: false })).toBe("Marked read on air.");
    expect(queueActionMessage({ status: "HANDLED", receipt: false })).toBe("Marked handled. Removed from Up Next.");
    expect(queueActionMessage({ status: "DECLINED", receipt: false })).toBe("Declined silently.");
  });
  it("mentions a receipt only when the server emitted one", () => {
    expect(queueActionMessage({ status: "QUEUED", receipt: true })).toBe("Added to Up Next. Receipt sent.");
  });
});

describe("episode restrictions", () => {
  const flags = { episodeId: "ep", chatPaused: true, submissionsPaused: true, staffChatFrozen: false, staffGuestsDisabled: false };
  it("keeps staff exempt from booth pauses", () => {
    expect(listenerRestrictions(flags, { role: "MODERATOR", class: "GUEST" })).toEqual({ chat: null, submissions: null, voting: null });
  });
  it("shows staff restrictions before booth pause and does not let booth resume bypass them", () => {
    const result = listenerRestrictions({ ...flags, chatPaused: false, submissionsPaused: false, staffChatFrozen: true, staffGuestsDisabled: true }, { role: "LISTENER", class: "GUEST" });
    expect(result.chat).toContain("staff");
    expect(result.submissions).toContain("staff");
    expect(result.voting).toContain("Guest participation");
  });
  it("a chat freeze leaves voting available to campus listeners", () => {
    expect(listenerRestrictions({ ...flags, staffChatFrozen: true }, { class: "CAMPUS" }).voting).toBeNull();
  });
  it("explains persisted allowance across all three submission types without refunds", () => {
    const text = quotaMessage({ limit: 2, used: 2, remaining: 0 });
    expect(text).toContain("0 of 2");
    expect(text).toContain("requests, dedications, and questions");
    expect(text).toContain("do not restore");
    expect(quotaMessage({ limit: null, used: 12, remaining: null })).toContain("unlimited");
  });
});
