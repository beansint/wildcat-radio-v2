import type { Metadata } from "next";

/**
 * Auth route-group layout.
 * Renders no TopNav or MobileDrawer — auth pages own their full viewport via wc-auth-grid.
 * Root layout already provides html / body / QueryProvider / GlobalPlayer.
 */
// Login/register/reset flows are already disallowed in robots.txt; this adds
// the page-level `noindex` meta tag too, since a crawler that reaches the
// page some other way (e.g. an inbound link) should still be told not to
// index it. This is a plain server component, so — unlike `(app)/layout.tsx`
// which is `"use client"` — it can export metadata directly.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
