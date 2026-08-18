import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { openGraphFor } from "@/lib/content/og";

export const metadata: Metadata = {
  title: "Privacy Notice",
  description: "Wildcat Radio's privacy notice — what we collect and why.",
  openGraph: openGraphFor({
    title: "Privacy Notice · Wildcat Radio",
    description: "Wildcat Radio's privacy notice — what we collect and why.",
  }),
};

export default function PrivacyPage() {
  return <LegalDocument document="privacy" />;
}
