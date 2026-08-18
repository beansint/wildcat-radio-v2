import type { Metadata } from "next";
import { getDjPublic } from "@/lib/api/endpoints/djs-public/djs-public";
import { DjProfileClient } from "./dj-profile-client";
import { openGraphFor } from "@/lib/content/og";

type Props = {
  params: Promise<{ id: string }>;
};

const FALLBACK_METADATA: Metadata = {
  title: "DJ not found",
  description: "This DJ profile doesn't exist, or isn't active anymore.",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const dj = await getDjPublic(id);
    const description = dj.bio ?? `${dj.displayName}'s DJ profile on Wildcat Radio.`;
    return {
      title: dj.displayName,
      description,
      openGraph: openGraphFor({
        title: `${dj.displayName} · Wildcat Radio`,
        description,
      }),
    };
  } catch {
    // An inactive/unknown id 404s directly at the API — fall back rather
    // than throwing out of generateMetadata (PUB-E-04: no name leak either
    // way, since the fallback never names the DJ).
    return FALLBACK_METADATA;
  }
}

export default function DjProfilePage() {
  return <DjProfileClient />;
}
