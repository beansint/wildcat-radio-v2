import { describe, expect, it } from "vitest";
import { resolveSocketUrl } from "./socket-url";

describe("resolveSocketUrl", () => {
  it("falls back to the backend dev port (3010), not the frontend port or the stale 3001", () => {
    expect(resolveSocketUrl(undefined)).toBe("http://localhost:3010");
  });

  it("treats an empty string the same as unset", () => {
    expect(resolveSocketUrl("")).toBe("http://localhost:3010");
  });

  it("uses the provided env value when set", () => {
    expect(resolveSocketUrl("https://api.example.com")).toBe(
      "https://api.example.com"
    );
  });
});
