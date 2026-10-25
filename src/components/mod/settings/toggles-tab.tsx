"use client";

/**
 * Toggles tab — `toggle.chatFreeze`, `toggle.slowModeSeconds`,
 * `killswitch.guests`. The prototype's chat/requests/polls/reactions
 * master switches are deliberately absent (no backend layer has ever had
 * them — feature.md "Notes / decisions").
 */
import { settingTestId } from "./tab-config";
import { SwitchField } from "./switch-field";
import { NumberField } from "./number-field";
import type { RawValues, RawValue } from "./use-settings-form";

type ToggleKey = "toggle.chatFreeze" | "toggle.slowModeSeconds" | "killswitch.guests";

interface TogglesTabProps {
  values: RawValues;
  setValue: (key: ToggleKey, value: RawValue) => void;
}

export function TogglesTab({ values, setValue }: TogglesTabProps) {
  return (
    <section className="wc-card wc-card-pad">
      <h2 className="font-bold mb-1">Live features</h2>
      <p className="wc-help mb-3">Turn listener-facing features on or off station-wide.</p>

      <SwitchField
        id="settings-chat-freeze"
        testId={settingTestId("toggle.chatFreeze")}
        label="Freeze chat"
        help="Pauses listener chat and new submissions station-wide. Staff, polls and fixed reactions remain available."
        checked={values["toggle.chatFreeze"] as boolean}
        onChange={(checked) => setValue("toggle.chatFreeze", checked)}
      />

      <NumberField
        id="settings-slow-mode"
        testId={settingTestId("toggle.slowModeSeconds")}
        label="Slow mode"
        unit="seconds"
        help="Minimum time between a listener's chat messages, and separately between submissions. Staff are exempt."
        value={values["toggle.slowModeSeconds"] as string}
        onChange={(value) => setValue("toggle.slowModeSeconds", value)}
      />

      <SwitchField
        id="settings-guest-killswitch"
        testId={settingTestId("killswitch.guests")}
        label="Guest killswitch"
        help="Pauses chat, submissions and voting for registered guest listeners. Campus listeners, staff and fixed reactions remain available."
        checked={values["killswitch.guests"] as boolean}
        onChange={(checked) => setValue("killswitch.guests", checked)}
      />
    </section>
  );
}
