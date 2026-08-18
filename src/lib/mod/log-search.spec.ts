import { describe, expect, it } from "vitest";
import { matchesLogSearch } from "./log-search";

describe("matchesLogSearch", () => {
  const entry = { action: "attendance.edit", actorId: "mod-42", metadata: { reason: "Backfilled a missed clock-in" } };

  it("empty query matches everything", () => {
    expect(matchesLogSearch(entry, "")).toBe(true);
    expect(matchesLogSearch(entry, "   ")).toBe(true);
  });

  it("matches a substring anywhere in the entry, case-insensitively", () => {
    expect(matchesLogSearch(entry, "MOD-42")).toBe(true);
    expect(matchesLogSearch(entry, "backfilled")).toBe(true);
    expect(matchesLogSearch(entry, "attendance.edit")).toBe(true);
  });

  it("does not match text absent from the entry", () => {
    expect(matchesLogSearch(entry, "ban")).toBe(false);
  });
});
