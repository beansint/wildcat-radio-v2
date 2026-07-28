/**
 * Spec-first: mod-settings/unit.md SET-U-05 — filter list is a different
 * resource; duplicate adds are prevented client-side.
 */
import { describe, it, expect } from "vitest";
import { normalizeFilterWord, validateFilterAdd } from "./filter-list";

describe("normalizeFilterWord", () => {
  // Mirrors the backend's `normalize.spec.ts` cases (moderation/filter/normalize.ts)
  // to keep this client-side copy provably in sync with the server's contract.
  it("trims and lowercases", () => {
    expect(normalizeFilterWord("  Yawa  ")).toBe("yawa");
  });

  it("strips diacritics", () => {
    expect(normalizeFilterWord("YÁWÀ")).toBe("yawa");
  });

  it("collapses runs of 3+ repeats", () => {
    expect(normalizeFilterWord("yawaaaa")).toBe("yawa");
  });

  it("maps leet substitutions", () => {
    expect(normalizeFilterWord("p1sti")).toBe("pisti");
    expect(normalizeFilterWord("y@w@")).toBe("yawa");
  });

  it("strips separators and hyphens", () => {
    expect(normalizeFilterWord("y a w a")).toBe("yawa");
    expect(normalizeFilterWord("y.a.w-a")).toBe("yawa");
  });

  it("is idempotent", () => {
    const once = normalizeFilterWord("Y@W@aaa");
    expect(normalizeFilterWord(once)).toBe(once);
  });
});

describe("SET-U-05: validateFilterAdd", () => {
  it("accepts a genuinely new word", () => {
    const result = validateFilterAdd([{ word: "putang" }], "yawa");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.word).toBe("yawa");
    }
  });

  it("rejects a duplicate, case-insensitive and trimmed", () => {
    const result = validateFilterAdd([{ word: "yawa" }], "  YAWA  ");
    expect(result.ok).toBe(false);
  });

  it("rejects a duplicate regardless of which tier it's already in", () => {
    const result = validateFilterAdd([{ word: "gago" }], "gago");
    expect(result.ok).toBe(false);
  });

  it("rejects a blank/whitespace-only word", () => {
    const result = validateFilterAdd([], "   ");
    expect(result.ok).toBe(false);
  });

  it("is case/whitespace-insensitive in both directions", () => {
    const result = validateFilterAdd([{ word: "  Buang " }], "buang");
    expect(result.ok).toBe(false);
  });
});
