# FE#8 browser QA coverage log

Comprehensive Playwright pass over every FE#8 (Moderation UI) surface + its
key edges, run against **live servers** (backend `:3010` / frontend `:3011`)
via Playwright MCP interactive driving **and** `pnpm exec playwright test`.
Console scanned clean on every mod page; DB state verified via Neon after
each mutating action. **18/18** e2e specs passed, run twice back-to-back (no
flakiness). The matrix below has **zero open gaps**.

Full run: `PLAYWRIGHT_BASE_URL=http://localhost:3011 pnpm exec playwright test e2e/mod-queue.spec.ts e2e/mod-users.spec.ts e2e/mod-logs.spec.ts e2e/profile-standing.spec.ts e2e/admin-escalations.spec.ts --reporter=list` → **18 passed**, run twice.

## Coverage matrix

| Feature / scenario | Covered? | Spec / test | Notes |
|---|---|---|---|
| `/mod/queue` renders empty + populated (4 card types) with real `@handle` + CAMPUS/GUEST chips | Yes | interactive + `mod-queue.spec.ts::golden` | DTO enrichment (`targetHandle`/`handle`) verified live |
| `/mod/queue` SegTabs filter (All/Reports/Flags/Appeals/Reinstatement counts) | Yes | `mod-queue.spec.ts::edge: filtering by a tab changes the visible cards` | |
| `/mod/queue` Strike (dialog → severity-override toggle) issues strike | Yes | interactive | DB: strike row lvl1 + 24h mute + `strike.issue` audit row verified via Neon |
| `/mod/queue` "Looks fine"/Dismiss resolves report | Yes | interactive | DB: report status `OPEN`→`DISMISSED` + `resolvedById`/`resolvedAt` verified |
| `/mod/users` table (handle+class chips, status pills Active/Muted/Banned, "N of 3" strikes), debounced search, Mute (confirm→24h) | Yes | interactive + `mod-users.spec.ts::golden/edge` | DB mute verified |
| `/mod/logs` broadcast-activity tab shows real time-in/out/episode rows (from the 5-point instrumentation) | Yes | interactive + `mod-logs.spec.ts::golden` | Proves `BroadcastActivityLog` writes |
| `/mod/logs` staff-audit tab shows action pills incl. the queue-issued Strike | Yes | `mod-logs.spec.ts::edge` | |
| `/mod/logs` date-range filter refetches | Yes | `mod-logs.spec.ts::edge` | |
| `/profile/standing` good-standing (0 strikes) + populated (muted+strike+reason+expiry, local-time formatted from UTC) | Yes | interactive + `profile-standing.spec.ts::golden` | The core acceptance |
| `/profile/standing` submit appeal → confirmation; empty appeal blocked | Yes | interactive + `profile-standing.spec.ts::edge` | DB appeal `OPEN` verified |
| `/admin/escalations` custodian 3 tabs + appeal cards (real handles) + decision modal Overturn+written response | Yes | interactive + `admin-escalations.spec.ts::golden/edges` | DB: appeal `OVERTURNED` + `writtenResponse` + strike removed + mute cleared verified |
| RBAC: LISTENER→`/mod/*` redirected to `/`; LISTENER & MODERATOR→`/admin/escalations` redirected to `/` (custodian-only); unauth→`/login?next=` | Yes | `mod-queue.spec.ts`/`mod-users.spec.ts`/`mod-logs.spec.ts` + `admin-escalations.spec.ts` RBAC tests + interactive | |
| End-to-end acceptance (AC-7): queue strike → standing shows reason+expiry; appeal → custodian written response recorded | Yes | interactive full lifecycle | Verified across queue→DB→standing→escalations→DB |
| Console/network scan | Yes | interactive | 0 errors on all mod pages (only pre-existing login-page brand-image warnings, unrelated) |

## Bugs found

During this QA pass (all fixed):

1. **StatusPill rendered as an oversized circle for long "Muted until…" labels** — no `white-space:nowrap` + a verbose `toLocaleString` produced a multi-line label inside a fixed-radius pill. Fixed: added `white-space:nowrap` to `.wc-pill` (`globals.css`) + a compact local-date formatter in `users/status.ts`. Regression: covered by the muted-pill interactive check.
2. **`/mod/users` search icon overlapped the placeholder text** — `.wc-input`'s shorthand `padding` overrode the `pl-9` Tailwind utility. Fixed: inline `paddingLeft` on the search `Input`.
3. **`/mod/queue` watch-flag card leaked the raw `watch:` reason prefix** to the moderator instead of a clean label. Fixed: strip `^watch:` in `queue-card.tsx`.
4. **`SegTabs` exposed `data-testid` only on child tabs, not the container** — `getByTestId('mod-queue-tabs')`/`mod-logs-tabs` failed in 2 e2e specs. Fixed: added `data-testid={testid}` to the tablist element; specs now 18/18.

## Test-hygiene notes

- Interactive QA seeded deterministic `qa-fe8-*`-prefixed rows (report, watch-flag, appeal, reinstatement) via Neon and drove every action through the real UI, not mocked calls.
- e2e specs read `PLAYWRIGHT_BASE_URL` (`:3011`) and seed/clean their own fixtures through the real API.
- The `qa-fe8-*` demo rows and `campuslistener@example.com`'s demo mute were **intentionally left** in the dev DB for the reviewer's walkthrough and should be pruned after review.

## Known limitations (documented, not silent)

- Reviewer/actor identity columns show ids not handles where the DTO carries only ids: staff-audit `Mod` (`actorId`), escalations resolved `By` (`reviewedById`/`approvedById`), broadcast `Triggered by` (`rosterId`). Subject handles ARE resolved (enriched DTOs). A future DTO enrichment could add these.
- Report `targetMessageId` has no message-content lookup endpoint → shows the id/placeholder, not the message text.
- One-click Mute/Ban send a fixed reason (`ConfirmDialog` has no free-text field) — matches the prototype's one-click intent; the reason is still audit-logged. A free-text reason would need a bespoke dialog.
- Reinstatement decision: the written-response textarea is captured in the UI but the `approveReinstatement` endpoint only accepts `{approve}` — response text isn't persisted for that variant.
- Wide `/mod/users` table scrolls horizontally within its own container at narrow widths (per design-notes: "wide tables scroll in their own container").

## Out-of-scope failures observed

- None — this pass ran only the 5 FE#8 spec files plus the shared `mod-access.spec.ts` RBAC coverage; no unrelated spec failures were introduced or observed within that scope.
