import type { Metadata } from "next";
import { announcementsPublicControllerGetOne } from "@/lib/api/endpoints/announcements-public/announcements-public";
import { toParagraphs } from "@/lib/content/format";
import { AnnouncementDetailClient } from "./announcement-detail-client";
import { openGraphFor } from "@/lib/content/og";

type Props = {
  params: Promise<{ ref: string }>;
};

const FALLBACK_METADATA: Metadata = {
  title: "Announcement not found",
  description: "This announcement doesn't exist, or isn't published.",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ref } = await params;

  try {
    const announcement = await announcementsPublicControllerGetOne(ref);
    const description = toParagraphs(announcement.content)[0] ?? "Read the full announcement on Wildcat Radio.";
    return {
      title: announcement.title,
      description,
      openGraph: openGraphFor({
        title: `${announcement.title} · Wildcat Radio`,
        description,
      }),
    };
  } catch {
    // A DRAFT/PENDING_REVIEW/REJECTED/ARCHIVED/unknown ref all 404
    // identically at the API — fall back rather than throwing out of
    // generateMetadata, and with no title leak either way.
    return FALLBACK_METADATA;
  }
}

export default function AnnouncementDetailPage() {
  return <AnnouncementDetailClient />;
}
