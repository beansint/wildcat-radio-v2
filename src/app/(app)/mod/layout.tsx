"use client";

/**
 * `/mod` layout — role-gated staff shell, layered on top of the `(app)`
 * client-side session guard (src/app/(app)/layout.tsx).
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
import { StaffSidebar } from "@/components/layout/staff-sidebar";

const STAFF_ROLES = new Set(["MODERATOR", "CUSTODIAN"]);

function activeSlugFromPathname(pathname: string): "roster" | "schedule" | "attendance" {
  if (pathname.startsWith("/mod/schedule")) return "schedule";
  if (pathname.startsWith("/mod/attendance")) return "attendance";
  return "roster";
}

export default function ModLayout({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const user = data?.user as SessionUser | undefined;

  useEffect(() => {
    if (isPending) return;
    if (!data) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!user?.role || !STAFF_ROLES.has(user.role)) {
      router.replace("/");
    }
  }, [isPending, data, user?.role, pathname, router]);

  const isAuthorized = !isPending && !!data && !!user?.role && STAFF_ROLES.has(user.role);

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
