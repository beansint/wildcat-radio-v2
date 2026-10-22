# QA Plan: listener and booth journeys (#141)

Canonical acceptance criteria/contract: backend docs/features/203-account-engagement/feature.md.
Canonical environment/fixtures and full API gate: sibling backend qa-plan.md.

Run the real local API/database/station/socket and production frontend with explicit loopback
origins and named disposable database (docs/testing/local-playwright.md). Use
`e2e/local-mail-api.cjs` to capture external email while keeping Better Auth and outbox real;
set AUTH_EMAIL_CAPTURE_PATH to a task-owned .agent JSONL file. This file is not committed.

Review follow-up: run `snapshot-requests.spec.ts` with the existing presence, engagement-state and snapshot-recovery units. Cover duplicate events across player/listener, in-flight handling, independent episodes, fresh post-success reads, a production-like eleven-client request budget, automatic delayed 429 recovery, bounded retry exhaustion, and non-retryable ended episodes. Use fake clocks rather than waiting for real rate-limit windows. The paired backend account-email suite checks anonymous known/missing-address 401 parity and preserved signed-in cooldowns. Follow this with frontend typecheck, changed-file lint and API compile; no full-suite or CI waiting gate.

- `e2e/account-engagement.spec.ts`: Pending/Up Next/History decisions and receipt opt-out,
  private history/quotas and end refresh, seven accepted submissions/reconnect/player ordering,
  independent booth pauses/staff precedence, lock without stopping playback, reading-position
  and desktop/mobile chat focus.
- `e2e/account-verification.spec.ts`: actual signup verification email and signed-out return,
  truthful resend cooldown, real reset link/session revocation, invalid-link recovery.
- Existing profile/edit/preferences/standing and legal consent tests: regressions for optional
  demographics, persisted preferences, withdrawal, actual account standing.
- Full existing Playwright suite: regression coverage for other product surfaces; retain any
  established mock seams honestly while all new core journeys run against the real local stack.

Follow the owner's [verification policy](../../testing/verification-policy.md): preserve the
completed full-run evidence, repair and rerun affected cases once with retries off, and hand off
without waiting for CI or another full run. Record original failures and focused recovery in
qa-log.md. Keep heavyweight builds/Jest separate from browser runs on memory-constrained
Windows hosts. Clean owned fixtures even when setup or assertions fail; preserve failed-run
evidence before creating a fresh local database.
