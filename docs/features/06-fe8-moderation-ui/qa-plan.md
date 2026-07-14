# QA Plan: Moderation UI  (Issue #8)

> Executed by the AI-agent QA loop (see conventions/03). Each path proves ≥1 acceptance criterion.
> Spec location: `e2e/mod-queue.spec.ts`, `e2e/mod-users.spec.ts`, `e2e/mod-logs.spec.ts`,
> `e2e/profile-standing.spec.ts`, `e2e/admin-escalations.spec.ts` (`e2e/mod-access.spec.ts` carries
> some pre-existing RBAC coverage for the LISTENER/unauth cases).

## Setup / fixtures

- Seeded accounts, all password `Password123!`:
  - `mod@example.com` — MODERATOR
  - `custodian@example.com` — CUSTODIAN
  - `campuslistener@example.com` / `test@example.com` — LISTENER
- Base URL: `PLAYWRIGHT_BASE_URL` (default `http://localhost:3011`); backend on `:3010`. (`e2e/mod-access.spec.ts` and `playwright.config.ts`'s default both still hardcode `:3000` — stale; new specs read the env var with a `:3011` fallback per project convention.)
- Queue/log fixtures are driven through the real API (reports, watch-flags, appeals, reinstatement requests, strikes) rather than raw SQL, so the read surfaces exercise the true DTO shape end-to-end; deterministic rows are id/handle-prefixed per spec and cleaned up where the API allows it.

## Golden path → proves AC-1, AC-2, AC-3, AC-4, AC-5, AC-7

1. **`/mod/queue`** (MODERATOR): tab bar renders (`mod-queue-tabs-{all,reports,flags,appeals,reinstatements}`); at least one card or the typed empty state renders per tab; open a card's Strike action → dialog with severity-override toggle → submit → strike issued (DB: strike row + audit row).
2. **`/mod/users`** (MODERATOR): search a seeded handle → row renders with class chip + status pill + "N of 3" strikes; Mute a user → confirm dialog → 24h mute applied (DB verified).
3. **`/mod/logs`** (MODERATOR): broadcast-activity tab shows real time-in/out/episode rows; staff-audit tab shows action pills including the queue-issued strike from step 1.
4. **`/profile/standing`** (the struck user): shows the strike with reason + local-time expiry (converted from UTC); submit a written appeal → confirmation, appeal recorded `OPEN`.
5. **`/admin/escalations`** (CUSTODIAN): the appeal from step 4 appears under the Appeals tab with the user's real handle; open the decision modal → Overturn + written response → appeal `OVERTURNED`, strike removed, mute cleared.
6. **AC-7 end-to-end assertion:** re-visit `/profile/standing` as the affected user → strike/mute no longer present, reflecting the custodian's decision.
- **Assert:** each DB-mutating step above leaves the expected row shape (strike, mute, report/appeal status transition, audit row) — verified via API response and, in the pre-merge pass, directly via Neon.

## Edge path(s) → proves AC-1, AC-2, AC-3, AC-4, AC-6

1. **Queue tab filter:** switching `/mod/queue` tabs never shows more cards than "All"; a tab with no seeded data renders `mod-queue-empty`.
2. **Queue dismiss:** "Looks fine"/Dismiss on a report card resolves it (`OPEN`→`DISMISSED`), removing it from the queue.
3. **Users search debounce + status pills:** typing doesn't fire a request per keystroke; a muted user's pill renders the "Muted until…" long-label case correctly (no layout overflow).
4. **Logs date-range filter:** narrowing the range on either tab refetches and changes the visible rows.
5. **Standing empty appeal:** submitting a blank appeal is blocked client-side, surfaces `role="alert"`, and does not hit the API.
6. **RBAC:**
   - LISTENER (`campuslistener@example.com`/`test@example.com`) visiting any `/mod/*` route → redirected away from `/mod`.
   - MODERATOR (non-CUSTODIAN) visiting `/admin/escalations` → redirected away.
   - Unauthenticated visitor → redirected to `/login?next=<path>`.

## Selectors used (data-testid)

- `mod-queue-tabs`, `mod-queue-tabs-{all,reports,flags,appeals,reinstatements}`, `mod-queue-card`, `mod-queue-empty` — queue tab bar + cards.
- `mod-logs-tabs` — logs tab container (and its two child tabs).
- `auth-email`, `auth-password`, `auth-submit` — shared login flow used by every spec's `loginAs` helper.
- Additional per-page testids (users search/status pill, standing appeal form, escalations decision modal) follow the `<area>-<element>` convention; see each spec file for the exact set exercised.

## Evidence to capture

- `pnpm exec playwright test e2e/mod-queue.spec.ts e2e/mod-users.spec.ts e2e/mod-logs.spec.ts e2e/profile-standing.spec.ts e2e/admin-escalations.spec.ts --reporter=list` output (pass count), run twice.
- Screenshots of each of the 5 pages in golden + one edge state.
- Neon query output confirming strike/mute/appeal/report row states after the end-to-end walkthrough (step 6 above).
