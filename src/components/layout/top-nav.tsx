"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/listen", label: "Listen" },
  { href: "#", label: "Schedule" },
  { href: "#", label: "Shows" },
  { href: "#", label: "Charts" },
  { href: "#", label: "News" },
] as const;

export function TopNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <header className="wc-topnav">
      <div className="wc-topnav-inner">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 mr-2">
          <Image
            src="/brand/logo-mascot-mark.png"
            alt="Wildcat Radio"
            width={36}
            height={36}
            className="h-9 w-9"
            priority
          />
          <span className="font-extrabold tracking-tight hidden sm:block">
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

        {/* CTA buttons */}
        <div className="ml-auto flex items-center gap-2">
          <Link href="#" className="wc-btn wc-btn-outline wc-btn-sm">
            Sign in
          </Link>
          <Link href="/listen" className="wc-btn wc-btn-primary wc-btn-sm">
            Listen live
          </Link>
        </div>
      </div>
    </header>
  );
}
