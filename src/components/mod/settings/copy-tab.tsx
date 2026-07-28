"use client";

/**
 * Copy tab — `copy.offAirScheduled/offAirUnexpected/broadcastHours/heroLine`.
 * (`copy.about` lives on the Branding tab, matching the prototype's
 * "Identity" grouping.)
 */
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { settingTestId } from "./tab-config";
import type { RawValues, RawValue } from "./use-settings-form";

type CopyKey =
  | "copy.offAirScheduled"
  | "copy.offAirUnexpected"
  | "copy.broadcastHours"
  | "copy.heroLine";

interface CopyTabProps {
  values: RawValues;
  setValue: (key: CopyKey, value: RawValue) => void;
}

export function CopyTab({ values, setValue }: CopyTabProps) {
  return (
    <section className="wc-card wc-card-pad">
      <h2 className="font-bold mb-3">Off-air messages</h2>

      <div className="mb-4">
        <Label htmlFor="settings-offair-scheduled" className="mb-1 block">
          Scheduled off-air
        </Label>
        <Textarea
          id="settings-offair-scheduled"
          rows={2}
          data-testid={settingTestId("copy.offAirScheduled")}
          value={values["copy.offAirScheduled"] as string}
          onChange={(e) => setValue("copy.offAirScheduled", e.target.value)}
        />
        <p className="wc-help">Shown when the station is between scheduled broadcasts.</p>
      </div>

      <div className="mb-4">
        <Label htmlFor="settings-offair-unexpected" className="mb-1 block">
          Unexpected off-air
        </Label>
        <Textarea
          id="settings-offair-unexpected"
          rows={2}
          data-testid={settingTestId("copy.offAirUnexpected")}
          value={values["copy.offAirUnexpected"] as string}
          onChange={(e) => setValue("copy.offAirUnexpected", e.target.value)}
        />
        <p className="wc-help">Shown when a live stream drops outside of schedule.</p>
      </div>

      <div className="mb-4">
        <Label htmlFor="settings-broadcast-hours" className="mb-1 block">
          Broadcast hours
        </Label>
        <Input
          id="settings-broadcast-hours"
          data-testid={settingTestId("copy.broadcastHours")}
          value={values["copy.broadcastHours"] as string}
          onChange={(e) => setValue("copy.broadcastHours", e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="settings-hero-line" className="mb-1 block">
          Hero line (public landing)
        </Label>
        <Textarea
          id="settings-hero-line"
          rows={2}
          data-testid={settingTestId("copy.heroLine")}
          value={values["copy.heroLine"] as string}
          onChange={(e) => setValue("copy.heroLine", e.target.value)}
        />
      </div>
    </section>
  );
}
