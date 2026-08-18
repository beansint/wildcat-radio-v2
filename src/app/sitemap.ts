import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/content/site-url";

/**
 * Static-only for now, by deliberate choice.
 *
 * `/shows/[slug]` and `/djs/[id]` entries could be enumerated by fetching
 * `listShowsPublic()` / `listDjsPublic()` (src/lib/api/endpoints/*-public)
 * at build time (`sitemap.ts` supports async). That was considered and
 * rejected for now: `next build` runs at deploy time against whatever the
 * API's reachability happens to be at that moment, and there is no retry or
 * fallback path if the fetch fails or times out — an unreachable API would
 * turn a missing sitemap row into a *failed production build*, which is a
 * strictly worse outcome than a sitemap that's missing the dynamic detail
 * pages. The 10 static routes below are all crawlers need to discover the
 * whole public site (every dynamic detail page is one click from `/shows`
 * or `/djs`, which are both listed).
 *
 * Follow-up: once the API has a stable, always-on public deployment (or
 * `sitemap.ts` is moved behind ISR/ on-demand revalidation instead of running
 * at build time), revisit enumerating `/shows/[slug]` and `/djs/[id]` here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "/", priority: 1, changeFrequency: "hourly" },
    { path: "/listen", priority: 0.9, changeFrequency: "hourly" },
    { path: "/shows", priority: 0.8, changeFrequency: "daily" },
    { path: "/djs", priority: 0.8, changeFrequency: "daily" },
    { path: "/schedule", priority: 0.7, changeFrequency: "daily" },
    { path: "/charts", priority: 0.6, changeFrequency: "daily" },
    { path: "/announcements", priority: 0.7, changeFrequency: "daily" },
    { path: "/legal/privacy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/legal/terms", priority: 0.3, changeFrequency: "yearly" },
    { path: "/attribution", priority: 0.3, changeFrequency: "monthly" },
  ];

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
