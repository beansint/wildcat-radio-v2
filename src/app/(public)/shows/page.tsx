import type { Metadata } from "next";
import { ShowsClient } from "./shows-client";
import { openGraphFor } from "@/lib/content/og";

export const metadata: Metadata = {
  title: "Shows",
  description:
    "Browse every Wildcat Radio program, hosted by your favorite campus DJs.",
  openGraph: openGraphFor({
    title: "Shows · Wildcat Radio",
    description:
      "Browse every Wildcat Radio program, hosted by your favorite campus DJs.",
  }),
};

export default function ShowsPage() {
  return <ShowsClient />;
}
