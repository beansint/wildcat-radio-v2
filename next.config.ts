import type { NextConfig } from "next";

// Announcement photos are served straight from the R2 public bucket — the API
// only ever hands out a presigned PUT and the resulting public URL, bytes never
// transit it. `next/image` refuses any remote host it wasn't told about, so the
// bucket host is declared here. Shared with the runtime URL filter so the two
// cannot disagree about the fallback (see src/lib/content/media-host.ts).
import { MEDIA_HOST } from "./src/lib/content/media-host";
// Shared with the runtime resolver so the CSP `connect-src` can never disagree
// with the origin the app actually dials. `isProduction: false` is passed
// deliberately — this runs while the config is being evaluated, and the config
// must not throw here; the runtime module (src/lib/api-origin.ts) is what
// fails fast on a missing value in a production build.
import { resolveApiOrigin } from "./src/lib/api-origin";

const API_ORIGIN = resolveApiOrigin(process.env.NEXT_PUBLIC_API_URL, false);

const nextConfig: NextConfig = {
  // Allow the dev server's /_next resources to load when the app is opened via
  // 127.0.0.1 (Next 16 treats it as cross-origin and blocks the dev JS bundle by
  // default, which silently breaks hydration during local testing). Dev-only —
  // no effect on production builds.
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: MEDIA_HOST }],
  },
  // `/privacy` is the URL people guess for a privacy policy — and it used to
  // be the signed-in rights centre, so an anonymous visitor typing it got a
  // login form instead of the notice. The notice lives at `/legal/privacy`
  // and the rights centre moved to `/my-data`, which says what it is. This
  // used to be a runtime `redirect()` inside the public shell (an extra
  // render pass, and crawlers never saw a real 308) — moved to a proper
  // config-level redirect so it's a true HTTP 308 before any React render.
  async redirects() {
    return [
      {
        source: "/privacy",
        destination: "/legal/privacy",
        permanent: true,
      },
    ];
  },
  // FE#54 — the app shipped with no security headers at all. These are applied
  // to every route.
  //
  // On the CSP: `script-src` keeps `'unsafe-inline'` deliberately. Next injects
  // inline bootstrap/flight scripts, and the staff layouts add a synchronous
  // pre-hydration theme script (FE#39) that MUST run before first paint —
  // nonce-based CSP would need per-request middleware and would break both.
  // `'unsafe-eval'` is dev-only: the dev overlay and React refresh need it, but
  // shipping eval capability in production would blunt the XSS containment the
  // CSP exists for. It is read inside `headers()` (per call, not at config
  // import) so tests can assert both environments. The CSP still earns its
  // place by locking down where content may be loaded FROM (`connect-src`,
  // `img-src`, `frame-ancestors`), which is what actually constrains data
  // exfiltration and clickjacking here.
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'";
    const csp = [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https://${MEDIA_HOST}`,
      "font-src 'self' data:",
      // The API origin is a different host in every environment, and the audio
      // stream + socket both dial it directly from the browser.
      `connect-src 'self' ${API_ORIGIN} ${API_ORIGIN.replace(/^http/, "ws")} https://${MEDIA_HOST}`,
      `media-src 'self' blob: ${API_ORIGIN} https://${MEDIA_HOST}`,
      "object-src 'none'",
      // hls.js builds its transmuxer worker from a blob URL; without an
      // explicit worker-src the browser falls back to script-src, which has no
      // blob:, and playback degrades to main-thread transmuxing.
      "worker-src 'self' blob:",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // Only meaningful over HTTPS; browsers ignore it on plain-HTTP dev.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  experimental: {
    // Next 16 already covers lucide-react and recharts; radix-ui is not on its
    // built-in list, and the app imports it on nearly every staff screen.
    optimizePackageImports: ["radix-ui"],
  },
};

export default nextConfig;
