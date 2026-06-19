"use client";

import { useState } from "react";
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
    </>
  );
}
