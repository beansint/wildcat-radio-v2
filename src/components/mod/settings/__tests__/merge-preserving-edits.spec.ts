import { describe, expect, it } from "vitest";
import { mergePreservingEdits, type RawValues } from "../use-settings-form";
import { SETTING_KEYS, type SettingKey, type SettingValue } from "@/lib/settings/registry";

/**
 * `/mod/settings` refetches its one admin read on window focus, and again after
 * a save. Re-hydrating the form from that response must not throw away edits
 * the moderator hasn't saved yet.
 */

const TAGLINE = "branding.tagline" as SettingKey;
const STRIKE = "policy.strike1Hours" as SettingKey;
const FREEZE = "toggle.chatFreeze" as SettingKey;

function typedFixture(overrides: Partial<Record<SettingKey, SettingValue>> = {}) {
  const typed = {} as Record<SettingKey, SettingValue>;
  for (const key of SETTING_KEYS) typed[key] = "" as SettingValue;
  typed[TAGLINE] = "The voice of CIT-U" as SettingValue;
  typed[STRIKE] = 24 as SettingValue;
  typed[FREEZE] = false as SettingValue;
  return { ...typed, ...overrides };
}

function rawFixture(overrides: Partial<RawValues> = {}): RawValues {
  const raw = {} as RawValues;
  for (const key of SETTING_KEYS) raw[key] = "";
  raw[TAGLINE] = "The voice of CIT-U";
  raw[STRIKE] = "24";
  raw[FREEZE] = false;
  return { ...raw, ...overrides };
}

describe("mergePreservingEdits", () => {
  it("takes the server payload wholesale on the very first load", () => {
    const next = rawFixture({ [TAGLINE]: "From the server" });
    expect(mergePreservingEdits(null, null, next)).toBe(next);
  });

  it("keeps a field the moderator edited but has not saved", () => {
    // Moderator typed a new tagline, then the window regained focus and the
    // query refetched. The edit must survive.
    const previousLoaded = typedFixture();
    const previousValues = rawFixture({ [TAGLINE]: "Half-typed new tagline" });
    const next = rawFixture();

    const merged = mergePreservingEdits(previousValues, previousLoaded, next);

    expect(merged[TAGLINE]).toBe("Half-typed new tagline");
  });

  it("takes the server's value for fields the moderator is not editing", () => {
    // Someone else changed the strike window while this form was open; that
    // field isn't dirty here, so the fresh value should land.
    const previousLoaded = typedFixture();
    const previousValues = rawFixture({ [TAGLINE]: "Half-typed new tagline" });
    const next = rawFixture({ [STRIKE]: "48" });

    const merged = mergePreservingEdits(previousValues, previousLoaded, next);

    expect(merged[STRIKE]).toBe("48");
    expect(merged[TAGLINE]).toBe("Half-typed new tagline");
  });

  it("keeps the failed key's edit after a partial save", () => {
    // Two keys edited; the tagline PUT succeeded and the strike PUT 400'd. The
    // success path invalidates the query, so a refetch arrives carrying the
    // saved tagline and the OLD strike value. The rejected edit has to stay on
    // screen and stay dirty, or the alert names a field whose value is already
    // gone and pressing Save again sends nothing.
    const previousLoaded = typedFixture();
    const previousValues = rawFixture({ [TAGLINE]: "Saved tagline", [STRIKE]: "999" });
    const next = rawFixture({ [TAGLINE]: "Saved tagline" });

    const merged = mergePreservingEdits(previousValues, previousLoaded, next);

    expect(merged[STRIKE]).toBe("999");
    expect(merged[TAGLINE]).toBe("Saved tagline");
  });

  it("stops preserving a value once it matches what was loaded", () => {
    // Moderator edited then manually typed the original back: not dirty, so the
    // server's value wins and a later remote change isn't blocked forever.
    const previousLoaded = typedFixture();
    const previousValues = rawFixture();
    const next = rawFixture({ [TAGLINE]: "Changed elsewhere" });

    expect(mergePreservingEdits(previousValues, previousLoaded, next)[TAGLINE]).toBe(
      "Changed elsewhere",
    );
  });

  it("compares object-valued fields structurally, not by reference", () => {
    const social = "branding.socialLinks" as SettingKey;
    const previousLoaded = typedFixture({ [social]: { facebook: "a" } as SettingValue });
    // Same content, different object identity — this is not an edit.
    const previousValues = rawFixture({ [social]: { facebook: "a" } });
    const next = rawFixture({ [social]: { facebook: "b" } });

    expect(mergePreservingEdits(previousValues, previousLoaded, next)[social]).toEqual({
      facebook: "b",
    });
  });
});
