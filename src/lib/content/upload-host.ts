/**
 * The R2 host the browser PUTs presigned uploads to.
 *
 * Announcement photos never transit the API: it hands out a presigned S3 URL
 * and the browser uploads the bytes directly. The AWS SDK signs those URLs
 * virtual-hosted style (`<bucket>.<account>.r2.cloudflarestorage.com`), which
 * is a different host from the public read host in `media-host.ts`, so the CSP
 * `connect-src` must list it or the upload is blocked. Exact host only, never
 * `*.r2.cloudflarestorage.com`, which would let injected script exfiltrate to
 * any R2 account.
 *
 * Plain `.ts` with no imports: `next.config.ts` loads this at config time.
 */
export const UPLOAD_HOST =
  process.env.NEXT_PUBLIC_UPLOAD_HOST ??
  "wildcat-radio.c0f824ad426a8e5a37e219af9e3f266a.r2.cloudflarestorage.com";
