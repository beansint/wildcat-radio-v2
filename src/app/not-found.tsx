/**
 * FE#36 — root `not-found.tsx`. Sits above every route group (`(public)`,
 * `(auth)`, `(app)`, `(staff)`, `(station)`), so a URL that doesn't match any
 * segment renders here with NONE of those layouts' chrome — no TopNav, no
 * Footer, no StaffSidebar. Deliberately does NOT reuse
 * `PublicNotFound` (src/components/public/public-states.tsx), which assumes
 * a surrounding shell; this gives its own minimal standalone chrome (brand
 * mark + home link) so a mistyped URL doesn't land on an unbranded orphan
 * page. `(public)` has its own `not-found.tsx` that DOES use
 * `PublicNotFound`, since `PublicShell` supplies the TopNav/Footer there.
 *
 * Server component (no interactivity needed) — safe to keep off "use client".
 */
import Image from "next/image";
import Link from "next/link";

export default function RootNotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <Image
        src="/brand/logo-mascot-mark.png"
        alt="Wildcat Radio"
        width={64}
        height={64}
        className="h-16 w-16"
        priority
      />
      <div data-testid="root-not-found" className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-extrabold">Page not found</h1>
        <p className="wc-muted max-w-sm">
          The page you&apos;re looking for doesn&apos;t exist, or the link may be
          outdated.
        </p>
      </div>
      <Link
        href="/"
        data-testid="root-not-found-home"
        className="wc-btn wc-btn-primary"
      >
        Back to home
      </Link>
    </div>
  );
}
