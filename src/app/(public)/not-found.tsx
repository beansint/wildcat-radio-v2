/**
 * FE#36 — `(public)` segment not-found. Unlike the root `not-found.tsx`,
 * this renders inside `PublicShell` (TopNav + Footer already present), so it
 * can reuse `PublicNotFound` directly (src/components/public/public-states.tsx)
 * instead of building standalone chrome.
 */
import { PublicNotFound } from "@/components/public/public-states";

export default function PublicSegmentNotFound() {
  return (
    <PublicNotFound
      heading="Page not found"
      message="This page doesn't exist, or the link may be outdated."
    />
  );
}
