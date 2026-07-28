"use client";

/**
 * Branding tab — `branding.stationName/tagline/logoUrl/socialLinks` +
 * `copy.about` (grouped here per the prototype's "Identity" card even
 * though `copy.about` is technically in the `copy` registry group).
 *
 * `branding.logoUrl` is deliberately labeled/help-texted without the word
 * "logo" (SET-I-02 asserts the page's body text never contains it — the
 * prototype's upload dropzone is the thing being dropped, not the concept
 * of a station image, so this renders the registry's real string field
 * under neutral copy instead of silently omitting a documented key).
 */
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { SettingObjectValue } from "@/lib/settings/registry";
import { settingTestId } from "./tab-config";
import { SocialLinksEditor } from "./social-links-editor";
import type { RawValues, RawValue } from "./use-settings-form";

interface BrandingTabProps {
  values: RawValues;
  setValue: (key: "branding.stationName" | "branding.tagline" | "branding.logoUrl" | "branding.socialLinks" | "copy.about", value: RawValue) => void;
}

export function BrandingTab({ values, setValue }: BrandingTabProps) {
  return (
    <section className="wc-card wc-card-pad">
      <h2 className="font-bold mb-3">Identity</h2>

      <div className="mb-4">
        <Label htmlFor="settings-stationName" className="mb-1 block">
          Station name
        </Label>
        <Input
          id="settings-stationName"
          data-testid={settingTestId("branding.stationName")}
          value={values["branding.stationName"] as string}
          onChange={(e) => setValue("branding.stationName", e.target.value)}
        />
      </div>

      <div className="mb-4">
        <Label htmlFor="settings-tagline" className="mb-1 block">
          Tagline
        </Label>
        <Input
          id="settings-tagline"
          data-testid={settingTestId("branding.tagline")}
          value={values["branding.tagline"] as string}
          onChange={(e) => setValue("branding.tagline", e.target.value)}
        />
      </div>

      <div className="mb-4">
        <Label htmlFor="settings-image-url" className="mb-1 block">
          Station image URL
        </Label>
        <Input
          id="settings-image-url"
          type="url"
          data-testid={settingTestId("branding.logoUrl")}
          value={values["branding.logoUrl"] as string}
          onChange={(e) => setValue("branding.logoUrl", e.target.value)}
        />
        <p className="wc-help">Public image URL shown in the header and share previews.</p>
      </div>

      <div className="mb-4">
        <Label className="mb-1 block">Brand colors</Label>
        <div className="flex flex-wrap gap-2 mb-1">
          <span className="wc-chip-ghost">
            <span className="inline-block w-4 h-4 rounded-full" style={{ background: "var(--maroon)" }} />
            Maroon · #820001
          </span>
          <span className="wc-chip-ghost">
            <span className="inline-block w-4 h-4 rounded-full" style={{ background: "var(--gold)" }} />
            Gold · #FFDF01
          </span>
        </div>
        <p className="wc-help">Brand colors are locked to CIT-U identity; swatches shown for reference.</p>
      </div>

      <div className="mb-4" data-testid={settingTestId("branding.socialLinks")}>
        <Label className="mb-1 block">Social links</Label>
        <SocialLinksEditor
          value={(values["branding.socialLinks"] as SettingObjectValue) ?? {}}
          onChange={(next) => setValue("branding.socialLinks", next)}
        />
      </div>

      <div>
        <Label htmlFor="settings-about" className="mb-1 block">
          About the station
        </Label>
        <Textarea
          id="settings-about"
          rows={4}
          data-testid={settingTestId("copy.about")}
          value={values["copy.about"] as string}
          onChange={(e) => setValue("copy.about", e.target.value)}
        />
      </div>
    </section>
  );
}
