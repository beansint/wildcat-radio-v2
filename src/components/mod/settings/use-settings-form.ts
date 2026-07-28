"use client";

/**
 * Form state for /mod/settings — one `GET /api/settings/admin` populates
 * every field (SET-I-01: exactly one settings read, never a per-key
 * fallback), and Save issues one `PUT /api/settings/:key` per genuinely
 * changed key via `buildSavePlan` (SET-U-01).
 *
 * Values are held in an *editable* raw shape (numbers as `string` so the
 * field can be legitimately blank while typing; booleans/objects as-is) so a
 * dirty check never has to compare a half-typed string against a typed
 * number. `save()` re-validates only the dirty keys through
 * `registry.validateField` and only then builds the typed payload
 * `buildSavePlan` diffs and `updateSetting` sends — the registry itself is
 * never edited or bypassed (AC-7's non-coercive typing).
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSettingsAdmin,
  getListSettingsAdminQueryKey,
  updateSetting,
} from "@/lib/api/endpoints/settings/settings";
import type { SettingDto } from "@/lib/api/model";
import {
  REGISTRY,
  SETTING_KEYS,
  hydrate,
  buildSavePlan,
  validateField,
  summarizeSaveResults,
  type SettingKey,
  type SettingValue,
  type SettingObjectValue,
} from "@/lib/settings/registry";

export type RawValue = string | boolean | SettingObjectValue;
export type RawValues = Record<SettingKey, RawValue>;

function toRaw(key: SettingKey, value: SettingValue): RawValue {
  const kind = REGISTRY[key].kind;
  if (kind === "number") return String(value);
  if (kind === "boolean") return Boolean(value);
  if (kind === "object") return (value as SettingObjectValue) ?? {};
  return String(value ?? "");
}

function rawEqual(a: RawValue | undefined, b: RawValue | undefined): boolean {
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

function rawValuesFromTyped(typed: Record<SettingKey, SettingValue>): RawValues {
  const raw = {} as RawValues;
  for (const key of SETTING_KEYS) raw[key] = toRaw(key, typed[key]);
  return raw;
}

export interface UseSettingsFormResult {
  isLoading: boolean;
  isError: boolean;
  values: RawValues;
  setValue: (key: SettingKey, value: RawValue) => void;
  isDirty: (key: SettingKey) => boolean;
  isFormDirty: boolean;
  discard: () => void;
  save: () => Promise<void>;
  isSaving: boolean;
  alertMessage: string | null;
  statusMessage: string | null;
  clearMessages: () => void;
}

const EMPTY_RAW = {} as RawValues;

/**
 * Re-hydration that keeps unsaved edits. Any field the moderator has changed
 * relative to `previousLoaded` keeps its edited value; every other field takes
 * the server's fresh value.
 *
 * Without this, two things went wrong. The query refetches on window focus, so
 * alt-tabbing away and back silently discarded pending edits. And after a
 * partial save — one key 200s, another 400s — the success path invalidates the
 * query, and the refetch reset the *failed* key too: the alert named a field
 * whose edit was already gone and whose Save was no longer armed, so retrying
 * sent nothing.
 */
export function mergePreservingEdits(
  previousValues: RawValues | null,
  previousLoaded: Record<SettingKey, SettingValue> | null,
  nextRaw: RawValues,
): RawValues {
  if (!previousValues || !previousLoaded) return nextRaw;
  return Object.fromEntries(
    SETTING_KEYS.map((key) => {
      const isEdited = !rawEqual(previousValues[key], toRaw(key, previousLoaded[key]));
      return [key, isEdited ? previousValues[key] : nextRaw[key]];
    }),
  ) as RawValues;
}

export function useSettingsForm(): UseSettingsFormResult {
  const queryClient = useQueryClient();
  const query = useListSettingsAdmin<SettingDto[]>();

  const [loadedTyped, setLoadedTyped] = useState<Record<SettingKey, SettingValue> | null>(null);
  const [values, setValues] = useState<RawValues | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // "Adjusting state when a prop changes" (react.dev) rather than an effect
  // — a fresh `GET /api/settings/admin` payload re-hydrates the local
  // editable form state exactly once per new response, computed during
  // render instead of in a post-commit effect.
  //
  // Re-hydration must NOT clobber fields the moderator has edited but not yet
  // saved. This query refetches on window focus, so an unguarded overwrite
  // meant alt-tabbing away and back silently discarded pending edits; and
  // after a partial save (one key 200s, another 400s) the invalidate-driven
  // refetch reset the failed key too, so the alert named a field whose edit
  // had already been thrown away and whose Save was no longer armed.
  //
  // A field is only overwritten when it is *not* dirty relative to the values
  // this form last loaded — i.e. the server is free to update anything the
  // moderator isn't currently editing.
  const [syncedData, setSyncedData] = useState<SettingDto[] | undefined>(undefined);
  if (query.data && query.data !== syncedData) {
    setSyncedData(query.data);
    const typed = hydrate(query.data);
    const nextRaw = rawValuesFromTyped(typed);
    const previousValues = values;
    const previousLoaded = loadedTyped;
    setLoadedTyped(typed);
    setValues(mergePreservingEdits(previousValues, previousLoaded, nextRaw));
  }

  function clearMessages() {
    setAlertMessage(null);
    setStatusMessage(null);
  }

  function setValue(key: SettingKey, value: RawValue) {
    setValues((prev) => (prev ? { ...prev, [key]: value } : prev));
    clearMessages();
  }

  function isDirty(key: SettingKey): boolean {
    if (!values || !loadedTyped) return false;
    return !rawEqual(values[key], toRaw(key, loadedTyped[key]));
  }

  const isFormDirty = useMemo(() => {
    if (!values || !loadedTyped) return false;
    return SETTING_KEYS.some((key) => !rawEqual(values[key], toRaw(key, loadedTyped[key])));
  }, [values, loadedTyped]);

  function discard() {
    if (!loadedTyped) return;
    setValues(rawValuesFromTyped(loadedTyped));
    clearMessages();
  }

  async function save() {
    if (!values || !loadedTyped) return;
    setStatusMessage(null);

    const dirtyKeys = SETTING_KEYS.filter((key) => isDirty(key));
    if (dirtyKeys.length === 0) return;

    const validationErrors: string[] = [];
    const currentTyped: Record<SettingKey, SettingValue> = { ...loadedTyped };
    for (const key of dirtyKeys) {
      const result = validateField(key, values[key]);
      if (!result.ok) {
        validationErrors.push(`${REGISTRY[key].label}: ${result.message}`);
      } else {
        currentTyped[key] = result.value;
      }
    }

    if (validationErrors.length > 0) {
      setAlertMessage(validationErrors.join(" "));
      return;
    }

    const plan = buildSavePlan(loadedTyped, currentTyped);
    if (plan.length === 0) return;

    setIsSaving(true);
    setAlertMessage(null);
    const results: { key: SettingKey; ok: boolean; error?: unknown }[] = [];
    for (const entry of plan) {
      try {
        await updateSetting(entry.key, { body: JSON.stringify({ value: entry.value }) });
        results.push({ key: entry.key, ok: true });
      } catch (error) {
        results.push({ key: entry.key, ok: false, error });
      }
    }
    setIsSaving(false);

    const summary = summarizeSaveResults(results);
    if (summary.succeeded.length > 0) {
      const nextLoaded = { ...loadedTyped };
      for (const key of summary.succeeded) {
        nextLoaded[key] = currentTyped[key];
      }
      setLoadedTyped(nextLoaded);
      // Targeted invalidation — this is the one query this page reads from.
      queryClient.invalidateQueries({ queryKey: getListSettingsAdminQueryKey() });
    }

    if (summary.failed.length > 0) {
      const failedDescriptions = summary.failed.map((f) => `${REGISTRY[f.key].label}: ${f.message}`);
      const savedNote =
        summary.succeeded.length > 0 ? ` ${summary.succeeded.length} other change(s) saved.` : "";
      setAlertMessage(`${failedDescriptions.join(" ")}${savedNote}`);
    } else {
      setStatusMessage("Settings saved.");
    }
  }

  return {
    // On a failed read the query is no longer "loading" but `values` stays
    // null, so an unqualified `!values` pinned this true forever and the
    // page's error branch — checked after isLoading — was unreachable. A
    // moderator hitting a down API sat on a skeleton with no error and no
    // retry.
    isLoading: !query.isError && (query.isLoading || !values || !loadedTyped),
    isError: query.isError,
    values: values ?? EMPTY_RAW,
    setValue,
    isDirty,
    isFormDirty,
    discard,
    save,
    isSaving,
    alertMessage,
    statusMessage,
    clearMessages,
  };
}
