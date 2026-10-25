"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth/client";
import { synchronizeSocketIdentity } from "./socket";

/** The player outlives identity-scoped pages and owns handshake freshness. */
export function useSocketIdentity() {
  useEffect(() => {
    // Subscribe after hydration: reading the session atom during root render
    // can finish authentication before sibling shells hydrate.
    return authClient.$store.atoms.session.subscribe(({data, isPending}) => {
      if (isPending) return;
      synchronizeSocketIdentity(JSON.stringify(data ? [data.session.id, data.user.id,
        data.user.emailVerified, data.user.class, data.user.role] : null));
    });
  }, []);
}
