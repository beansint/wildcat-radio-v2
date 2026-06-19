"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  Home,
  Radio,
  CalendarDays,
  Disc3,
  Mic2,
  BarChart3,
  Megaphone,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/listen", label: "Listen", Icon: Radio },
  { href: "#", label: "Schedule", Icon: CalendarDays },
  { href: "#", label: "Shows", Icon: Disc3 },
  { href: "#", label: "DJs", Icon: Mic2 },
  { href: "#", label: "Charts", Icon: BarChart3 },
  { href: "#", label: "News", Icon: Megaphone },
] as const;

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        className={`wc-overlay${open ? " open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={`wc-sidenav${open ? " open" : ""}`}
        aria-label="Site navigation"
        role="navigation"
      >
        {/* Brand */}
        <Link href="/" className="sn-brand" onClick={onClose}>
          <Image
            src="/brand/logo-mascot-mark.png"
            alt="Wildcat Radio"
            width={36}
            height={36}
            className="h-9 w-9"
          />
          <span>
            Wildcat <span className="text-maroon">Radio</span>
          </span>
        </Link>

        {/* Nav list */}
        <nav className="sn-list">
          {NAV_ITEMS.map(({ href, label, Icon }) => (
            <Link
              key={label}
              href={href}
              className={`sn-item${isActive(href) ? " active" : ""}`}
              aria-current={isActive(href) ? "page" : undefined}
              onClick={onClose}
            >
              <Icon aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Footer CTAs */}
        <div className="sn-foot">
          <Link
            href="#"
            className="wc-btn wc-btn-outline wc-btn-sm"
            onClick={onClose}
          >
            Sign in
          </Link>
          <Link
            href="/listen"
            className="wc-btn wc-btn-primary wc-btn-sm"
            onClick={onClose}
          >
            <Radio className="w-4 h-4" aria-hidden="true" />
            Listen live
          </Link>
        </div>
      </aside>
    </>
  );
}
