import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { openGraphFor } from "@/lib/content/og";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Wildcat Radio's terms of service.",
  openGraph: openGraphFor({
    title: "Terms of Service · Wildcat Radio",
    description: "Wildcat Radio's terms of service.",
  }),
};

export default function TermsPage() {
  return <LegalDocument document="tos" />;
}
