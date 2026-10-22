# QA log — accounts, listener engagement and booth console

Date: 2026-10-23. [Frontend PR #142](https://github.com/beansint/wildcat-radio-v2/pull/142), [backend PR #204](https://github.com/beansint/wildcat-radio-v2-backend/pull/204). The paired backend `docs/features/203-account-engagement/qa-log.md` is the canonical cross-repository execution record.

## Environment

Real local Next production build on localhost:3011, actual Nest/Better Auth on localhost:3010, owned PostgreSQL 17 on loopback port 55432, real local ffmpeg/AAC/HLS, local S3 protocol fixtures and actual sockets. Only the external Resend transport is captured. The user deferred sender/key configuration; inbox delivery remains unverified. See [local Playwright setup](../../testing/local-playwright.md).

Final database: `wildcat_account_browser_final_20261023_test`. It was cloned from the clean migrated template and seeded locally after the dependency security update. Previous failing/interrupted fixture databases remain separate. Browser station offset is zero consistently across API, build and fixtures; production-default time unit tests run without that override.

## Verification

| Gate | Result / evidence |
|---|---|
| Lint | Passed, zero errors / six existing warnings; `frontend-patched-lint.log` |
| Types and production build | Passed after Next 16.4.1; `frontend-patched-types.log`, `frontend-security-final-build.log` |
| Units and coverage | 412 tests / 52 files passed with Vitest 4.1.12; `frontend-security-final-coverage.log` |
| Frozen installation / dependency audit | Passed; unfiltered audit has zero findings at every severity; `dependency-final-frozen.log`, `frontend-final-audit.json` |
| Focused real-stack browser paths | 19/19 passed before the final one-class poll layout correction; mobile clipping regression subsequently passed in the rebuilt suite |
| Full Playwright diagnostic run | 323 passed, 4 failed, 4 serial-blocked of 331; `browser-patched-1.json`, retries off |
| Focused recovery | Consolidated 24/24 affected and 331/331 overall, unchanged product source; `browser-recovery.json` (22/24) plus `browser-transition-recovery.json` (7/7) |
| Visual/console evidence | Artifact desktop/light and mobile/dark inspected without overflow; real application screenshots and console guards in browser journeys |
| Workflow policy checks | YAML parsed and 42 dev/main/manual conditions passed across both repos; changed-test ESLint passed |

## Acceptance coverage

| Surface | Golden and edge checks |
|---|---|
| Registration, verification, recovery | Actual generated links captured at provider boundary; signed-in and signed-out returns; cooldown truthfulness; invalid callback; actual password reset revokes previous session |
| Listener submissions | Private statuses; silent Closed; persistent shared quota; end-of-episode refresh; accepted public queue limited to oldest five; reload/reconnect/global player recovery |
| DJ console | Pending count/grouping; Queue/Read/Decline; idempotent Handled; receipt opt-out; independent pauses; staff restriction precedence; Lock this browser preserves broadcast |
| Chat | Listener/booth viewport focus; preserved reading position; keyboard new-message jump; Escape restores focus; mobile composer reachable; poll card cannot clip in long feed |
| Profile / My data | Canonical gender and explicit null clearing; optional consent saved/withdrawn without regrant; handle validation and persistence; one-time age sample; partial age failure remains visible; preference isolation and keyboard save |
| Shared areas | Complete regression suite includes broadcast lifecycle/playback, public content, legal/auth gates, staff/moderation, polling, schedule, notifications and generated API consumers |

## Failed checks retained and repaired

The initial browser work found a nested sticky stage obscuring submission history and a player snapshot gap before acknowledged room admission. Independent review also identified the missing final private-history refresh at episode end. All received regression coverage and scoped fixes.

Rebuilt browser testing exposed animation timing assertions and selectors matching Next's route announcer, plus a CommonJS import mismatch in test cleanup. Normal user interactions remain in the tests; synchronization waits for actual stable state and complete sheet removal. Exact leaked fixture IDs were removed under a local guard, with only their recorded age sample reversed. The next focused run passed all 19.

Visual review then found 48px of poll content clipped by flex shrink. The new mobile geometry regression failed first; `shrink-0` on the poll card preserves its content while the parent scrolls. Final rebuilt verification includes that regression.

The old-version full run was intentionally stopped after CI exposed pre-existing Next advisories. It is not counted as a final pass. The final diagnostic run and focused recovery use the patched dependency set and fresh database. The owner removed the second full-run requirement; see [verification policy](../../testing/verification-policy.md).

## Completion record

Local acceptance is complete: [machine-readable evidence](verification-results.json) preserves the failed full run and passing focused recovery separately. Invalid-verification and sticky-layout assertions were stale; synthetic listener episode fixtures needed the new endpoints. The original DJ race HTTP 400 was not allowlisted; isolated and transition-file rechecks passed, along with the four previously blocked cases.

Prior code CI passed. Final workflow/docs checks run in the background; development handoff does not wait for CI or another full suite. Owned local processes and the mail capture are cleaned at handoff. Provider delivery and physical mobile keyboard behavior remain separate gates. No production deployment is included.

Screenshots from the actual final browser run: [mobile chat](evidence/mobile-chat-focus.png), [DJ history](evidence/studio-history.png), [private listener history](evidence/listener-private-history.png). The first focused recovery was 22/24; the final seven-case transition recheck passed after waiting for the kiosk's current socket rather than the prior listener-page connection. Combined affected coverage is 24/24; both reports remain in verification-results.json.
