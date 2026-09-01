/**
 * The site's absolute origin, used by `metadataBase`, `robots.ts` and
 * `sitemap.ts`. There is no production domain yet (the university subdomain
 * is still pending — see docs/final-build-plan) so this MUST come from an
 * env var with a dev fallback, never a hardcoded prod host.
 *
 * Production builds FAIL without the var (mirroring `api-origin.ts`): a
 * silent localhost fallback would ship a sitemap, robots `Sitemap:` line and
 * every OG image URL pointing at localhost with nothing failing loudly.
 */
function resolveSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "NEXT_PUBLIC_SITE_URL is required for production builds — sitemap/robots/OG URLs derive from it",
      );
    }
    return "http://localhost:3011";
  }
  return raw.replace(/\/$/, "");
}

export const SITE_URL = resolveSiteUrl();
