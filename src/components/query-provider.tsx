'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { Fragment, useEffect, useState } from 'react';
import { StreamProvider } from '@/lib/stream/stream-context';
import { GlobalPlayer } from '@/components/global-player';
import { useSession } from '@/lib/auth/client';
import { createIdentityQueryClient, retireIdentityQueryClient } from '@/lib/auth/identity-query-client';

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
  const [queryClient] = useState(() => createIdentityQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <StreamProvider>
        <IdentityQueries>{children}</IdentityQueries>
        {/* The audio element and its provider must survive identity changes. */}
        <GlobalPlayer />
      </StreamProvider>
    </QueryClientProvider>
  );
}

function IdentityQueries({ children }: { children: React.ReactNode }) {
  const { data } = useSession();
  // Session id also isolates a later login by the same user. Role changes discard staff data.
  const scope = JSON.stringify([data?.user.id ?? null, data?.session.id ?? null, data?.user.role ?? null]);
  const [state, setState] = useState(() => ({ scope, client: createIdentityQueryClient() }));
  if (state.scope !== scope) {
    // Adjust during render so React retries before committing any old owner's subtree.
    setState({ scope, client: createIdentityQueryClient(state.client) });
  }
  useEffect(() => () => retireIdentityQueryClient(state.client), [state.client]);
  return (
    <QueryClientProvider client={state.client}>
      {/* Reset private forms, selections and receipts as well as query/mutation state. */}
      <Fragment key={state.scope}>{children}</Fragment>
    </QueryClientProvider>
  );
}
