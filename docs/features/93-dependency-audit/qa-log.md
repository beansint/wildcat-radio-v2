# Verification evidence, 2026-10-05

Original baseline: audit reported14 critical and14 high entries. The initial PR reduced this to0 critical/1 high, but full CI correctly failed on the unpatched braces3.0.3 chain in Next's ESLint plugin.

Final correction: scoped fast-glob -> tinyglobby0.2.17 replacement plus a pinned pnpm consumer patch removes braces/micromatch. Bare replacement initially failed2/4 compatibility cases (absolute paths and literal-directory expansion); the consumer patch preserves original semantics and all4 regressions pass, including the actual internal-link lint rule. Frozen-lockfile install succeeds. No audit exclusions or gate weakening.

Vitest and coverage upgraded to4.1.11, including Better Auth's declared Vitest dependency; vulnerable browser-mapping and Markdown transitive versions upgraded. The full and production-only audit JSON now reports0 advisories at every severity. CI continues to audit the full graph and reject high/critical findings.

Lint:0 errors (existing warnings retained). Typecheck: passed after explicitly typing callable socket-test mocks for Vitest4. Unit tests:36 files/283 tests passed. Coverage command passed (report-only,13.05% line coverage across the configured handwritten source). Next.js16.3.6 production build passed with local origins.

Real isolated API/Postgres + production Next build:9 Chromium cases passed for inbox privacy/account switching/read retry/empty and outage states, public205-row paging and keyboard retry, staff creator permissions and stale-author denial with dialog focus. Initial public paging run1failed/8passed because the fixture read placeholder cards before fetching completed; the test now awaits the visible region's aria-busy=false state and retains the205-unique-link assertion. Corrected9/9 passed; targeted repeat recorded separately. Original fixture DB guards remain unchanged in committed specs; temporary copies restrict writes to local merge_sql_20261005 at127.0.0.1:55432.

Independent review and final PR/dev CI will be recorded in the root hardening report after remote confirmation. No shared migration, provider mutation, production deployment or physical audio verification.
