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
      <TopNav onMenu={() => setOpen(true)} />
      <MobileDrawer open={open} onClose={() => setOpen(false)} />
      {children}
      {/* Hoisted from the landing page: the footer carries the privacy, terms
          and music-credit links, and those have to be reachable from every
          public surface rather than only from the home page. */}
      <Footer />
    </>
  );
}
