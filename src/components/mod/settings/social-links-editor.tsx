"use client";

/**
 * `branding.socialLinks` — the registry types this as a bare `object`
 * (`Record<string, string>`, no fixed key set on the server). The prototype
 * drew three unlabeled URL inputs; this keeps that shape but fixes the keys
 * to the three platforms it showed so the value round-trips as a real
 * object rather than an arbitrary-key editor no test asks for.
 */
import { Input } from "@/components/ui/input";
import type { SettingObjectValue } from "@/lib/settings/registry";

const PLATFORMS = ["facebook", "instagram", "twitter"] as const;

interface SocialLinksEditorProps {
  value: SettingObjectValue;
  onChange: (next: SettingObjectValue) => void;
}

export function SocialLinksEditor({ value, onChange }: SocialLinksEditorProps) {
  return (
    <div className="wc-stack">
      {PLATFORMS.map((platform) => (
        <Input
          key={platform}
          type="url"
          placeholder={`https://${platform}.com/... (optional)`}
          aria-label={`${platform} URL`}
          data-testid={`mod-settings-branding-socialLinks-${platform}`}
          value={value[platform] ?? ""}
          onChange={(e) => {
            const next = { ...value };
            if (e.target.value) {
              next[platform] = e.target.value;
            } else {
              delete next[platform];
            }
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}
