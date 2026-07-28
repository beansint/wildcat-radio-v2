/**
 * Spec-first: derived from FE#9 AC-11 and the backend's AC-C9/AC-C10 contract
 * (`docs/features/015-m5-public-lists/feature.md`), not from the implementation.
 */
import { describe, it, expect } from "vitest";
import { announcementPath, announcementRef, isCanonicalRef } from "./public-url";

const item = { slug: "dj-tryouts-open", publicId: "k4f9v2ab" };

describe("AC-11: readable public announcement addresses", () => {
  it("builds /announcements/<slug>-<publicId>", () => {
    expect(announcementPath(item)).toBe("/announcements/dj-tryouts-open-k4f9v2ab");
  });

  it("keeps a slug that itself contains hyphens intact", () => {
    expect(announcementRef({ slug: "brownout-advisory-thu", publicId: "aa11bb22" })).toBe(
      "brownout-advisory-thu-aa11bb22",
    );
  });

  it("falls back to the bare id rather than emitting a leading hyphen when the slug is empty", () => {
    expect(announcementRef({ slug: "", publicId: "k4f9v2ab" })).toBe("k4f9v2ab");
    expect(announcementPath({ slug: "", publicId: "k4f9v2ab" })).toBe("/announcements/k4f9v2ab");
  });
});

describe("AC-11: self-healing — only rewrite the address when it actually differs", () => {
  it("treats the canonical reference as canonical", () => {
    expect(isCanonicalRef("dj-tryouts-open-k4f9v2ab", item)).toBe(true);
  });

  it("treats a stale slug as non-canonical (the title was edited after the link was shared)", () => {
    expect(isCanonicalRef("dj-tryuots-open-k4f9v2ab", item)).toBe(false);
  });

  it("treats an old bare-cuid link as non-canonical, so it upgrades to the readable address", () => {
    expect(isCanonicalRef("cmrwxqv3k004bhtpln58znc67", item)).toBe(false);
  });

  it("does not consider a different announcement's reference canonical", () => {
    expect(isCanonicalRef("dj-tryouts-open-zzzzzzzz", item)).toBe(false);
  });
});
