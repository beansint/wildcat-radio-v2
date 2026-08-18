/**
 * The site's absolute origin, used by `metadataBase`, `robots.ts` and
 * `sitemap.ts`. There is no production domain yet (the university subdomain
 * is still pending — see docs/final-build-plan) so this MUST come from an
 * env var with a dev fallback, never a hardcoded prod host.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3011").replace(/\/$/, "");
