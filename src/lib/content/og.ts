import type { Metadata } from "next";

/**
 * FE#37 — shared Open Graph builder.
 *
 * Next.js metadata is **shallow**-merged: a route that exports its own
 * `openGraph` object REPLACES the root layout's entirely, it does not deep-merge
 * into it. So a page setting only `{ title, description }` silently drops the
 * root's `images`, `type`, `siteName` and `locale` — which is exactly the
 * blank-link-preview bug this issue was filed for. The og:title rendered fine,
 * so it looked correct; only og:image was missing.
 *
 * Every route therefore builds its Open Graph block through this helper rather
 * than writing an object literal, so the shared fields cannot be lost again.
 */
export const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Wildcat Radio — CIT-U Campus Radio",
} as const;

export function openGraphFor({
  title,
  description,
  url,
  images,
}: {
  title: string;
  description: string;
  /** Route-relative path, e.g. `/shows`. Resolved against `metadataBase`. */
  url?: string;
  /** Override for entity pages that have their own artwork (a show cover, a DJ photo). */
  images?: NonNullable<Metadata["openGraph"]>["images"];
}): Metadata["openGraph"] {
  return {
    type: "website",
    siteName: "Wildcat Radio",
    locale: "en_PH",
    title,
    description,
    ...(url ? { url } : {}),
    images: images ?? [OG_IMAGE],
  };
}
