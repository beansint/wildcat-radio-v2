import type { Metadata } from "next";
import { DjsClient } from "./djs-client";
import { openGraphFor } from "@/lib/content/og";

export const metadata: Metadata = {
  title: "DJs",
  description: "The voices behind Wildcat Radio. Pick a DJ to see their shows.",
  openGraph: openGraphFor({
    title: "DJs · Wildcat Radio",
    description: "The voices behind Wildcat Radio. Pick a DJ to see their shows.",
  }),
};

export default function DjsPage() {
  return <DjsClient />;
}
