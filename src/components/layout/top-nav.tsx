"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useSession, type SessionUser } from "@/lib/auth/client";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/listen", label: "Listen" },
  { href: "#", label: "Schedule" },
  { href: "#", label: "Shows" },
  { href: "#", label: "Charts" },
  { href: "#", label: "News" },
] as const;

interface TopNavProps {
  onMenu?: () => void;
}

export function TopNav({ onMenu }: TopNavProps) {
  const pathname = usePathname();
  const { data, isPending } = useSession();
  const user = data?.user as SessionUser | undefined;

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <header className="wc-topnav">
      <div className="wc-topnav-inner">
        {/* Hamburger — visible on mobile, hidden ≥1024px via .wc-navtoggle CSS */}
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
          {/* Never show any UI while session is pending (avoids layout shift / flash) */}
          {!isPending && (
            user ? (
              /* Logged-in: avatar → /profile */
              <Link
                href="/profile"
                className="wc-avatar h-9 w-9 block flex-none"
                aria-label={`Your profile${user.handle ? ` (@${user.handle})` : ''}`}
                style={user.image ? { backgroundImage: `url(${user.image})`, backgroundSize: 'cover' } : undefined}
              />
            ) : (
              /* Logged-out: Sign in + Listen live */
              <>
                <Link href="/login" className="wc-btn wc-btn-outline wc-btn-sm">
                  Sign in
                </Link>
                <Link href="/listen" className="wc-btn wc-btn-primary wc-btn-sm">
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
