/**
 * /mod/settings UI grouping — a real Vitest tab-config, not the pass-through
 * registry `group` (branding/copy/toggle/killswitch/policy/announcements).
 * The prototype's four visible tabs are Branding / Copy / Toggles /
 * Moderation (Session dropped — see the page-level file header for why),
 * so this maps each registry key onto exactly one of those tabs.
 */
import type { SettingKey } from "@/lib/settings/registry";

export type SettingsTabKey = "branding" | "copy" | "toggles" | "moderation";

export const SETTINGS_TABS: { key: SettingsTabKey; label: string }[] = [
  { key: "branding", label: "Branding" },
  { key: "copy", label: "Copy" },
  { key: "toggles", label: "Toggles" },
  { key: "moderation", label: "Moderation" },
];

export const TAB_FIELDS: Record<SettingsTabKey, SettingKey[]> = {
  branding: [
    "branding.stationName",
    "branding.tagline",
    "branding.logoUrl",
    "branding.socialLinks",
    "copy.about",
  ],
  copy: ["copy.offAirScheduled", "copy.offAirUnexpected", "copy.broadcastHours", "copy.heroLine"],
  toggles: ["toggle.chatFreeze", "toggle.slowModeSeconds", "killswitch.guests"],
  moderation: [
    "policy.strike1Hours",
    "policy.strike2Days",
    "policy.strikeDecayDays",
    "policy.campusRequestBudget",
    "policy.guestRequestBudget",
    "announcements.pinLimit",
  ],
};

/** `mod-settings-<group>-<camelCaseKeySuffix>` — group here is the registry's own key-prefix group, per the QA plan's binding testid list (not the UI tab). */
export function settingTestId(key: SettingKey): string {
  const [group, suffix] = key.split(".");
  return `mod-settings-${group}-${suffix}`;
}
