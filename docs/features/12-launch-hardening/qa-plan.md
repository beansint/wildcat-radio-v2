# QA plan — launch-hardening (#72)

## Surfaces touched

| Surface | Change | Risk |
|---|---|---|
| `src/lib/auth/client.ts` | demo session removed | Staff screens for anonymous visitors — regression = fabricated session |
| `next.config.ts` | CSP script-src per env | Inline scripts blocked in prod (hydration dies) or eval kept (finding unaddressed) |
| `e2e/` | 3 audit specs deleted | Lost coverage? (No — specs were audit probes, not product assertions) |
| `vitest.config.ts`, CI `verify` | coverage report | CI red on v8 provider misconfig |
| CI `e2e` job | new | Wrong service wiring → red gate or false green |

## Matrix

| # | Case | Tier | Where |
|---|---|---|---|
| 1 | Prod CSP: no `'unsafe-eval'`, keeps `'unsafe-inline'` + `frame-ancestors 'none'` | unit | `src/next-headers.spec.ts` U-1 |
| 2 | Dev CSP: keeps `'unsafe-eval'` | unit | U-2 |
| 3 | Coverage excludes generated orval output | unit | U-3 |
| 4 | Auth client exports real hook, zero demo identifiers | unit | U-4 |
| 5 | Unauthenticated `/mod/roster` → `/login?next=` | e2e | `e2e/mod-access.spec.ts:23` (red/green case for AC-1) |
| 6 | RBAC entry via real session for moderator/custodian/listener | e2e | `e2e/staff-entry.spec.ts` |
| 7 | Full product suite green after audit-spec deletion; console/network guard clean (catches a too-tight CSP) | e2e | `pnpm test:e2e` |
| 8 | CI verify prints coverage report | contract (gated: Actions) | first run on the PR |
| 9 | CI e2e job green (Postgres → migrate → seed → API :3010 → FE :3011 → suite) | contract (gated: Actions) | first run on the PR |
| 10 | Playwright report artifact present on failure | contract (gated: Actions) | verified only if a run fails |

## Execution

1. **Pre-merge local (run twice against live servers, per conventions):**
   `pnpm test` → `pnpm test:coverage` → `pnpm test:e2e`.
2. **Red/green proof for AC-1:** with the fix reverted (`git stash` of `client.ts`) and
   `NEXT_PUBLIC_DEMO_MODE=true`, case 5 fails (fake session satisfies the guard); with the
   fix, it passes. Documented in qa-log.
3. **Gated cases 8–10:** observed on the PR's first GitHub Actions run; recorded in qa-log.
