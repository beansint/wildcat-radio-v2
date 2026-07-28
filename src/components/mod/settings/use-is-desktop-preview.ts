"use client";

/**
 * Whether the desktop sticky preview column should render at all (as
 * opposed to just being CSS-hidden) — SET-I-06 asserts
 * `mod-settings-preview` has **zero** DOM matches on a 375px viewport, so
 * `hidden lg:block` alone isn't enough; the node must not be mounted.
 * Mirrors Tailwind's default `lg` breakpoint (1024px).
 */
import { useEffect, useState } from "react";

const DESKTOP_QUERY = "(min-width: 1024px)";

export function useIsDesktopPreview(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(DESKTOP_QUERY).matches : true,
  );

  useEffect(() => {
    // The `useState` initializer above already reads the current match on
    // mount — this effect only subscribes to future changes.
    const mql = window.matchMedia(DESKTOP_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isDesktop;
}
