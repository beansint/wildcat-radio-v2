'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { StreamProvider } from '@/lib/stream/stream-context';

/**
 * FE#48 — `new QueryClient()` shipped with no `defaultOptions`, so every query
 * in the app inherited `staleTime: 0` (refetch on every mount) and
 * `refetchOnWindowFocus: true` (refetch every time the tab regains focus).
 * Fifteen call sites had already hand-rolled `retry: false` and two had
 * hand-rolled `refetchOnWindowFocus: false` rather than fixing the default —
 * which is the tell that the default was wrong, not the call sites.
 *
 * `retry: false` is the right default for this app specifically: the API
 * returns meaningful 4xx codes that the pages branch on (`classifyQueryError`
 * distinguishes not-found / rate-limited / other), and retrying a 404 three
 * times just delays the branded empty state by a couple of seconds. Individual
 * queries that genuinely want retries can still opt in.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Public content changes on a human timescale; a 30s window kills
            // the duplicate fetch on every remount without going stale.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <StreamProvider>{children}</StreamProvider>
    </QueryClientProvider>
  );
}
