"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Home,
  Radio,
  CalendarDays,
  Disc3,
  Mic2,
  BarChart3,
  Megaphone,
  User,
  LogOut,
} from "lucide-react";
import { useSession, signOut, type SessionUser } from "@/lib/auth/client";
import { getStaffPortalPath } from "@/lib/auth/staff-routing";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/listen", label: "Listen", Icon: Radio },
  { href: "/schedule", label: "Schedule", Icon: CalendarDays },
  { href: "/shows", label: "Shows", Icon: Disc3 },
  { href: "/djs", label: "DJs", Icon: Mic2 },
  { href: "/charts", label: "Charts", Icon: BarChart3 },
  { href: "/announcements", label: "News", Icon: Megaphone },
] as const;

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const { data, isPending } = useSession();
  const user = data?.user as SessionUser | undefined;
  const staffPortal = getStaffPortalPath(user?.role);

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

  async function handleSignOut() {
    onClose();
    await signOut();
    router.replace("/");
  }

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
      >
        {/* Brand */}
        <Link href="/" className="sn-brand" onClick={onClose}>
          {/* alt="" — adjacent wordmark text already labels this link */}
          <Image
            src="/brand/logo-mascot-mark.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8"
          />
          <span>
            Wildcat <span className="text-maroon">Radio</span>
          </span>
        </Link>

        {/* Nav list.
            FE#49: .sn-item is 43px tall (globals.css padding .62rem .7rem,
            reserved this run) — bumped to the 44px floor with inline style;
            see report for the exact rule to change centrally. */}
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

        {/* Footer — session-aware */}
        <div className="sn-foot">
          {!isPending && (
            user ? (
              /* Logged-in: profile link + sign out.
                 FE#49: bumped below-44px touch targets with inline style —
                 see report for the globals.css / Button size="sm" rules. */
              <>
                {staffPortal && (
                  <Button asChild size="sm" data-testid="staff-console-link-mobile">
                    <Link href={staffPortal} onClick={onClose}>
                      Staff console
                    </Link>
                  </Button>
                )}
                <Link
                  href="/profile"
                  className="sn-item"
                  onClick={onClose}
                >
                  <User aria-hidden="true" />
                  Your profile
                </Link>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  Sign out
                </Button>
              </>
            ) : (
              /* Logged-out: Sign in + Listen live */
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href="/login" onClick={onClose}>Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/listen" onClick={onClose}>
                    <Radio className="w-4 h-4" aria-hidden="true" />
                    Listen live
                  </Link>
                </Button>
              </>
            )
          )}
        </div>
      </aside>
    </>
  );
}
