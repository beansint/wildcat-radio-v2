"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth/client";
import { synchronizeSocketIdentity } from "./socket";

/** The player outlives identity-scoped pages and owns handshake freshness. */
export function useSocketIdentity() {
  const {data: session, isPending} = useSession();
  const identity = JSON.stringify(session ? [session.session.id, session.user.id,
    session.user.emailVerified, session.user.class, session.user.role] : null);
  useEffect(() => {
    if (isPending) return;
    synchronizeSocketIdentity(identity);
  }, [identity, isPending]);
}
