import { describe, expect, it } from 'vitest';
import { createIdentityQueryClient, retireIdentityQueryClient } from './identity-query-client';

describe('identity cache isolation', () => {
  for (const age of [0, 31_000]) it(`does not hand ${age ? 'stale' : 'fresh'} private data to the next owner`, async () => {
    const alice = createIdentityQueryClient();
    const privateKeys = [
      ['/api/users/me'], ['/api/users/me/standing'], ['/api/consent'],
      ['/api/settings/admin'], ['/api/announcements/admin'], ['/api/shows/admin'],
      ['staff-episodes', {}], ['my-submissions', 'episode', 'alice'], ['unknown-future-private-key'],
    ];
    for (const key of privateKeys) alice.setQueryData(key, { private: 'alice' }, { updatedAt: Date.now() - age });
    alice.getMutationCache().build(alice, { mutationKey: ['private-mutation'] }, { data: 'Alice receipt', error: null, failureCount: 0, failureReason: null, isPaused: false, status: 'success', submittedAt: 1, variables: 'Alice private form', context: undefined });
    const bob = createIdentityQueryClient(alice);
    for (const key of privateKeys) expect(bob.getQueryData(key)).toBeUndefined();
    expect(bob.getMutationCache().getAll()).toHaveLength(0);
    let requests = 0;
    expect(await bob.fetchQuery({ queryKey: ['/api/users/me'], queryFn: async () => { requests++; return 'bob'; } })).toBe('bob');
    expect(requests).toBe(1);
    await expect(bob.fetchQuery({ queryKey: ['/api/users/me/standing'], queryFn: async () => { throw new Error('Bob unavailable'); } })).rejects.toThrow('Bob unavailable');
    expect(bob.getQueryData(['/api/users/me/standing'])).toBeUndefined();
    retireIdentityQueryClient(alice);
    expect(alice.getQueryCache().getAll()).toHaveLength(0);
    expect(alice.getMutationCache().getAll()).toHaveLength(0);
    retireIdentityQueryClient(bob);
  });

  it('retains only known public content, including its freshness timestamp', () => {
    const alice = createIdentityQueryClient();
    const updatedAt = Date.now() - 1234;
    for (const key of [['/api/settings'], ['/api/announcements', { page: 2 }], ['/api/shows'], ['/api/schedule/today']]) {
      alice.setQueryData(key, 'Public content', { updatedAt });
    }
    const bob = createIdentityQueryClient(alice);
    expect(bob.getQueryCache().getAll()).toHaveLength(4);
    for (const query of bob.getQueryCache().getAll()) {
      expect(query.state.data).toBe('Public content');
      expect(query.state.dataUpdatedAt).toBe(updatedAt);
    }
    retireIdentityQueryClient(alice);
    retireIdentityQueryClient(bob);
  });

  it('cancels old reads and quarantines delayed reads and mutation callbacks in the retired client', async () => {
    const alice = createIdentityQueryClient();
    let release!: (value: string) => void;
    let signal!: AbortSignal;
    const pending = alice.fetchQuery({ queryKey: ['/api/users/me'], queryFn: context => {
      signal = context.signal;
      return new Promise<string>(resolve => { release = resolve; });
    } }).catch(() => undefined);
    const bob = createIdentityQueryClient(alice);
    retireIdentityQueryClient(alice);
    expect(signal.aborted).toBe(true);
    release('Alice delayed private data');
    await pending;
    // A mutation callback already holding its old client must never write B's cache.
    alice.setQueryData(['/api/users/me'], 'Alice delayed callback');
    expect(bob.getQueryData(['/api/users/me'])).toBeUndefined();
    expect(alice.getMutationCache().getAll()).toHaveLength(0);
    retireIdentityQueryClient(alice);
    retireIdentityQueryClient(bob);
  });
});
