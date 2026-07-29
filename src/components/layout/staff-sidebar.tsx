"use client";

/**
 * Staff sidebar — bespoke `.wc-shell`/`.wc-sidebar` brand surface (AGENTS.md:
 * bespoke brand surfaces stay `wc-*`, don't shadcn-ify). Ported 1:1 from
 * docs/frontend-design-basis-prototype/mod/{roster,attendance}.html.
 *
 * Station group (Roster/Schedule/Attendance) wired for FE#5 Task 9; Moderate
 * (Queue/Users), Insights→Logs, and Custodian→Escalations are wired for the
 * moderation UI (FE#8); Announcements and Settings for the content UI (FE#9).
 * Analytics is wired for the curation dashboard (FE#10); Staff Review remains
 * the prototype's placeholder (`href="#"`) until its own feature lands.
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

export type StaffNavSlug =
  | "roster"
  | "schedule"
  | "attendance"
  | "queue"
  | "users"
  | "analytics"
  | "logs"
  | "escalations"
  | "announcements"
  | "settings";

interface StaffSidebarProps {
  /** Which nav link is the current page. */
  active: StaffNavSlug;
  /**
   * Live pending-item count for the Queue nav badge (`wc-chip`). Undefined
   * or 0 renders no badge — the /mod/queue page supplies the real count via
   * `useModerationControllerGetQueue`; other pages just omit this prop.
   */
  queueCount?: number;
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

  // The public site has no dark mode at all (globals.css only defines a
  // `.dark` override, no prefers-color-scheme hook, and nothing outside
  // this component ever touches `<html>`'s class list) — so `.dark` is
  // purely a staff-register concern. Strip it when this toggle unmounts
  // (i.e. leaving `/mod` entirely, since `ModLayout` keeps the sidebar
  // mounted across staff subpages) so the class never leaks onto public
  // pages after "View public site". The `wc-staff-theme` preference stays
  // in localStorage so the next `/mod` visit reopens with it.
  useEffect(() => {
    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, []);

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

export function StaffSidebar({ active, queueCount }: StaffSidebarProps) {
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
      <Link
        href="/mod/queue"
        className={active === "queue" ? "active" : undefined}
        aria-current={active === "queue" ? "page" : undefined}
        data-testid="mod-nav-queue"
      >
        <Inbox className="w-4 h-4" aria-hidden="true" />
        Queue
        {!!queueCount && (
          <span className="wc-chip ml-auto tnum" data-testid="mod-nav-queue-count">
            {queueCount}
          </span>
        )}
      </Link>
      <Link
        href="/mod/users"
        className={active === "users" ? "active" : undefined}
        aria-current={active === "users" ? "page" : undefined}
        data-testid="mod-nav-users"
      >
        <Users className="w-4 h-4" aria-hidden="true" />
        Users
      </Link>

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
      <Link
        href="/mod/announcements"
        className={active === "announcements" ? "active" : undefined}
        aria-current={active === "announcements" ? "page" : undefined}
        data-testid="mod-nav-announcements"
      >
        <Megaphone className="w-4 h-4" aria-hidden="true" />
        Announcements
      </Link>

      <div className="wc-sidebar-group">Insights</div>
      <Link
        href="/mod/analytics"
        className={active === "analytics" ? "active" : undefined}
        data-testid="mod-nav-analytics"
      >
        <BarChart3 className="w-4 h-4" aria-hidden="true" />
        Analytics
      </Link>
      <Link
        href="/mod/logs"
        className={active === "logs" ? "active" : undefined}
        aria-current={active === "logs" ? "page" : undefined}
        data-testid="mod-nav-logs"
      >
        <ScrollText className="w-4 h-4" aria-hidden="true" />
        Logs
      </Link>
      <Link
        href="/mod/settings"
        className={active === "settings" ? "active" : undefined}
        aria-current={active === "settings" ? "page" : undefined}
        data-testid="mod-nav-settings"
      >
        <Settings className="w-4 h-4" aria-hidden="true" />
        Settings
      </Link>

      <div className="wc-sidebar-group">Custodian</div>
      <a href="#" data-testid="mod-nav-staff-review">
        <ShieldCheck className="w-4 h-4" aria-hidden="true" />
        Staff Review
      </a>
      <Link
        href="/admin/escalations"
        className={active === "escalations" ? "active" : undefined}
        aria-current={active === "escalations" ? "page" : undefined}
        data-testid="mod-nav-escalations"
      >
        <Gavel className="w-4 h-4" aria-hidden="true" />
        Escalations
      </Link>

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
