# QA Plan: M5 public content + announcements/settings admin (Issue FE#9)

> Executed by the AI-agent QA loop (conventions/03). Full case catalog:
> `.agent/test-suites/fe-m5-public-content/`. Specs: `e2e/public-content.spec.ts`,
> `e2e/mod-announcements.spec.ts`, `e2e/mod-settings.spec.ts`; unit tier `pnpm test:unit`.

## Setup / fixtures

- Real stack: backend `:3010` (`pnpm dev`), frontend `:3011`, real Neon dev branch.
- Accounts: `mod@example.com`, `custodian@example.com`, `campuslistener@example.com` — `Password123!`.
- Fixtures are created **through the API** in `beforeAll` (announcements in each of the six statuses,
  a show with roster + episodes, an active and an inactive DJ, a chart snapshot) and removed FK-safe
  in `afterAll`; the suite asserts zero leaked rows.
- Photo fixture: a small real JPEG under `e2e/fixtures/`, plus an oversized buffer and a `.gif` for
  the rejection paths.

## Golden path → proves AC-1, AC-2, AC-4, AC-5

1. Sign in as mod → `/mod/announcements` (`mod-nav-announcements`).
2. `mod-ann-new` → fill `mod-ann-title`, `mod-ann-body` → `mod-ann-save` → row under Draft.
3. `mod-ann-submit` → row moves to Pending review.
4. `mod-ann-review` → choose Publish → `mod-ann-review-confirm` → row moves to Published.
5. `mod-ann-pin` → pinned marker; `mod-ann-feature` → featured marker with the acting mod's handle.
6. Attach a photo: presign → PUT → confirm; thumbnail count reads "1 of 4".
7. New anonymous context → `/announcements` → the announcement is present and **first**; open its
   detail page → body and photo render.
- **Assert:** each staff transition reflects the server's state after refetch; the public list order
  is pinned-first; the detail page contains no moderator handle.

## Golden path → proves AC-6, AC-7

1. `/mod/settings` → Branding → change `mod-settings-branding-tagline` → the live preview updates.
2. Moderation → set `mod-settings-policy-guestRequestBudget` to 1.
3. `mod-settings-save` → success state.
4. Reload → both values persist. Anonymous context on `/` → new tagline visible.
5. Guest listener submits two queue requests in one episode.
- **Assert:** exactly one `PUT` per changed key with a JSON number (not a string); the second guest
  request is refused immediately, with no server restart.

## Edge paths → proves AC-3, AC-8, AC-9, AC-10

| # | Trigger | Expected |
|---|---|---|
| E1 | Visit `/announcements/<draft-id>` anonymously | not-found page, no title leak, no 403 |
| E2 | Visit `/shows/unknown-slug`, `/djs/<inactive-id>` | not-found; episode sections absent |
| E3 | Current week with no chart snapshot | empty state with week label, no spinner |
| E4 | Public read returns 429 | retry card; retry button re-issues successfully |
| E5 | Review → Reject with empty reason | blocked in the single `role="alert"`, no request sent |
| E6 | Pin a 3rd announcement | control disabled with explanation; forced attempt → 409 as a sentence |
| E7 | Attach a `.gif`, then a 6 MB JPEG, then a 5th photo | three distinct client-side refusals |
| E8 | Save settings with a blank numeric field | blocked client-side, no request |
| E9 | Partial save failure (one key rejected) | failing key named, successes kept, field stays dirty |
| E10 | LISTENER opens `/mod/announcements` and `/mod/settings` | refused; no data in the DOM |
| E11 | CUSTODIAN repeats the golden path | succeeds end to end |
| E12 | Staff dark mode → "View public site" | `<html>` carries no `dark` class |
| E13 | 375×812 on every new page | no horizontal scroll; preview sheet reachable via the FAB |
| E14 | Open an announcement via a **stale slug** (`wrong-slug-<publicId>`) | page renders, address self-corrects to canonical, no 404 |
| E15 | Open an announcement by **bare cuid** (the old link format) | still resolves — previously-shared links don't rot |

## Selectors used (data-testid)

This list is **binding** — the specs select by these exact ids, so the implementation matches them
rather than the other way round.

- Public: `public-announcements-list`, `public-announcement-card`, `public-announcement-hero`,
  `public-announcement-body`, `public-shows-list`, `public-show-card`, `public-djs-list`,
  `public-dj-card`, `public-chart-rows`, `public-empty`, `public-rate-limited`, `public-retry`,
  `public-not-found` (the shared not-found state for an unpublished announcement, an unknown show
  slug or an inactive DJ), `public-show-episodes-upcoming`, `public-show-episodes-recent`,
  `public-show-lineup`, `public-dj-shows`.
- Announcements: `mod-ann-new`, `mod-ann-title`, `mod-ann-body`, `mod-ann-save`, `mod-ann-row`,
  `mod-ann-submit`, `mod-ann-review`, `mod-ann-review-decision`, `mod-ann-review-schedule`,
  `mod-ann-review-reason`, `mod-ann-review-confirm`, `mod-ann-pin`, `mod-ann-feature`,
  `mod-ann-archive`, `mod-ann-photo-input`, `mod-ann-photo-count`, `mod-ann-empty`,
  `mod-ann-provenance`, and tabs `mod-ann-tabs-{draft,pending,scheduled,published,rejected,archived,all}`.
  `mod-ann-pin` and `mod-ann-feature` are single toggle buttons carrying `aria-pressed` — there is no
  separate unpin/unfeature testid.
- Settings: tabs `mod-settings-tabs-{branding,copy,toggles,moderation}`; fields
  `mod-settings-<group>-<camelCaseKeySuffix>` (e.g. `mod-settings-branding-stationName`,
  `mod-settings-toggle-chatFreeze`, `mod-settings-killswitch-guests`,
  `mod-settings-policy-strike1Hours`, `mod-settings-policy-guestRequestBudget`,
  `mod-settings-announcements-pinLimit`); `mod-settings-save`, `mod-settings-discard`,
  `mod-settings-filter-input`, `mod-settings-filter-tier`, `mod-settings-filter-add`,
  `mod-settings-filter-remove`, `mod-settings-preview`, `mod-settings-preview-fab`.

## Evidence to capture

- `pnpm test:unit` summary; `pnpm exec playwright test` summary, run **twice** back-to-back.
- Screenshots: public announcements list (pinned first), announcement detail with photo, shows index,
  DJ profile, charts empty state, `/mod/announcements` with all status tabs populated,
  `/mod/settings` with the live preview, and one mobile viewport of each staff page.
- Console + network logs proving zero errors and no unintended ≥400 responses.
- The coverage matrix in `qa-log.md`, with every gap named.
