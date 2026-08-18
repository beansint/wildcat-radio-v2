import type { Metadata } from "next";
import { ChartsClient } from "./charts-client";
import { openGraphFor } from "@/lib/content/og";

export const metadata: Metadata = {
  title: "Charts",
  description:
    "This week's most-requested tracks on Wildcat Radio, auto-generated from listener requests.",
  openGraph: openGraphFor({
    title: "Charts · Wildcat Radio",
    description:
      "This week's most-requested tracks on Wildcat Radio, auto-generated from listener requests.",
  }),
};

export default function ChartsPage() {
  return <ChartsClient />;
}
