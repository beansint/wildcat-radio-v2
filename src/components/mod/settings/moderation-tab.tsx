"use client";

/**
 * Moderation tab — the filter lists (a different resource, see
 * `FilterListEditor`), the strike ladder (numeric, unit spelled out in the
 * label per SET-U-06 — never the prototype's free-text "24h"), request
 * budgets, and the announcements pin limit.
 */
import { settingTestId } from "./tab-config";
import { NumberField } from "./number-field";
import { FilterListEditor } from "./filter-list-editor";
import type { RawValues, RawValue } from "./use-settings-form";

type ModerationKey =
  | "policy.strike1Hours"
  | "policy.strike2Days"
  | "policy.strikeDecayDays"
  | "policy.campusRequestBudget"
  | "policy.guestRequestBudget"
  | "announcements.pinLimit";

interface ModerationTabProps {
  values: RawValues;
  setValue: (key: ModerationKey, value: RawValue) => void;
}

export function ModerationTab({ values, setValue }: ModerationTabProps) {
  return (
    <>
      <FilterListEditor />

      <section className="wc-card wc-card-pad">
        <h2 className="font-bold mb-3">Strike ladder</h2>
        <div className="grid sm:grid-cols-3 gap-x-3">
          <NumberField
            id="settings-strike1"
            testId={settingTestId("policy.strike1Hours")}
            label="1st strike duration"
            unit="hours"
            value={values["policy.strike1Hours"] as string}
            onChange={(value) => setValue("policy.strike1Hours", value)}
          />
          <NumberField
            id="settings-strike2"
            testId={settingTestId("policy.strike2Days")}
            label="2nd strike duration"
            unit="days"
            value={values["policy.strike2Days"] as string}
            onChange={(value) => setValue("policy.strike2Days", value)}
          />
          <NumberField
            id="settings-strike-decay"
            testId={settingTestId("policy.strikeDecayDays")}
            label="Strike decay"
            unit="days"
            value={values["policy.strikeDecayDays"] as string}
            onChange={(value) => setValue("policy.strikeDecayDays", value)}
          />
        </div>
        <p className="wc-help">Strikes auto-decay after the decay window of clean behavior.</p>
      </section>

      <section className="wc-card wc-card-pad">
        <h2 className="font-bold mb-3">Request budgets</h2>
        <div className="grid sm:grid-cols-2 gap-x-3">
          <NumberField
            id="settings-campus-budget"
            testId={settingTestId("policy.campusRequestBudget")}
            label="Campus listener request budget"
            help="Song requests per campus listener per day."
            value={values["policy.campusRequestBudget"] as string}
            onChange={(value) => setValue("policy.campusRequestBudget", value)}
          />
          <NumberField
            id="settings-guest-budget"
            testId={settingTestId("policy.guestRequestBudget")}
            label="Guest listener request budget"
            help="Song requests per guest listener per day."
            value={values["policy.guestRequestBudget"] as string}
            onChange={(value) => setValue("policy.guestRequestBudget", value)}
          />
        </div>
      </section>

      <section className="wc-card wc-card-pad">
        <h2 className="font-bold mb-3">Announcements</h2>
        <NumberField
          id="settings-pin-limit"
          testId={settingTestId("announcements.pinLimit")}
          label="Pin limit"
          help="Maximum announcements that may be pinned at once."
          value={values["announcements.pinLimit"] as string}
          onChange={(value) => setValue("announcements.pinLimit", value)}
        />
      </section>
    </>
  );
}
