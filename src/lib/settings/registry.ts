/**
 * Typed settings field catalog for /mod/settings (backend feature.md AC-7 —
 * the registry is deliberately non-coercive: a number key always sends a JS
 * number, a boolean always sends a boolean, an object always sends an
 * object). The server derives `group` from the key's dot-prefix, so the
 * save payload only ever carries `{key, value}` — never `group`.
 */
import { getApiErrorMessage } from "@/lib/api/error-message";

export type SettingKind = "string" | "number" | "boolean" | "object";

export type SettingObjectValue = Record<string, string>;
export type SettingValue = string | number | boolean | SettingObjectValue;

export type SettingKey =
  | "branding.stationName"
  | "branding.tagline"
  | "branding.logoUrl"
  | "branding.socialLinks"
  | "copy.about"
  | "copy.offAirScheduled"
  | "copy.offAirUnexpected"
  | "copy.broadcastHours"
  | "copy.heroLine"
  | "toggle.chatFreeze"
  | "toggle.slowModeSeconds"
  | "killswitch.guests"
  | "policy.strike1Hours"
  | "policy.strike2Days"
  | "policy.strikeDecayDays"
  | "policy.campusRequestBudget"
  | "policy.guestRequestBudget"
  | "announcements.pinLimit";

export interface SettingFieldDef {
  key: SettingKey;
  kind: SettingKind;
  label: string;
  help: string;
  /** Tab/group this field is shown under — derived from the key prefix, never sent to the server. */
  group: string;
  unit?: string;
  default: SettingValue;
}

function field(def: Omit<SettingFieldDef, "group">): SettingFieldDef {
  return { ...def, group: def.key.split(".")[0] };
}

export const REGISTRY: Record<SettingKey, SettingFieldDef> = {
  "branding.stationName": field({
    key: "branding.stationName",
    kind: "string",
    label: "Station name",
    help: "Shown in the header and page titles.",
    default: "",
  }),
  "branding.tagline": field({
    key: "branding.tagline",
    kind: "string",
    label: "Tagline",
    help: "Short line under the station name.",
    default: "",
  }),
  "branding.logoUrl": field({
    key: "branding.logoUrl",
    kind: "string",
    label: "Logo URL",
    help: "Public URL of the station logo.",
    default: "",
  }),
  "branding.socialLinks": field({
    key: "branding.socialLinks",
    kind: "object",
    label: "Social links",
    help: "Platform name to URL, e.g. { twitter: '...' }.",
    default: {},
  }),
  "copy.about": field({
    key: "copy.about",
    kind: "string",
    label: "About copy",
    help: "Shown on the public About section.",
    default: "",
  }),
  "copy.offAirScheduled": field({
    key: "copy.offAirScheduled",
    kind: "string",
    label: "Off-air (scheduled) copy",
    help: "Shown when the station is off-air on a known schedule.",
    default: "",
  }),
  "copy.offAirUnexpected": field({
    key: "copy.offAirUnexpected",
    kind: "string",
    label: "Off-air (unexpected) copy",
    help: "Shown when the station drops off-air outside schedule.",
    default: "",
  }),
  "copy.broadcastHours": field({
    key: "copy.broadcastHours",
    kind: "string",
    label: "Broadcast hours",
    help: "Human-readable broadcast hours copy.",
    default: "",
  }),
  "copy.heroLine": field({
    key: "copy.heroLine",
    kind: "string",
    label: "Hero line",
    help: "Headline shown on the public homepage hero.",
    default: "",
  }),
  "toggle.chatFreeze": field({
    key: "toggle.chatFreeze",
    kind: "boolean",
    label: "Freeze chat",
    help: "Stops all new chat messages station-wide.",
    default: false,
  }),
  "toggle.slowModeSeconds": field({
    key: "toggle.slowModeSeconds",
    kind: "number",
    label: "Slow mode",
    help: "Minimum seconds between a listener's chat messages.",
    unit: "seconds",
    default: 0,
  }),
  "killswitch.guests": field({
    key: "killswitch.guests",
    kind: "boolean",
    label: "Guest killswitch",
    help: "Blocks all guest (unauthenticated) listener actions.",
    default: false,
  }),
  "policy.strike1Hours": field({
    key: "policy.strike1Hours",
    kind: "number",
    label: "1st strike duration",
    help: "How long a first strike stays active.",
    unit: "hours",
    default: 24,
  }),
  "policy.strike2Days": field({
    key: "policy.strike2Days",
    kind: "number",
    label: "2nd strike duration",
    help: "How long a second strike stays active.",
    unit: "days",
    default: 7,
  }),
  "policy.strikeDecayDays": field({
    key: "policy.strikeDecayDays",
    kind: "number",
    label: "Strike decay",
    help: "How long until a strike is no longer counted toward escalation.",
    unit: "days",
    default: 30,
  }),
  "policy.campusRequestBudget": field({
    key: "policy.campusRequestBudget",
    kind: "number",
    label: "Campus listener request budget",
    help: "Song requests per campus listener per day.",
    default: 5,
  }),
  "policy.guestRequestBudget": field({
    key: "policy.guestRequestBudget",
    kind: "number",
    label: "Guest request budget",
    help: "Song requests per guest listener per day.",
    default: 2,
  }),
  "announcements.pinLimit": field({
    key: "announcements.pinLimit",
    kind: "number",
    label: "Pin limit",
    help: "Maximum announcements that may be pinned at once.",
    default: 2,
  }),
};

export const SETTING_KEYS: readonly SettingKey[] = Object.keys(REGISTRY) as SettingKey[];

export interface SettingRow {
  key: string;
  value: unknown;
}

/** Maps `GET /api/settings/admin` rows onto field values, defaulting a key never written. */
export function hydrate(rows: readonly SettingRow[]): Record<SettingKey, SettingValue> {
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const result = {} as Record<SettingKey, SettingValue>;
  for (const key of SETTING_KEYS) {
    const raw = byKey.get(key);
    result[key] = raw === undefined ? REGISTRY[key].default : (raw as SettingValue);
  }
  return result;
}

function normalize(value: SettingValue): string {
  if (typeof value === "object" && value !== null) {
    const sortedEntries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(sortedEntries);
  }
  return JSON.stringify(value);
}

function valuesEqual(a: SettingValue, b: SettingValue): boolean {
  return normalize(a) === normalize(b);
}

export interface SettingSavePlanEntry {
  key: SettingKey;
  value: SettingValue;
}

/** Only the genuinely-changed fields — a value edited then reverted is not included. */
export function buildSavePlan(
  loaded: Record<SettingKey, SettingValue>,
  current: Record<SettingKey, SettingValue>,
): SettingSavePlanEntry[] {
  return SETTING_KEYS.filter((key) => !valuesEqual(loaded[key], current[key])).map((key) => ({
    key,
    value: current[key],
  }));
}

export type FieldValidation = { ok: true; value: SettingValue } | { ok: false; message: string };

/** Blocks NaN/blank numerics rather than sending them; never coerces types. */
export function validateField(key: SettingKey, rawValue: unknown): FieldValidation {
  const def = REGISTRY[key];

  if (def.kind === "number") {
    if (typeof rawValue === "number") {
      return Number.isNaN(rawValue)
        ? { ok: false, message: `${def.label} must be a number.` }
        : { ok: true, value: rawValue };
    }
    const trimmed = String(rawValue ?? "").trim();
    if (trimmed === "") {
      return { ok: false, message: `${def.label} is required.` };
    }
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      return { ok: false, message: `${def.label} must be a number.` };
    }
    return { ok: true, value: parsed };
  }

  if (def.kind === "boolean") {
    return { ok: true, value: Boolean(rawValue) };
  }

  if (def.kind === "object") {
    if (typeof rawValue !== "object" || rawValue === null || Array.isArray(rawValue)) {
      return { ok: false, message: `${def.label} must be an object.` };
    }
    return { ok: true, value: rawValue as SettingObjectValue };
  }

  return { ok: true, value: String(rawValue ?? "") };
}

export interface SettingSaveResult {
  key: SettingKey;
  ok: boolean;
  error?: unknown;
}

export interface SettingSaveSummary {
  succeeded: SettingKey[];
  failed: { key: SettingKey; message: string }[];
}

/** Partial-failure reporting: names the failing key and reason, keeps the successes. */
export function summarizeSaveResults(results: readonly SettingSaveResult[]): SettingSaveSummary {
  const succeeded: SettingKey[] = [];
  const failed: { key: SettingKey; message: string }[] = [];

  for (const result of results) {
    if (result.ok) {
      succeeded.push(result.key);
    } else {
      failed.push({ key: result.key, message: getApiErrorMessage(result.error) });
    }
  }

  return { succeeded, failed };
}
