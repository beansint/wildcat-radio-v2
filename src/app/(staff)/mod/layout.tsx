"use client";

/**
 * `/mod` layout — role-gated staff shell in the `(staff)` route group.
 *
 * Deliberately NOT under `(app)`: staff pages use the black+gold sidebar shell,
 * not the public top-nav/player chrome (prototype parity). This layout runs its
 * own session guard via `useSession` and hides the global player like `/studio`.
 *
 * - isPending          → skeleton chrome (no layout shift)
 * - !data               → redirect to /login?next=<pathname>
 * - role not staff      → redirect to / (logged-in listeners can't see /mod)
 * - MODERATOR/CUSTODIAN → <div class="wc-shell"><StaffSidebar/><div class="wc-main">{children}</div></div>
 *
 * NOTE: This is a UX gate only — real protection is the Nest RolesGuard on
 * every mod endpoint (SessionGuard first, per the plan's RBAC constraint).
 */
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession, type SessionUser } from "@/lib/auth/client";
import { StaffSidebar, StaffThemeScript, type StaffNavSlug } from "@/components/layout/staff-sidebar";
import { isStaffRole } from "@/lib/auth/staff-routing";

function activeSlugFromPathname(pathname: string): StaffNavSlug {
  if (pathname.startsWith("/mod/schedule")) return "schedule";
  if (pathname.startsWith("/mod/attendance")) return "attendance";
  if (pathname.startsWith("/mod/queue")) return "queue";
  if (pathname.startsWith("/mod/users")) return "users";
  if (pathname.startsWith("/mod/analytics")) return "analytics";
  if (pathname.startsWith("/mod/logs")) return "logs";
  if (pathname.startsWith("/mod/announcements")) return "announcements";
  if (pathname.startsWith("/mod/settings")) return "settings";
  return "roster";
}

export default function ModLayout({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const user = data?.user as SessionUser | undefined;

  // Hide the persistent global player on staff pages (parity with the
  // prototype + the /studio booth). CSS: `body.wc-staff-page .wc-player`.
  // `wc-staff` wires up the prototype's staff canvas tint + the
  // light-mode gold→maroon text remap (globals.css `body.wc-staff`,
  // `html:not(.dark) body.wc-staff .text-gold`).
  useEffect(() => {
    document.body.classList.add("wc-staff-page", "wc-staff");
    return () => document.body.classList.remove("wc-staff-page", "wc-staff");
  }, []);

  useEffect(() => {
    if (isPending) return;
    if (!data) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!isStaffRole(user?.role)) {
      router.replace("/");
    }
  }, [isPending, data, user?.role, pathname, router]);

  const isAuthorized = !isPending && !!data && isStaffRole(user?.role);

  if (!isAuthorized) {
    return (
      <>
        <StaffThemeScript />
        <div className="wc-shell" aria-hidden="true">
        <div
          className="wc-sidebar"
          style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}
        >
          <div className="h-8 w-32 rounded-full bg-muted animate-pulse" />
          <div className="h-6 w-full rounded-lg bg-muted animate-pulse mt-4" />
          <div className="h-6 w-full rounded-lg bg-muted animate-pulse" />
          <div className="h-6 w-full rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="wc-main flex items-center justify-center min-h-dvh">
          <div className="wc-avatar h-10 w-10 animate-pulse" />
        </div>
        </div>
      </>
    );
  }

  return (
    <>
      <StaffThemeScript />
      <div className="wc-shell">
        <StaffSidebar active={activeSlugFromPathname(pathname)} role={user?.role} />
        <div className="wc-main">{children}</div>
      </div>
    </>
  );
}
