"use client";

/**
 * Staff sidebar — bespoke `.wc-shell`/`.wc-sidebar` brand surface (AGENTS.md:
 * bespoke brand surfaces stay `wc-*`, don't shadcn-ify). Ported 1:1 from
 * docs/frontend-design-basis-prototype/mod/{roster,attendance}.html.
 *
 * Station group (Roster/Schedule/Attendance) wired for FE#5 Task 9; Moderate
 * (Queue/Users), Insights→Logs, and Custodian→Escalations are wired for the
 * moderation UI (FE#8); Announcements and Settings for the content UI (FE#9).
 * Analytics is wired for the curation dashboard (FE#10); Custodian→Staff
 * Review is wired for /admin/staff (BEA-184).
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
  | "staff-review"
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
  /** Current authenticated role, used to hide custodian-only destinations. */
  role?: string | null;
}

const STATION_ITEMS: { slug: StaffNavSlug; href: string; label: string; Icon: typeof Mic2 }[] = [
  { slug: "roster", href: "/mod/roster", label: "Roster", Icon: Mic2 },
  { slug: "schedule", href: "/mod/schedule", label: "Schedule", Icon: CalendarDays },
  { slug: "attendance", href: "/mod/attendance", label: "Attendance", Icon: ClipboardCheck },
];

/** Versioned key (FE#39): the pre-hydration script and the toggle both read/
 *  write this one. Bumped from the unversioned `wc-staff-theme` so a future
 *  format change can be migrated cleanly; the old key is still read as a
 *  one-time fallback (see `readStoredTheme` / `StaffThemeScript`) so existing
 *  localStorage state — including the 6 e2e specs that poke the legacy key
 *  directly — keeps working. */
const THEME_KEY = "wc-staff-theme:v1";
const LEGACY_THEME_KEY = "wc-staff-theme";

function readStoredTheme(): boolean {
  if (typeof window === "undefined") return true;
  const versioned = window.localStorage.getItem(THEME_KEY);
  if (versioned) return versioned === "dark";
  const legacy = window.localStorage.getItem(LEGACY_THEME_KEY);
  if (legacy) return legacy === "dark";
  return true;
}

/**
 * Synchronous, pre-hydration theme stamp (FE#39). A post-paint `useEffect`
 * (the old approach) always paints light first, then flips — this runs as a
 * blocking inline script before first paint instead, mirroring the same
 * versioned-key-with-legacy-fallback read `readStoredTheme` does on the
 * client. Render this once per staff layout (mod + admin), before the
 * sidebar/shell markup, in every branch (including the auth-loading
 * skeleton) so there is no window where it's skipped.
 */
export function StaffThemeScript() {
  const code =
    `(function(){try{` +
    `var v=localStorage.getItem(${JSON.stringify(THEME_KEY)});` +
    `if(!v){v=localStorage.getItem(${JSON.stringify(LEGACY_THEME_KEY)});}` +
    `var dark=v?v==="dark":true;` +
    `if(dark){document.documentElement.classList.add("dark");}` +
    `}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

/**
 * Exported (FE#46) so `/studio` can mount the same dark/light toggle in its
 * kiosk top bar. Deliberately reused *unmodified* — same `THEME_KEY`
 * (`wc-staff-theme:v1`) and same `data-testid="mod-nav-theme-toggle"` — so
 * `/studio` shares one staff-wide theme preference with `/mod`/`/admin`
 * rather than forking a `wc-studio-theme:v1` key. See the `/studio` layout
 * for the full reasoning; short version: `/studio` is a staff-only surface
 * a moderator already reaches from `/mod` (StaffSidebar's "Broadcast PC"
 * link) in the same browser session, so inheriting their existing dark/
 * light choice is the more correct default than fragmenting it — and reuse
 * keeps this change from touching the key/testid the 6 pinned e2e specs
 * bind to.
 */
export function StaffThemeToggle() {
  // Staff register is dark-by-default with a persisted light/dark override
  // (design-notes.md). No app-wide ThemeProvider exists yet, so this toggles
  // the `.dark` class Tailwind/globals.css already key off of and persists
  // the choice to localStorage. Lazy-init reads the stored preference during
  // render (client-only guard for SSR) so the effect only ever syncs the DOM
  // class from state, never calls setState itself.
  const [isDark, setIsDark] = useState<boolean>(readStoredTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // The public site has no dark mode at all (globals.css only defines a
  // `.dark` override, no prefers-color-scheme hook, and nothing outside
  // this component ever touches `<html>`'s class list) — so `.dark` is
  // purely a staff-register concern. Strip it when this toggle unmounts
  // (i.e. leaving `/mod` entirely, since `ModLayout` keeps the sidebar
  // mounted across staff subpages) so the class never leaks onto public
  // pages after "View public site". The `wc-staff-theme:v1` preference stays
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

export function StaffSidebar({ active, queueCount, role }: StaffSidebarProps) {
  const isCustodian = role === "CUSTODIAN";
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

      {isCustodian && (
        <>
          <div className="wc-sidebar-group">Custodian</div>
          <Link
            href="/admin/staff"
            className={active === "staff-review" ? "active" : undefined}
            aria-current={active === "staff-review" ? "page" : undefined}
            data-testid="mod-nav-staff-review"
          >
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            Staff Review
          </Link>
          <Link
            href="/admin/escalations"
            className={active === "escalations" ? "active" : undefined}
            aria-current={active === "escalations" ? "page" : undefined}
            data-testid="mod-nav-escalations"
          >
            <Gavel className="w-4 h-4" aria-hidden="true" />
            Escalations
          </Link>
        </>
      )}

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
