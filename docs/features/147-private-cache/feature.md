# Private account state isolation

Issue #147 repairs the ownership boundary of cached browser data. The previous root QueryClient outlived logout/login and reused private URL-only keys across accounts.

## Acceptance

1. Same-tab and sibling-tab account transitions cannot reuse the previous account's private queries, mutations, forms, selections or downloadable responses.
2. Fresh/stale cache, failed new-account reads and late previous-account responses preserve that boundary.
3. Public content can retain explicitly safe cached values; the public player/audio element remains mounted and playing.
4. Healthy authenticated journeys continue through the existing Better Auth and generated query clients without a new state library.

## Design

Keep the public StreamProvider/player under a persistent client. Own the page QueryClient and keyed page subtree by user/session/role; retire the old client on transition and copy only explicitly public data with its original freshness. Notify sibling tabs through Better Auth's existing channel on successful email sign-in/signup. Abort private export requests when their owning page unmounts.

Server authorization remains authoritative. This change does not roll back already admitted mutations or implement the separately tracked initial standing error UI. Realtime owner/episode completion recovery is paired with #148.

See [qa-plan.md](./qa-plan.md) and [verification evidence](./qa.md).
