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
 * - role !== CUSTODIAN  → redirect to / (moderators can't see /admin)
 *
 * NOTE: This is a UX gate only — real protection is the Nest RolesGuard on
 * every admin endpoint (SessionGuard first, per the plan's RBAC constraint).
 */
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession, type SessionUser } from "@/lib/auth/client";
import { StaffSidebar } from "@/components/layout/staff-sidebar";

const CUSTODIAN_ROLES = new Set(["CUSTODIAN"]);

function activeSlugFromPathname(pathname: string): "escalations" {
  // Only one route lives under `/admin` today; extend this switch as more
  // custodian-only pages land here.
  void pathname;
  return "escalations";
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const user = data?.user as SessionUser | undefined;

  // Hide the persistent global player on staff pages (parity with /mod).
  useEffect(() => {
    document.body.classList.add("wc-staff-page");
    return () => document.body.classList.remove("wc-staff-page");
  }, []);

  useEffect(() => {
    if (isPending) return;
    if (!data) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!user?.role || !CUSTODIAN_ROLES.has(user.role)) {
      router.replace("/");
    }
  }, [isPending, data, user?.role, pathname, router]);

  const isAuthorized = !isPending && !!data && !!user?.role && CUSTODIAN_ROLES.has(user.role);

  if (!isAuthorized) {
    return (
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
    );
  }

  return (
    <div className="wc-shell">
      <StaffSidebar active={activeSlugFromPathname(pathname)} />
      <div className="wc-main">{children}</div>
    </div>
  );
}
