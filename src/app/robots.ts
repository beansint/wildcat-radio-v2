import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/content/site-url";

/**
 * Everything under `(app)`, `(auth)`, `(staff)` and `(station)` is either
 * authenticated or a login/reset flow — none of it is meant to be indexed or
 * crawled. Only the seven `(public)` content routes are open.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/mod",
        "/admin",
        "/studio",
        "/profile",
        "/notifications",
        "/my-data",
        "/login",
        "/register",
        "/reset-password",
        "/verify-email",
        "/forgot-password",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
