"use client";

/**
 * (app) route-group layout — client-side auth guard.
 *
 * - isPending → render skeleton chrome + spinner (no layout shift)
 * - !data     → redirect to /login?next=<current pathname> (useRouter.replace)
 * - data      → render TopNav + MobileDrawer + BottomNav + children
 *
 * NOTE: This is a UX gate only — real data protection is the Nest session guard
 * on the backend. Middleware cannot read our cross-origin httpOnly cookie so the
 * guard must be client-side.
 */
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from '@/lib/auth/client';
import { TopNav } from '@/components/layout/top-nav';
import { MobileDrawer } from '@/components/layout/mobile-drawer';
import { BottomNav } from '@/components/layout/bottom-nav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession();
  const router    = useRouter();
  const pathname  = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isPending && !data) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isPending, data, pathname, router]);

  /* Skeleton while session loads or while redirect is in flight */
  if (isPending || !data) {
    return (
      <div className="min-h-dvh flex flex-col">
        {/* Chrome skeleton to avoid layout shift */}
        <div className="wc-topnav" aria-hidden="true">
          <div className="wc-topnav-inner">
            <div className="h-9 w-9 rounded-full bg-muted animate-pulse" />
            <div className="h-5 w-32 rounded-full bg-muted animate-pulse ml-2" />
          </div>
        </div>
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="wc-avatar h-10 w-10 animate-pulse" aria-hidden="true" />
            <div className="h-3 w-24 rounded-full bg-muted animate-pulse" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <>
      <TopNav onMenu={() => setOpen(true)} />
      <MobileDrawer open={open} onClose={() => setOpen(false)} />
      {children}
      <BottomNav />
    </>
  );
}
