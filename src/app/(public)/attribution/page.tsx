import type { Metadata } from "next";
import { AttributionClient } from "./attribution-client";
import { openGraphFor } from "@/lib/content/og";

export const metadata: Metadata = {
  title: "Music Credits",
  description:
    "Creative Commons music credits for tracks played on Wildcat Radio.",
  openGraph: openGraphFor({
    title: "Music Credits · Wildcat Radio",
    description:
      "Creative Commons music credits for tracks played on Wildcat Radio.",
  }),
};

export default function AttributionPage() {
  return <AttributionClient />;
}
