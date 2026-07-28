/**
 * Spec-first: public/unit.md PUB-U-04..07. Body text is always plain text —
 * never dangerouslySetInnerHTML — and errors are classified from the shape
 * `src/lib/api/fetcher.ts` actually throws (`"<status> <statusText>: <body>"`).
 */
import { describe, it, expect } from "vitest";
import { MEDIA_HOST } from "@/lib/content/media-host";
import {
  formatPublishedAt,
  toParagraphs,
  classifyQueryError,
  isAllowedImageHost,
  filterAllowedPhotoUrls,
} from "./format";

describe("PUB-U-05: relative/absolute date formatting", () => {
  it("2 hours ago renders as a relative form", () => {
    const iso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatPublishedAt(iso)).toMatch(/2 hours ago/);
  });

  it("8 days ago renders as an absolute local date, not relative", () => {
    const iso = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const label = formatPublishedAt(iso);
    expect(label).not.toMatch(/ago/);
    expect(label).not.toBeNull();
  });

  it("null publishedAt yields null, never a crash", () => {
    expect(formatPublishedAt(null)).toBeNull();
  });

  it("an unparseable value never yields 'Invalid Date'", () => {
    const label = formatPublishedAt("not-a-real-date");
    expect(label).toBeNull();
  });
});

describe("PUB-U-04: body preserves line breaks, never HTML", () => {
  it("splits on a blank line into two paragraphs", () => {
    expect(toParagraphs("line one\n\nline two")).toEqual(["line one", "line two"]);
  });

  it("preserves a single line break inside one paragraph", () => {
    const result = toParagraphs("line one\nstill paragraph one\n\nline two");
    expect(result).toEqual(["line one\nstill paragraph one", "line two"]);
  });

  it("returns a script-looking string verbatim as plain text, not markup", () => {
    const input = "<script>alert(1)</script>";
    const result = toParagraphs(input);
    expect(result).toEqual([input]);
    for (const paragraph of result) {
      expect(typeof paragraph).toBe("string");
    }
  });
});

describe("PUB-U-07: 429/404 classification", () => {
  function fetcherErrorLike(status: number, statusText: string): Error {
    return new Error(`${status} ${statusText}`);
  }

  it("429 reports rateLimited only", () => {
    const result = classifyQueryError(fetcherErrorLike(429, "Too Many Requests"));
    expect(result.rateLimited).toBe(true);
    expect(result.notFound).toBe(false);
  });

  it("404 reports notFound only", () => {
    const result = classifyQueryError(fetcherErrorLike(404, "Not Found"));
    expect(result.notFound).toBe(true);
    expect(result.rateLimited).toBe(false);
  });

  it("500 reports neither, with a generic message", () => {
    const result = classifyQueryError(fetcherErrorLike(500, "Internal Server Error"));
    expect(result.rateLimited).toBe(false);
    expect(result.notFound).toBe(false);
    expect(result.message.length).toBeGreaterThan(0);
  });
});

/**
 * The allowed host is resolved once, at module load, from the shared
 * `MEDIA_HOST` constant — which is how Next inlines a `NEXT_PUBLIC_*` value at
 * build time anyway. These cases therefore assert against that constant rather
 * than stubbing the environment variable, which a module-level `const` could
 * never observe.
 */
describe("PUB-U-06: photo URL guard", () => {
  const ALLOWED = `https://${MEDIA_HOST}/photo.jpg`;

  it("an empty photos array requests no image", () => {
    expect(filterAllowedPhotoUrls([])).toEqual([]);
  });

  it("accepts a URL on the configured host", () => {
    expect(isAllowedImageHost(ALLOWED)).toBe(true);
  });

  it("has a usable host even when NEXT_PUBLIC_MEDIA_HOST is unset", () => {
    // A deploy that forgets the env var previously filtered out every real
    // photo while next/image stayed configured for the bucket — every image
    // silently became an initials placeholder, with no error anywhere.
    expect(MEDIA_HOST).toBeTruthy();
    expect(() => new URL(`https://${MEDIA_HOST}/x.jpg`)).not.toThrow();
  });

  it("rejects a URL on any other host", () => {
    expect(isAllowedImageHost("https://evil.example.com/photo.jpg")).toBe(false);
  });

  it("rejects a malformed URL safely, no throw", () => {
    expect(isAllowedImageHost("not a url")).toBe(false);
  });

  it("filters a mixed list down to only the allowed host", () => {
    const result = filterAllowedPhotoUrls([ALLOWED, "https://evil.example.com/b.jpg"]);
    expect(result).toEqual([ALLOWED]);
  });
});
