import type { NextConfig } from "next";

// Announcement photos are served straight from the R2 public bucket — the API
// only ever hands out a presigned PUT and the resulting public URL, bytes never
// transit it. `next/image` refuses any remote host it wasn't told about, so the
// bucket host is declared here. Shared with the runtime URL filter so the two
// cannot disagree about the fallback (see src/lib/content/media-host.ts).
import { MEDIA_HOST } from "./src/lib/content/media-host";

const nextConfig: NextConfig = {
  // Allow the dev server's /_next resources to load when the app is opened via
  // 127.0.0.1 (Next 16 treats it as cross-origin and blocks the dev JS bundle by
  // default, which silently breaks hydration during local testing). Dev-only —
  // no effect on production builds.
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: MEDIA_HOST }],
  },
};

export default nextConfig;
