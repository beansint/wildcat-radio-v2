# Feature: Launch-hardening cleanup (Issue #72)

- **Branch:** `feature/72-launch-hardening`
- **Scope:** auth client, `next.config.ts` CSP, e2e suite hygiene, CI (coverage + e2e gate)
- **Dependencies:** none (backend untouched; CI checks out backend `main` read-only)

## Problem

Four findings from the 2026-09-04 production-readiness audit:

1. `NEXT_PUBLIC_DEMO_MODE=true` in `src/lib/auth/client.ts` fabricated a CUSTODIAN session so
   staff screens rendered without a backend. Backend `RolesGuard` is the real gate, but a stray
   `true` in a prod deployment shows staff chrome to anonymous visitors.
2. CSP `script-src` shipped `'unsafe-eval'` in production with no explanation.
3. Three `e2e/audit-*.spec.ts` files self-described as "temporary, not part of the product
   suite" ran on every e2e pass.
4. No coverage measurement anywhere; the Playwright suite never gated PRs.

## Acceptance criteria

- **AC-1:** No `NEXT_PUBLIC_DEMO_MODE` / demo session identifiers exist anywhere in the repo;
  `useSession` is always the better-auth client hook. Regression guard: unit spec asserts the
  module source and exports (`src/next-headers.spec.ts` U-4); executable red/green case:
  `e2e/mod-access.spec.ts:23` (unauthenticated `/mod/roster` → `/login?next=`), which fails
  while the backdoor is active.
- **AC-2:** Production CSP `script-src` is `'self' 'unsafe-inline'`; `'unsafe-eval'` is
  dev-only (Next dev overlay / React refresh need it). Unit specs U-1/U-2 assert both
  environments via `nextConfig.headers()`.
- **AC-3:** `e2e/audit-probe.spec.ts`, `e2e/audit-verification.spec.ts`, `e2e/audit-evidence.spec.ts`
  are deleted (findings live in the backend repo at
  `wildcat-radio-v2-backend/docs/frontend-parity-launch+react-audit/`).
- **AC-4:** `pnpm test:coverage` (vitest v8) reports on every CI run; generated orval output
  (`src/lib/api/endpoints/**`, `src/lib/api/model/**`) is excluded. Report-only — thresholds
  wait for a baseline number (YAGNI).
- **AC-5:** A blocking `e2e` CI job runs the full Playwright suite on every PR to `dev`/`main`
  against a throwaway Postgres service container, a migrated+seeded backend API on :3010
  (backend repo `main`, same recipe as its own verify job), and the built frontend on :3011.
  Playwright HTML report artifact uploaded on failure only.
- **AC-6:** Local gates green: `pnpm test` (lint · typecheck · unit) and `pnpm test:e2e`
  against live servers.

## Decisions

- Delete demo mode outright rather than gate it behind a non-public env: the backend owns
  RBAC, and a demo path is un-rehearsable code in a security-sensitive file (KISS/YAGNI).
- `'unsafe-inline'` stays (Next inline bootstrap + pre-hydration theme script, FE#39/#54);
  only the unexplained eval grant is removed, dev-only.
- Coverage is report-only for now — setting thresholds before the first real number would be
  arbitrary. Follow-up sets thresholds from the baseline.
- CI e2e is blocking, matching `verify`; `playwright.config.ts` already carries `forbidOnly`
  and a single CI retry to absorb flake against the shared live stack. If it proves flaky in
  practice, that is a follow-up decision — not pre-built here.
- The CSP script-src is computed inside `headers()` (env read per call) so both environments
  are unit-assertable without extraction into a new module.

## Test suite

`.agent/test-suites/launch-hardening/` (workspace-level, outside the repo): spec-first
catalog with the AC → case-ID trace, cross-cutting invariants (XC-1..4), unit/contract/e2e
tiers.
