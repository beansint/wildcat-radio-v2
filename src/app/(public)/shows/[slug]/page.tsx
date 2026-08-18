import type { Metadata } from "next";
import { getShowPublic } from "@/lib/api/endpoints/shows-public/shows-public";
import { ShowDetailClient } from "./show-detail-client";
import { openGraphFor } from "@/lib/content/og";

type Props = {
  params: Promise<{ slug: string }>;
};

const FALLBACK_METADATA: Metadata = {
  title: "Show not found",
  description: "This show doesn't exist, or isn't listed anymore.",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  try {
    const show = await getShowPublic(slug);
    const description = show.description ?? `Listen to ${show.name} on Wildcat Radio.`;
    return {
      title: show.name,
      description,
      openGraph: openGraphFor({
        title: `${show.name} · Wildcat Radio`,
        description,
      }),
    };
  } catch {
    // Unknown/deleted slug 404s at the API (PUB-C-04) — fall back to a
    // generic not-found title/description rather than throwing out of
    // generateMetadata, which would take the whole route down with it.
    return FALLBACK_METADATA;
  }
}

export default function ShowDetailPage() {
  return <ShowDetailClient />;
}
