/**
 * The single source of truth for the media host.
 *
 * `next.config.ts` uses it to tell `next/image` which remote host it may load,
 * and `isAllowedImageHost` uses it to filter URLs before they reach `<Image>`.
 * These two used to declare the fallback separately — the config defaulted to
 * the dev bucket while the filter returned `false` when the env var was unset.
 * A deploy that forgot `NEXT_PUBLIC_MEDIA_HOST` therefore configured
 * `next/image` correctly and then filtered out every real photo, replacing all
 * announcement/show/DJ imagery with initials placeholders and reporting nothing
 * anywhere. One constant, one fallback, so the two can't drift again.
 *
 * Plain `.ts` with no imports: `next.config.ts` loads this at config time.
 */
export const MEDIA_HOST =
  process.env.NEXT_PUBLIC_MEDIA_HOST ?? "pub-3d516b7425bc416288580567af2cb662.r2.dev";
