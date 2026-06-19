import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server's /_next resources to load when the app is opened via
  // 127.0.0.1 (Next 16 treats it as cross-origin and blocks the dev JS bundle by
  // default, which silently breaks hydration during local testing). Dev-only —
  // no effect on production builds.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
