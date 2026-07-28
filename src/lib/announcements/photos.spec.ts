/**
 * Spec-first: mirrors the server-side photo validation (Slice B AC-B3) and
 * the presigned-PUT contract R2 actually enforces (exact header values).
 */
import { describe, it, expect } from "vitest";
import {
  ANNOUNCEMENT_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  validatePhoto,
  uploadToPresignedUrl,
  type FetchLike,
  type UploadablePhoto,
} from "./photos";

describe("ANN-U-04: photo pre-validation mirrors the server", () => {
  it("accepts image/jpeg, image/png, image/webp", () => {
    for (const type of ANNOUNCEMENT_PHOTO_TYPES) {
      expect(validatePhoto({ type, size: 1024, existingCount: 0 })).toEqual({ ok: true });
    }
  });

  it("rejects image/gif with a specific message", () => {
    const result = validatePhoto({ type: "image/gif", size: 1024, existingCount: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/jpeg|png|webp/i);
    }
  });

  it("rejects an arbitrary unsupported type", () => {
    const result = validatePhoto({ type: "application/pdf", size: 1024, existingCount: 0 });
    expect(result.ok).toBe(false);
  });

  it("accepts size 1 and the exact 5 MB boundary", () => {
    expect(validatePhoto({ type: "image/png", size: 1, existingCount: 0 })).toEqual({ ok: true });
    expect(validatePhoto({ type: "image/png", size: MAX_PHOTO_BYTES, existingCount: 0 })).toEqual({
      ok: true,
    });
  });

  it("rejects size 0, negative size, and one byte over the limit — each with a specific message", () => {
    const zero = validatePhoto({ type: "image/png", size: 0, existingCount: 0 });
    const negative = validatePhoto({ type: "image/png", size: -1, existingCount: 0 });
    const over = validatePhoto({ type: "image/png", size: MAX_PHOTO_BYTES + 1, existingCount: 0 });
    expect(zero.ok).toBe(false);
    expect(negative.ok).toBe(false);
    expect(over.ok).toBe(false);
    if (!zero.ok && !over.ok) {
      // size-empty and size-too-large are distinct failure modes, not a shared generic message
      expect(zero.message).not.toBe(over.message);
    }
  });

  it("rejects the 5th photo when 4 already exist", () => {
    expect(MAX_PHOTOS).toBe(4);
    const result = validatePhoto({ type: "image/png", size: 1024, existingCount: 4 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/4|four|limit/i);
    }
  });

  it("gives a specific message per failure mode, never a generic 'invalid file'", () => {
    const typeFail = validatePhoto({ type: "image/gif", size: 1024, existingCount: 0 });
    const sizeFail = validatePhoto({ type: "image/png", size: MAX_PHOTO_BYTES + 1, existingCount: 0 });
    const countFail = validatePhoto({ type: "image/png", size: 1024, existingCount: 4 });
    expect(typeFail.ok).toBe(false);
    expect(sizeFail.ok).toBe(false);
    expect(countFail.ok).toBe(false);
    if (!typeFail.ok && !sizeFail.ok && !countFail.ok) {
      const messages = new Set([typeFail.message, sizeFail.message, countFail.message]);
      expect(messages.size).toBe(3);
      for (const message of messages) {
        expect(message.toLowerCase()).not.toBe("invalid file");
      }
    }
  });
});

describe("ANN-U-05: presigned PUT headers", () => {
  it("issues PUT with exact Content-Type/Content-Length, no credentials, and no auth cookie", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fakeFetch: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return new Response(null, { status: 200 });
    };

    await uploadToPresignedUrl(
      "https://r2.example.com/put-url?sig=abc",
      { type: "image/webp", size: 234_567 },
      fakeFetch,
    );

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toBe("https://r2.example.com/put-url?sig=abc");
    expect(call.init?.method).toBe("PUT");
    expect(call.init?.credentials).toBe("omit");
    const headers = call.init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("image/webp");
    expect(headers["Content-Length"]).toBe("234567");
  });

  it("ANN-U-05: sends the file itself as the body, not a descriptor of it", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return new Response(null, { status: 200 });
    };
    // A real File/Blob — R2 signed this exact byte length, so an empty or
    // stand-in body would be rejected by the signature check.
    const file = new Blob([new Uint8Array(12)], { type: "image/png" }) as unknown as UploadablePhoto;

    await uploadToPresignedUrl("https://r2.example.com/put-url", file, fakeFetch);

    expect(calls[0].init?.body).toBe(file);
  });

  it("throws a descriptive error on a non-2xx response", async () => {
    const fakeFetch: FetchLike = async () => new Response(null, { status: 403 });

    await expect(
      uploadToPresignedUrl("https://r2.example.com/put-url", { type: "image/png", size: 10 }, fakeFetch),
    ).rejects.toThrow(/upload/i);
  });
});
