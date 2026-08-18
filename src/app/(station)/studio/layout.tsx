"use client";

/**
 * `/studio` layout — FE#46 fix for the portalled-Radix-dark-mode bug.
 *
 * Before this layout existed, `page.tsx` hardcoded `className="dark"` on
 * three separate `<main>` elements (one per early-return branch). That put
 * the `.dark` scope on a subtree, not on `<html>` — so any Radix primitive
 * that portals to `document.body` (Dialog, Sheet, Select, tooltips) rendered
 * OUTSIDE that subtree and came out light. `/studio` uses `SubTimeInDialog`
 * (Radix Dialog via `src/components/ui/dialog.tsx`, `DialogPortal` with no
 * `container` override => portals to `document.body` by default), so this
 * was a real, reachable bug, not a theoretical one — confirmed by reading
 * `dialog.tsx`'s `DialogPortal`/`DialogPrimitive.Portal` and tracing
 * `AttendancePanel` -> `SubTimeInDialog` -> `Dialog`.
 *
 * Fix: stamp `.dark` on `document.documentElement` instead, the same
 * mechanism `/mod` and `/admin` already use (`StaffThemeScript` runs
 * synchronously pre-hydration; `StaffThemeToggle` — now exported from
 * `staff-sidebar.tsx` — keeps `<html>` in sync after mount and strips
 * `.dark` again on unmount so it can't leak onto the public site). Both are
 * reused *unmodified*: same `wc-staff-theme:v1` key, same
 * `data-testid="mod-nav-theme-toggle"`. See `StaffThemeToggle`'s own doc
 * comment for why `/studio` shares that key rather than forking a
 * `wc-studio-theme:v1` one.
 *
 * `body.wc-staff` (globals.css: `background: var(--canvas)`, plus the
 * light-mode gold->maroon text remap) is added here too — `/studio` is a
 * staff/booth surface exactly like `/mod`/`/admin` and should get the same
 * canvas tint, not the public page's plain background. `body.wc-studio-page`
 * (which only hides the global player) is unrelated and stays in `page.tsx`,
 * which already owns it.
 */
import { useEffect } from "react";
import { StaffThemeScript } from "@/components/layout/staff-sidebar";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.add("wc-staff");
    return () => document.body.classList.remove("wc-staff");
  }, []);

  return (
    <>
      <StaffThemeScript />
      {children}
    </>
  );
}
