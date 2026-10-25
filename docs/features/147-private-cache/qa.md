# Private account state isolation (#147)

The persistent root client previously used URL-only private query keys for every account. Alice's fresh profile/consent could be returned without a Bob request; stale standing remained visible after Bob's read failed. Local form state also survived a cross-tab session update.

The page QueryClient now belongs to one user/session/role scope. Changing that scope synchronously replaces the page client and remounts the page subtree before committing it. The retired client is canceled and cleared, including mutation variables/results. Late callbacks retain only that retired client. Unknown keys are private by default; only explicitly listed public content caches transfer, retaining their timestamps. Generated endpoints remain unchanged.

The public StreamProvider and GlobalPlayer use a persistent outer client, so identity changes preserve the actual audio element and playback. Better Auth's existing session channel handles logout; a successful email sign-in/sign-up additionally broadcasts on that same channel because the installed client does not do so. Privacy and staff analytics downloads cancel on page/identity unmount and check the signal before creating a downloadable blob.

## Local verification

Install with `pnpm install --frozen-lockfile`. No backend/database or production cookies are needed. In a dedicated terminal:

```powershell
$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:3220'
$env:NEXT_PUBLIC_SITE_URL='http://127.0.0.1:3221'
pnpm exec next dev --hostname 127.0.0.1 --port 3221
```

Then run:

```powershell
pnpm exec playwright test --config playwright.private-cache.config.ts private-cache.spec.ts
pnpm exec playwright test --config playwright.private-cache.config.ts live-path-listener.spec.ts
pnpm run test:unit
pnpm run typecheck
pnpm run lint
```

The dedicated config collects only local API/media fixture specs. `private-cache.spec.ts` intercepts all requests to the unused loopback API at port 3220. Its golden flow plays a locally generated WAV through Chromium's real decoder and checks the same audio DOM node remains playing after account changes. The remaining cases exercise fresh/stale private reads with B failures; late A responses; actual sibling-tab auth actions; private download cancellation; and staff cache/dialog cleanup.

## Red/green evidence (2026-10-25)

- Before the cache repair, both fresh and 31-second-old cross-tab cases failed: the nav identified Bob while two elements still rendered `Alice private strike` (expected zero).
- The delayed-A case also failed before repair: Bob's profile never loaded while Alice's URL-only request occupied the cache.
- With cache isolation alone, real sibling-tab sign-in still failed: the main tab's account menu remained `@alice_private` after the sibling tab identified Bob. Adding the successful-sign-in broadcast fixed that reproduction.
- With cache isolation alone, the delayed-export test received an actual `wildcat-radio-my-data-2026-10-25.json` download after Bob's transition. Abort-on-unmount fixed that reproduction.
- Final gate results are recorded in the workspace implementation ledger/result file.

## Limits

This is frontend lifecycle isolation, not a backend authorization change. Authenticated mutations already admitted by the backend are not rolled back by a page unmount. Socket owner/episode completion guards are handled by paired realtime work (#148). Other non-download async side effects outside React state need targeted review only if they can cross identities. The existing standing route's initial-read error skeleton is separately tracked as FE-06; isolation ensures it cannot retain another user's standing.
