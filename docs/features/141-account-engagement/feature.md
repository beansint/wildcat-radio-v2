# Feature: complete listener and booth engagement journeys (#141)

Branch `feature/141-account-engagement`; paired backend issue `beansint/wildcat-radio-v2-backend#203`; M9.

Pull requests: [frontend #142](https://github.com/beansint/wildcat-radio-v2/pull/142) and [backend #204](https://github.com/beansint/wildcat-radio-v2-backend/pull/204).

## What shipped this run — 23 October 2026

Merged into dev through frontend PR #142 (`4b82296`) and backend PR #204 (`cc6efa2`); CI passed for both.

The [visual HTML summary](https://github.com/beansint/wildcat-radio-v2-backend/blob/dev/docs/feature-artifacts/src/11-account-engagement.html) is stored in the backend repository at `docs/feature-artifacts/src/11-account-engagement.html`. Open that self-contained file in a browser for the rendered artifact; GitHub displays its source.

- Verification, resend and recovery use actual account links with truthful errors and cooldowns; the backend has durable encrypted email jobs and bounded retries.
- Requests move through Pending, Up Next and History. Queue/Read/Decline clear Pending; Handled clears Up Next. Listeners have private history and a visible shared per-episode allowance.
- Listener and DJ chat offer full-height focus, stable reading position, a reachable composer, new-message jump and keyboard focus restoration.
- DJs can pause chat/submissions independently from the console. Staff restrictions remain authoritative. Lock this browser explains that playback continues.
- Profile supports handle editing, accurate verification/standing and optional demographics with saved consent, withdrawal, clearing and honest errors.
- Queue/player recovery, mobile poll clipping and security dependencies were repaired. Focused local checks replace blanket repeated runs and CI waiting; main/manual-full retain builds and coverage.

See the [QA log](qa-log.md), [test ledger](verification-results.json) and screenshots for evidence. Browser coverage is consolidated from the full diagnostic run and focused recovery, not a claim that the original full run was entirely green. Live Resend credentials/inbox delivery and production rollout remain deferred; real application links were tested with the external mail transport captured.

## Canonical contract

### Review follow-up — 23 October 2026

Verification resend now requires sign-in on the API, matching the existing signed-out UI. Both known and missing addresses receive the same anonymous 401, while signed-in cooldowns remain visible.

Listener and player share `snapshot-requests.ts` for public snapshots. A 50ms burst window coalesces duplicate queue events into one read. Changes observed during a read trigger a fresh follow-up before results are applied; there is no completed-result cache. Throttled reads retry after 61 seconds, at most twice, without waiting for another event. Permanent failures do not retry. Eleven clients and three acceptances now cause 33 reads instead of 132. Regression tests use fake clocks, including missed updates, retry exhaustion, fresh reads and separate episodes; the existing join-acknowledgement/stale-response guards remain in the hooks.

The canonical numbered specification, contract, implementation plan and QA plan live in backend `docs/features/203-account-engagement/`. This implementation fulfills AC-1–16: verification journeys, Pending/Up Next/History and Handled, private submission history and clear quotas, episode-scoped booth pauses, full-height chat with stable reading position, truthful profile/consent state.

Frontend source rules: AGENTS.md; existing shadcn primitives and wc tokens; existing API/auth conventions. No required demographics, custom identity/token system, broad station privilege grant or unrelated redesign. Preserve accessible alerts/testids and mobile/global-player behavior.

Verification evidence and selectors are recorded in qa-log.md alongside the canonical backend matrix. Generated DTOs come from backend OpenAPI. No remote database fixtures were used.

CI also identified existing dependency advisories. The implementation includes the minimum Next 16.4.1 security update and aligned Vitest 4.1.12 tooling; the existing ESLint compatibility patch remains unchanged. Final acceptance runs use these patched dependencies.
