"use client";

/**
 * Landing hero tagline — wired to the registry's `branding.tagline` (was a
 * static mock string). This is the AC-7 gap the settings page's live
 * preview implied but never actually delivered: `GET /api/settings` (the
 * public branding+copy groups) was fetched by nothing in the app before
 * this. Falls back to the original marketing copy when the key has never
 * been written, so a fresh/empty registry never renders a blank hero.
 */
import { useListSettings } from "@/lib/api/endpoints/settings/settings";
import type { PublicSettingDto } from "@/lib/api/model";

const DEFAULT_TAGLINE =
  "The campus radio station of the Cebu Institute of Technology - University. Tune in, request a song, join the room.";

export function HeroTagline() {
  const settingsQuery = useListSettings<PublicSettingDto[]>({ query: { retry: false } });
  // `PublicSettingDtoValue` is generated as a bare index-signature object
  // (the registry is polymorphic — string/number/boolean/object per key) so
  // the actual runtime type has to be narrowed with `unknown`, not trusted
  // from the generated type alone.
  const rawTagline: unknown = settingsQuery.data?.find((row) => row.key === "branding.tagline")?.value;
  const tagline = typeof rawTagline === "string" && rawTagline.trim() ? rawTagline : DEFAULT_TAGLINE;

  return (
    <p className="text-white/85 max-w-md text-lg" data-testid="public-hero-tagline">
      {tagline}
    </p>
  );
}
