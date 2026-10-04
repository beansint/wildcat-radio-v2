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
