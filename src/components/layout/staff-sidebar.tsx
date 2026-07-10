"use client";

/**
 * Staff sidebar — bespoke `.wc-shell`/`.wc-sidebar` brand surface (AGENTS.md:
 * bespoke brand surfaces stay `wc-*`, don't shadcn-ify). Ported 1:1 from
 * docs/frontend-design-basis-prototype/mod/{roster,attendance}.html.
 *
 * Only the Station group (Roster/Schedule/Attendance) is wired to real routes
 * for FE#5 Task 9; Moderate/Insights/Custodian/Broadcast PC links are the
 * prototype's placeholders (`href="#"`) until their own features land.
 */
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Inbox,
  Users,
  Mic2,
  CalendarDays,
  ClipboardCheck,
  Megaphone,
  BarChart3,
  ScrollText,
  Settings,
  ShieldCheck,
  Gavel,
  Radio,
  Sun,
  Moon,
  ExternalLink,
} from "lucide-react";

export type StaffNavSlug = "roster" | "schedule" | "attendance";

interface StaffSidebarProps {
  /** Which Station-group link is the current page. */
  active: StaffNavSlug;
}

const STATION_ITEMS: { slug: StaffNavSlug; href: string; label: string; Icon: typeof Mic2 }[] = [
  { slug: "roster", href: "/mod/roster", label: "Roster", Icon: Mic2 },
  { slug: "schedule", href: "/mod/schedule", label: "Schedule", Icon: CalendarDays },
  { slug: "attendance", href: "/mod/attendance", label: "Attendance", Icon: ClipboardCheck },
];

const THEME_KEY = "wc-staff-theme";

function StaffThemeToggle() {
  // Staff register is dark-by-default with a persisted light/dark override
  // (design-notes.md). No app-wide ThemeProvider exists yet, so this toggles
  // the `.dark` class Tailwind/globals.css already key off of and persists
  // the choice to localStorage. Lazy-init reads the stored preference during
  // render (client-only guard for SSR) so the effect only ever syncs the DOM
  // class from state, never calls setState itself.
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored ? stored === "dark" : true;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light or dark"
      data-testid="mod-nav-theme-toggle"
      style={{ background: "none", border: "none", cursor: "pointer", width: "100%", font: "inherit" }}
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-sm font-semibold wc-muted hover:bg-[var(--muted)]"
    >
      {isDark ? <Moon className="w-4 h-4" aria-hidden="true" /> : <Sun className="w-4 h-4" aria-hidden="true" />}
      <span>{isDark ? "Dark mode" : "Light mode"}</span>
    </button>
  );
}

export function StaffSidebar({ active }: StaffSidebarProps) {
  return (
    <aside id="staffNav" className="wc-sidebar" aria-label="Staff navigation">
      <Link
        href="/mod/roster"
        className="flex items-center gap-2 px-2 py-1 mb-3"
        style={{ color: "var(--foreground)" }}
      >
        <Image
          src="/brand/logo-mascot-mark.png"
          alt=""
          width={32}
          height={32}
          className="h-8 w-8"
        />
        <span className="font-extrabold">
          Wildcat <span className="text-gold">Staff</span>
        </span>
      </Link>

      <div className="wc-sidebar-group">Moderate</div>
      <a href="#" data-testid="mod-nav-queue">
        <Inbox className="w-4 h-4" aria-hidden="true" />
        Queue
      </a>
      <a href="#" data-testid="mod-nav-users">
        <Users className="w-4 h-4" aria-hidden="true" />
        Users
      </a>

      <div className="wc-sidebar-group">Station</div>
      {STATION_ITEMS.map(({ slug, href, label, Icon }) => (
        <Link
          key={slug}
          href={href}
          className={active === slug ? "active" : undefined}
          aria-current={active === slug ? "page" : undefined}
          data-testid={`mod-nav-${slug}`}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
          {label}
        </Link>
      ))}
      <a href="#" data-testid="mod-nav-announcements">
        <Megaphone className="w-4 h-4" aria-hidden="true" />
        Announcements
      </a>

      <div className="wc-sidebar-group">Insights</div>
      <a href="#" data-testid="mod-nav-analytics">
        <BarChart3 className="w-4 h-4" aria-hidden="true" />
        Analytics
      </a>
      <a href="#" data-testid="mod-nav-logs">
        <ScrollText className="w-4 h-4" aria-hidden="true" />
        Logs
      </a>
      <a href="#" data-testid="mod-nav-settings">
        <Settings className="w-4 h-4" aria-hidden="true" />
        Settings
      </a>

      <div className="wc-sidebar-group">Custodian</div>
      <a href="#" data-testid="mod-nav-staff-review">
        <ShieldCheck className="w-4 h-4" aria-hidden="true" />
        Staff Review
      </a>
      <a href="#" data-testid="mod-nav-escalations">
        <Gavel className="w-4 h-4" aria-hidden="true" />
        Escalations
      </a>

      <div className="wc-sidebar-group">Broadcast PC</div>
      <Link href="/studio" data-testid="mod-nav-studio">
        <Radio className="w-4 h-4" aria-hidden="true" />
        Studio
      </Link>

      <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
        <StaffThemeToggle />
        <Link href="/" data-testid="mod-nav-public-site">
          <ExternalLink className="w-4 h-4" aria-hidden="true" />
          View public site
        </Link>
      </div>
    </aside>
  );
}
