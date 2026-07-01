import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * Returns `false` during SSR and the first client paint, then `true` once the
 * component has hydrated. Use this to defer rendering auth/session-derived
 * markup (which the server can't see behind the httpOnly cross-origin cookie)
 * until after hydration, keeping the SSR and first client render identical and
 * avoiding hydration mismatches — without a `setState`-in-effect.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
