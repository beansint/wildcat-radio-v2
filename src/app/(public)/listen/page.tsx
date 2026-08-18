import type { Metadata } from "next";
import { ListenClient } from "./listen-client";
import { openGraphFor } from "@/lib/content/og";

export const metadata: Metadata = {
  title: "Listen Live",
  description:
    "Tune in to Wildcat Radio's live stream, see who's on air, chat with other listeners, and vote in live polls.",
  openGraph: openGraphFor({
    title: "Listen Live · Wildcat Radio",
    description:
      "Tune in to Wildcat Radio's live stream, see who's on air, chat with other listeners, and vote in live polls.",
  }),
};

export default function ListenPage() {
  return <ListenClient />;
}
