"use client";

import { useState } from "react";
import { Footer } from "@/components/layout/footer";
import { TopNav } from "./top-nav";
import { MobileDrawer } from "./mobile-drawer";

interface PublicShellProps {
  children: React.ReactNode;
}

export function PublicShell({ children }: PublicShellProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* FE#49 — skip-to-content: first Tab stop, visually hidden until
          focused. Targets the #main-content wrapper below. Tailwind's
          built-in sr-only/focus:not-sr-only pair (no globals.css change
          needed — that file is reserved to another agent this run). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to content
      </a>
      <TopNav onMenu={() => setOpen(true)} />
      <MobileDrawer open={open} onClose={() => setOpen(false)} />
      <div id="main-content" tabIndex={-1} className="flex flex-1 flex-col">
        {children}
      </div>
      {/* Hoisted from the landing page: the footer carries the privacy, terms
          and music-credit links, and those have to be reachable from every
          public surface rather than only from the home page.
          #main-content grows (flex-1) so the footer sits at the viewport
          bottom on short pages instead of floating mid-screen. */}
      <Footer />
    </>
  );
}
