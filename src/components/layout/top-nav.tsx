"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useSession, type SessionUser } from "@/lib/auth/client";
import { getStaffPortalPath } from "@/lib/auth/staff-routing";
import { useHydrated } from "@/lib/use-hydrated";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/listen", label: "Listen" },
  { href: "/schedule", label: "Schedule" },
  { href: "/shows", label: "Shows" },
  { href: "/djs", label: "DJs" },
  { href: "/charts", label: "Charts" },
  { href: "/announcements", label: "News" },
] as const;

interface TopNavProps {
  onMenu?: () => void;
}

export function TopNav({ onMenu }: TopNavProps) {
  const pathname = usePathname();
  const { data, isPending } = useSession();
  const user = data?.user as SessionUser | undefined;
  const staffPortal = getStaffPortalPath(user?.role);
  const mounted = useHydrated();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <header className="wc-topnav">
      <div className="wc-topnav-inner">
        {/* Hamburger — visible on mobile, hidden ≥1024px via .wc-navtoggle CSS.
            FE#49: .wc-navtoggle is 40x40 in globals.css (reserved this run) —
            bumped to the 44x44 DESIGN.md floor with an inline style, which
            wins over the class regardless of cascade order. See report for
            the exact globals.css rule to change centrally. */}
        <button
          className="wc-navtoggle"
          aria-label="Open menu"
          onClick={onMenu}
          type="button"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 mr-2">
          {/* alt="" — adjacent wordmark text already labels this link */}
          <Image
            src="/brand/logo-mascot-mark.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9"
            priority
          />
          <span className="font-extrabold tracking-tight">
            Wildcat <span className="text-maroon">Radio</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-5 ml-2" aria-label="Main navigation">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={label}
              href={href}
              className={`wc-navlink${isActive(href) ? " active" : ""}`}
              aria-current={isActive(href) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* CTA area — session-aware */}
        <div className="ml-auto flex items-center gap-2">
          {/* Match SSR on the first client render, then reveal session-aware actions. */}
          {mounted && !isPending && (
            user ? (
              /* Logged-in: elevated roles get a direct staff entry, all users keep Profile. */
              <>
                {staffPortal && (
                  <Link
                    href={staffPortal}
                    className="wc-btn wc-btn-primary wc-btn-sm hidden md:inline-flex"
                    data-testid="staff-console-link"
                  >
                    Staff console
                  </Link>
                )}
                <Link
                  href="/profile"
                  className="wc-avatar h-9 w-9 block flex-none"
                  aria-label={`Your profile${user.handle ? ` (@${user.handle})` : ''}`}
                  style={user.image ? { backgroundImage: `url(${user.image})`, backgroundSize: 'cover' } : undefined}
                />
              </>
            ) : (
              /* Logged-out: Sign in + Listen live.
                 FE#49: .wc-btn-sm is min-height:36px (globals.css, reserved
                 this run) — bumped to 44px with inline style; see report. */
              <>
                <Link
                  href="/login"
                  className="wc-btn wc-btn-outline wc-btn-sm"
                >
                  Sign in
                </Link>
                <Link
                  href="/listen"
                  className="wc-btn wc-btn-primary wc-btn-sm"
                >
                  Listen live
                </Link>
              </>
            )
          )}
        </div>
      </div>
    </header>
  );
}
