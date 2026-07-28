/**
 * Pure helpers for the Moderation tab's block/watch filter lists.
 *
 * These are `FilterEntry` rows (`GET/POST/DELETE /api/mod/filter`) — a
 * different resource from the typed settings registry (SET-U-05,
 * `.agent/test-suites/fe-m5-public-content/mod-settings/unit.md`). This
 * module only holds the client-side dedupe/normalize logic; the network
 * calls live in the page/components that call `moderationControllerAddFilter`.
 */

export type FilterTier = "BLOCK" | "WATCH";

export interface FilterEntryLike {
  word: string;
}

export type FilterAddValidation = { ok: true; word: string } | { ok: false; message: string };

// Mirrors the backend's `normalize()` byte-for-byte
// (`wildcat-radio-v2-backend/apps/api/src/moderation/filter/normalize.ts`):
// NFKD-decompose, strip combining marks, lowercase, leet-map, strip every
// non-`[a-z0-9]` separator/space/punct character, then collapse runs of 3+
// repeats. This is deliberately aggressive (defeats profanity-filter
// evasion like "b4d-w0rd" or "yawaaaa"), so the *stored* word is almost
// never the raw text a moderator typed — the UI must render `entry.word`
// (the server's normalized form) rather than echo the input back, and any
// client-side duplicate check must normalize the same way the server will,
// or it under-detects duplicates the server would 409 on anyway.
// Keep this in sync with the backend copy; there is no shared package to
// import it from cross-repo.
const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
  "!": "i",
  "|": "i",
};

export function normalizeFilterWord(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining marks
    .toLowerCase()
    .split("")
    .map((ch) => LEET[ch] ?? ch)
    .join("") // leet map
    .replace(/[^a-z0-9]/g, "") // strip separators/spaces/punct
    .replace(/(.)\1{2,}/g, "$1"); // collapse runs of 3+ repeats
}

/**
 * Client-side guard mirroring the server's duplicate rejection (SET-C-04):
 * blocks a blank word and a word that already exists in the list
 * (case-insensitive, trimmed), regardless of which tier it's currently in.
 */
export function validateFilterAdd(existing: readonly FilterEntryLike[], raw: string): FilterAddValidation {
  const normalized = normalizeFilterWord(raw);
  if (normalized === "") {
    return { ok: false, message: "Enter a word or phrase." };
  }
  const isDuplicate = existing.some((entry) => normalizeFilterWord(entry.word) === normalized);
  if (isDuplicate) {
    return { ok: false, message: `"${raw.trim()}" is already on the filter list.` };
  }
  return { ok: true, word: raw.trim() };
}
