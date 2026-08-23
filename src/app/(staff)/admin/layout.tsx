"use client";

/**
 * `/admin` layout — CUSTODIAN-only staff shell in the `(staff)` route group.
 *
 * Sibling of `(staff)/mod/layout.tsx`, same guard shape but a narrower role
 * set: only CUSTODIAN (not MODERATOR) can see `/admin/*` — escalations are
 * the custodian-only review step above the moderator queue. Renders the
 * SAME `wc-shell` + `StaffSidebar` as `/mod` so `/admin/escalations` looks
 * identical to the mod pages, with the sidebar's "Escalations" item active.
 *
 * - isPending          → skeleton chrome (no layout shift)
 * - !data               → redirect to /login?next=<pathname>
 * - role !== CUSTODIAN  → moderators return to /mod/roster; listeners go to /
 *
 * NOTE: This is a UX gate only — real protection is the Nest RolesGuard on
 * every admin endpoint (SessionGuard first, per the plan's RBAC constraint).
 */
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession, type SessionUser } from "@/lib/auth/client";
import { StaffSidebar, StaffThemeScript } from "@/components/layout/staff-sidebar";
import { getStaffPortalPath, isCustodianRole } from "@/lib/auth/staff-routing";

function activeSlugFromPathname(pathname: string): "escalations" | "staff-review" {
  // Two routes live under `/admin` today; extend this switch as more
  // custodian-only pages land here.
  return pathname.startsWith("/admin/staff") ? "staff-review" : "escalations";
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const user = data?.user as SessionUser | undefined;

  // Hide the persistent global player on staff pages (parity with /mod).
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
    if (!isCustodianRole(user?.role)) {
      router.replace(getStaffPortalPath(user?.role) ?? "/");
    }
  }, [isPending, data, user?.role, pathname, router]);

  const isAuthorized = !isPending && !!data && isCustodianRole(user?.role);

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
