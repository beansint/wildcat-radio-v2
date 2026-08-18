import type { Metadata } from "next";
import { ScheduleClient } from "./schedule-client";
import { openGraphFor } from "@/lib/content/og";

export const metadata: Metadata = {
  title: "Weekly Schedule",
  description:
    "What's on, day by day — Wildcat Radio's weekly programming schedule.",
  openGraph: openGraphFor({
    title: "Weekly Schedule · Wildcat Radio",
    description:
      "What's on, day by day — Wildcat Radio's weekly programming schedule.",
  }),
};

export default function SchedulePage() {
  return <ScheduleClient />;
}
