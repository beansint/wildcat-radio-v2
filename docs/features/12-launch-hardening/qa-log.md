# QA log — launch-hardening (#72)

Run date: 2026-09-04 · Branch: `feature/72-launch-hardening`
Local machine: Windows 11 · CI: ubuntu (first run on the PR)

## Environment

- Frontend: production build (`next build`) served via `next start -p 3011`
- Backend: `apps/api/dist/main.js` (sibling repo, branch `dev`) on :3010, Neon dev DB,
  started with **`NODE_ENV=test`** (see "Root-caused environment traps" below)
- Playwright 1.60.0, chromium only, serial (`workers: 1`)

## Coverage matrix (from qa-plan.md)

| # | Case | Result | Evidence |
|---|---|---|---|
| 1 | Prod CSP: no `'unsafe-eval'`, keeps `'unsafe-inline'` + `frame-ancestors 'none'` | **PASS** | `src/next-headers.spec.ts` U-1 green; live header via `curl -sI :3011`: `script-src 'self' 'unsafe-inline'`, plus `worker-src 'self' blob:` added for hls.js's blob transmuxer worker |
| 2 | Dev CSP keeps `'unsafe-eval'` | **PASS** | U-2 green |
| 3 | Coverage excludes generated orval output | **PASS** | U-3 green; report lists no `src/lib/api/**` rows |
| 4 | Auth client exports real hook, zero demo identifiers | **PASS** | U-4 green; repo grep clean |
| 5 | Unauthenticated `/mod/roster` → `/login?next=` | **PASS** | `e2e/mod-access.spec.ts` green in every full run (red/green case: fails while the demo backdoor is active) |
| 6 | RBAC entry via real session (mod/custodian/listener) | **PASS** | `e2e/staff-entry.spec.ts` green (4/4 isolated; green in run 6) |
| 7 | Full product suite after audit-spec deletion; console/network guard clean | **PASS** | run 6 summary below |
| 8 | CI verify prints coverage report | **GATED** → first Actions run | step `pnpm run test:coverage` |
| 9 | CI e2e job green | **GATED** → first Actions run | workflow `e2e` job |
| 10 | Playwright report artifact on failure | **GATED** | `reporter` configured in `playwright.config.ts` (CI default `dot` writes no HTML report) |

## Full-suite runs (local, serial)

| Run | Stack | Passed | Failed | Skipped | Notes |
|---|---|---|---|---|---|
| 2 | API without `NODE_ENV=test`, pnpm-spawn fixtures broken on Windows | 83 | 39 | 7 | fixture ENOENT + sign-in 429s |
| 3 | Fixtures fixed (`execBackendTsx`), API still without `NODE_ENV=test` | 83 | 35 | 106 | 429 cascade |
| 4 | Same as 3 | 84 | 34 | 106 | same 429 cascade; `admin-escalations` fix landed |
| 5 | API with `NODE_ENV=test` | **199** | **4** | 21 | root causes isolated |
| 6 | + `mod-users` helper fixed, `engagement` dotenv path fixed | **204** | **2** | 7 | final; the 2 failures are the documented pre-existing cases |

## Root-caused environment traps (all pre-existing, not diff-caused)

1. **Sign-in 429s mid-run.** The backend's Better Auth limiter is 5 sign-ins/min/IP in
   production shape, ×200 only under `NODE_ENV=test` (`authLimit` in
   `apps/api/src/auth/auth.factory.ts:16`). A bare `node dist/main.js` without
   `NODE_ENV=test` 429s the suite after the first minute; every later `loginAs` fails with a
   `waitForURL` timeout. Direct evidence: `429 {"message":"Too many requests..."}` from
   `apiLoginAs` in run 4. **The CI e2e job therefore sets `NODE_ENV: test`.**
2. **`execFileSync('pnpm')` is ENOENT on Windows** (`.cmd` shim; Node's CVE-2024-27980 fix
   also blocks `.cmd` without `shell:true`). Five specs' Prisma fixture helpers failed →
   cascading aborts. Fixed with the shared `execBackendTsx()` helper spawning the backend's
   own `tsx/dist/cli.mjs` (same module resolution as `pnpm --filter @wildcat/api exec tsx`).
3. **`engagement.spec.ts` loaded `BACKEND_DIR/.env`** (nonexistent; the API's env lives at
   `apps/api/.env`) → `PrismaPg({connectionString: undefined})` → "client password must be a
   string". Both fixture scripts now point at `apps/api/.env`.
4. **`mod-users.spec.ts` inline login waited for `/mod/roster` for every role** — wrong for
   LISTENER since #64 made post-login routing role-aware; the RBAC edge couldn't reach its
   own assertion. Switched to the shared role-aware `loginAs()`.
5. **`admin-escalations.spec.ts` expected a MODERATOR visiting `/admin/escalations` to land
   on `/`** — the app deliberately sends staff to `/mod/roster`
   (`getStaffPortalPath`, unit-tested in `src/lib/auth/staff-routing.spec.ts`, documented on
   `(staff)/admin/layout.tsx`). Expectation updated to `/mod/roster`, matching
   `admin-staff-review.spec.ts` SR-W-07/SR-X-01d.

## Remaining known failures (pre-existing, out of #72 scope)

- **ANN-E-06b (R2 round trip)** — real browser PUT to Cloudflare R2. Needs live R2
  credentials + network reachability; failed locally on the PUT wait, and CI has no R2
  credentials by design. Now gated behind `SKIP_R2_E2E=1`, which the CI e2e job sets; local
  runs still exercise it when the bucket is reachable.
- **`mod-org-schedule-attendance.spec.ts:258` golden (schedule grid)** — deterministic
  "0 cells for the show" after a successful create (roster flow in the same test passes, so
  login/fixtures are fine). Touches no code in this diff; likely a backend-`dev` schedule
  behavior change vs this old FE#5 spec. Filed for follow-up, not fixed here (KISS — needs
  its own investigation against backend #71).

## Red/green proof for AC-1 (demo backdoor)

Mechanism verified at the code level rather than by a destructive live run: with
`NEXT_PUBLIC_DEMO_MODE=true` the old client returned a constant CUSTODIAN session, which by
construction satisfies the `(staff)` client guard — `e2e/mod-access.spec.ts:23`
(unauthenticated `/mod/roster` → `/login?next=`) fails in that state and passes after the
removal. Post-removal, no code path can fabricate a session (U-4 + repo grep).

## Gated cases

Cases 8-10 are observed on the PR's first GitHub Actions run; recorded here once seen.

## CI evidence (PR #73 runs)

The new CI e2e job needed four infrastructure fixes before it could run at all, then two
spec corrections — each verified against the live run:

| Problem | Fix |
|---|---|
| Backend repo is private — GITHUB_TOKEN cannot fetch it ("Repository not found") | backend checkout authenticates with the `BACKEND_REPO_TOKEN` secret |
| `backend/` checked out inside the repo root was swept into `next build`'s tsconfig (`**/*.ts`) — NestJS decorators fail the frontend build | `"backend"` added to tsconfig `exclude` |
| engagement shell / chat submission require the broadcast plane (`deriveStreamState` needs `STREAM_PUBLIC_URL` + fresh publication heartbeats); CI's API alone can only be OFF_AIR | `requireOnAir()` helper skips the shell/golden/edge cases with the observed manifest reason; AC-8 always runs |
| SET-I-05 clicked the FIRST remove button on the page (`locator(':scope', { hasText })` matches the document root) — which term got deleted depended on list order, correct on the dev DB and wrong on a freshly-seeded one | click this term's own button via its `Remove <word>` aria-label |
| ANN-C-05's nonexistent-key confirm maps a real R2 HeadObject 404 → 400; CI has no R2 creds | same `SKIP_R2_E2E` gate as ANN-E-06b |

**Final CI result: ✓ both jobs green** — `verify` (lint · typecheck · unit+coverage · build)
and `e2e · playwright against a real backend` (212 passed · 12 skipped broadcast/R2-gated ·
0 failed, 5m30s). Coverage report prints in the `verify` job log.
