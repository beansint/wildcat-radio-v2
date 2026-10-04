# Verification log

| Boundary | Evidence | Status |
| --- | --- | --- |
| Pure and service regressions | Local unit suites | Passed before PR; final counts in PR evidence |
| Shared Supabase | Rollback-only persistence check: adoption, no automatic scheduled switch, explicit continuing-crew handover, outgoing overtime pending, one open episode | Passed; no fixtures persisted |
| Browser UI | schedule-broadcast-regressions.spec.ts, two consecutive passes | Recorded in PR evidence; API fixtures |
| Real stack | GitHub full Playwright and isolated PostgreSQL | Pending PR CI; must pass before merge |
| Keyboard/focus | Staff Enter/edit/rejected save/Escape/opener focus | Passed |
| Production/physical audio | Windows Studio/BUTT and audible HLS | Not run; no deployment in scope |

Local full backend command contains legacy DB-mutating announcement/chart tests. Subsequent local runs exclude these; CI runs them safely on isolated Postgres. Do not use global-reset E2E fixtures on the station database.

## PR review follow-up

Standards: no blockers. Spec review's backend crew-transfer/readiness findings are fixed in companion PR #115. Six local browser scenarios passed twice (12/12). Added isolated-CI real-stack scenarios for explicit continuing-crew handover and a pending incoming DJ retaining an assigned outgoing DJ.

The initial full frontend CI run used backend dev before companion merge; its new continuing-crew case failed because that backend did not yet expose readiness. All other executed cases passed. Rerun full real-stack CI against updated backend dev before frontend merge.
