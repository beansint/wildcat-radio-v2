import { QueryClient, type QueryKey } from '@tanstack/react-query';

/** Only explicitly public reads may survive an identity transition. Unknown keys are private. */
function isPublicContent(key: QueryKey): boolean {
  const path = key[0];
  if (typeof path !== 'string') return false;
  return [
    '/api/settings', '/api/schedule', '/api/schedule/today', '/api/charts/current',
    '/api/music-sources/attribution', '/api/stream/manifest', '/api/shows',
    '/api/djs', '/api/announcements',
  ].includes(path);
}

/** A separate cache is the owner scope, including generated URL-only keys and future private reads. */
export function createIdentityQueryClient(previous?: QueryClient): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false },
    },
  });
  for (const query of previous?.getQueryCache().getAll() ?? []) {
    if (isPublicContent(query.queryKey) && query.state.status === 'success') {
      client.setQueryData(query.queryKey, query.state.data, { updatedAt: query.state.dataUpdatedAt });
    }
  }
  return client;
}

export function retireIdentityQueryClient(client: QueryClient): void {
  // cancelQueries aborts generated fetches. Clearing also drops mutation variables/results.
  // Non-cancellable callbacks retain this retired client, never the next owner's client.
  void client.cancelQueries();
  client.clear();
}
