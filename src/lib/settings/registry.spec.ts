/**
 * Spec-first: mod-settings/unit.md SET-U-01..04, 07. AC-7 (013-content-
 * announcements) is deliberately non-coercive — this registry never
 * stringifies a number or booleanizes via truthiness.
 */
import { describe, it, expect } from "vitest";
import {
  SETTING_KEYS,
  REGISTRY,
  hydrate,
  buildSavePlan,
  validateField,
  summarizeSaveResults,
  type SettingKey,
  type SettingValue,
} from "./registry";

function allDefaults(): Record<SettingKey, SettingValue> {
  return hydrate([]);
}

describe("registry catalog", () => {
  it("has exactly the specified keys", () => {
    const expected: SettingKey[] = [
      "branding.stationName",
      "branding.tagline",
      "branding.logoUrl",
      "branding.socialLinks",
      "copy.about",
      "copy.offAirScheduled",
      "copy.offAirUnexpected",
      "copy.broadcastHours",
      "copy.heroLine",
      "toggle.chatFreeze",
      "toggle.slowModeSeconds",
      "killswitch.guests",
      "policy.strike1Hours",
      "policy.strike2Days",
      "policy.strikeDecayDays",
      "policy.campusRequestBudget",
      "policy.guestRequestBudget",
      "announcements.pinLimit",
    ];
    expect([...SETTING_KEYS].sort()).toEqual([...expected].sort());
  });

  it("every entry declares key/kind/label/help/group/default", () => {
    for (const key of SETTING_KEYS) {
      const def = REGISTRY[key];
      expect(def.key).toBe(key);
      expect(def.kind).toBeTruthy();
      expect(def.label).toBeTruthy();
      expect(def.help).toBeTruthy();
      expect(def.group).toBeTruthy();
      expect(def.default).toBeDefined();
    }
  });
});

describe("SET-U-03: value hydration and defaults", () => {
  it("a missing key renders its documented default, not empty", () => {
    const values = hydrate([]);
    expect(values["policy.strike1Hours"]).toBe(REGISTRY["policy.strike1Hours"].default);
    expect(values["toggle.chatFreeze"]).toBe(REGISTRY["toggle.chatFreeze"].default);
  });

  it("a present row overrides the default", () => {
    const values = hydrate([{ key: "toggle.chatFreeze", value: true }]);
    expect(values["toggle.chatFreeze"]).toBe(true);
  });
});

describe("SET-U-01: dirty diff", () => {
  it("plans exactly the fields that changed", () => {
    const loaded = allDefaults();
    const current = { ...loaded, "policy.strike1Hours": 48, "toggle.chatFreeze": true };
    const plan = buildSavePlan(loaded, current);
    expect(plan).toHaveLength(2);
    expect(plan.map((p) => p.key).sort()).toEqual(["policy.strike1Hours", "toggle.chatFreeze"].sort());
  });

  it("a field edited then reverted is not in the plan", () => {
    const loaded = allDefaults();
    const current = { ...loaded };
    const plan = buildSavePlan(loaded, current);
    expect(plan).toEqual([]);
  });

  it("no changes yields an empty plan", () => {
    const loaded = allDefaults();
    expect(buildSavePlan(loaded, { ...loaded })).toEqual([]);
  });
});

describe("SET-U-02: typed payloads, no coercion", () => {
  it("a number key sends a JS number, never a string", () => {
    const loaded = allDefaults();
    const current = { ...loaded, "policy.strike1Hours": 5 };
    const plan = buildSavePlan(loaded, current);
    const entry = plan.find((p) => p.key === "policy.strike1Hours");
    expect(entry?.value).toBe(5);
    expect(typeof entry?.value).toBe("number");
  });

  it("a boolean key sends true/false, never a string or 1/0", () => {
    const loaded = allDefaults();
    const current = { ...loaded, "toggle.chatFreeze": true };
    const plan = buildSavePlan(loaded, current);
    const entry = plan.find((p) => p.key === "toggle.chatFreeze");
    expect(entry?.value).toBe(true);
    expect(typeof entry?.value).toBe("boolean");
  });

  it("an object key sends an object, never an array or JSON string", () => {
    const loaded = allDefaults();
    const current = { ...loaded, "branding.socialLinks": { twitter: "https://x.com/wc" } };
    const plan = buildSavePlan(loaded, current);
    const entry = plan.find((p) => p.key === "branding.socialLinks");
    expect(typeof entry?.value).toBe("object");
    expect(Array.isArray(entry?.value)).toBe(false);
    expect(entry?.value).toEqual({ twitter: "https://x.com/wc" });
  });

  it("a blank numeric input blocks with a validation message, never sends NaN", () => {
    const result = validateField("policy.strike1Hours", "");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("a non-numeric numeric input is blocked, not coerced to NaN", () => {
    const result = validateField("policy.strike1Hours", "not-a-number");
    expect(result.ok).toBe(false);
  });

  it("a valid numeric string is accepted as a real number", () => {
    const result = validateField("policy.strike1Hours", "48");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(48);
      expect(typeof result.value).toBe("number");
    }
  });
});

describe("SET-U-04: group derivation is the server's job", () => {
  it("the save plan entries carry only key + value, never group", () => {
    const loaded = allDefaults();
    const current = { ...loaded, "policy.strike1Hours": 5 };
    const plan = buildSavePlan(loaded, current);
    for (const entry of plan) {
      expect(Object.keys(entry).sort()).toEqual(["key", "value"]);
    }
  });
});

describe("SET-U-06: strike ladder units", () => {
  it("strike1Hours is labelled/unit'd in hours", () => {
    expect(REGISTRY["policy.strike1Hours"].unit).toMatch(/hour/i);
  });

  it("strike2Days and strikeDecayDays are labelled/unit'd in days", () => {
    expect(REGISTRY["policy.strike2Days"].unit).toMatch(/day/i);
    expect(REGISTRY["policy.strikeDecayDays"].unit).toMatch(/day/i);
  });

  it("these fields are numeric, not free text like '24h'", () => {
    expect(REGISTRY["policy.strike1Hours"].kind).toBe("number");
    const result = validateField("policy.strike1Hours", "24h");
    expect(result.ok).toBe(false);
  });
});

describe("SET-U-07: save partial failure reporting", () => {
  it("names the failing key and reason, keeps the successes", () => {
    const summary = summarizeSaveResults([
      { key: "policy.strike1Hours", ok: true },
      { key: "toggle.chatFreeze", ok: false, error: new Error("400 Bad Request: {\"message\":\"invalid\"}") },
      { key: "announcements.pinLimit", ok: true },
    ]);
    expect(summary.succeeded.sort()).toEqual(["announcements.pinLimit", "policy.strike1Hours"].sort());
    expect(summary.failed).toHaveLength(1);
    expect(summary.failed[0].key).toBe("toggle.chatFreeze");
    expect(summary.failed[0].message.length).toBeGreaterThan(0);
  });
});
