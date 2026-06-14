"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, Megaphone, Radio, User } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/listen", label: "Listen", Icon: Radio },
  { href: "#", label: "Schedule", Icon: CalendarDays },
  { href: "#", label: "News", Icon: Megaphone },
  { href: "#", label: "Sign in", Icon: User },
] as const;

/** Mobile bottom navigation bar — hidden on md+ screens, sits above the global player. */
export function BottomNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav
      className="wc-bottomnav md:hidden"
      style={{ bottom: "64px" }}
      aria-label="Mobile navigation"
    >
      {NAV_ITEMS.map(({ href, label, Icon }) => (
        <Link
          key={label}
          href={href}
          className={isActive(href) ? "active" : ""}
          aria-current={isActive(href) ? "page" : undefined}
          aria-label={label}
        >
          <Icon className="w-5 h-5" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
