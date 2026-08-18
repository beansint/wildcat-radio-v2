import type { Metadata } from "next";
import { AnnouncementsClient } from "./announcements-client";
import { openGraphFor } from "@/lib/content/og";

export const metadata: Metadata = {
  title: "Announcements",
  description: "Station updates and shoutouts from Wildcat Radio.",
  openGraph: openGraphFor({
    title: "Announcements · Wildcat Radio",
    description: "Station updates and shoutouts from Wildcat Radio.",
  }),
};

export default function AnnouncementsPage() {
  return <AnnouncementsClient />;
}
