# Feature: M5 public content + announcements/settings admin (Issue FE#9)

- **Branch:** `feature/9-m5-public-content`  ·  **Milestone:** M5  ·  **Spec:** `.agent/test-suites/fe-m5-public-content/README.md`; backend `docs/features/013-content-announcements`, `014-m5-public-site`, `015-m5-public-lists`
- **Repo(s):** frontend (depends on backend Slice C)

## Problem & why

M5's backend shipped the whole content layer — announcements lifecycle, typed settings registry,
public reads, photo uploads, the weekly chart — with no surface on top of it. Listeners could not see
a single announcement, and moderators had no way to write one. This issue builds both halves: the
public content pages a visitor actually browses, and the two staff consoles that feed them. It
retires six dead `href="#"` links (Shows, DJs, Charts, News in the public top-nav; Announcements and
Settings in the staff sidebar) and turns the three static mock sections on the landing page into live
data.

## Acceptance criteria (numbered, testable)

- **AC-1:** Public, unauthenticated pages exist at `/announcements`, `/announcements/[id]`, `/shows`,
  `/shows/[slug]`, `/djs`, `/djs/[id]` and `/charts`, each rendering live API data inside the public
  shell (top-nav + persistent player). None redirects to `/login`.
- **AC-2:** The announcements list renders pinned items first (server order preserved, never
  re-sorted client-side) with the first pinned item as the hero. Publishing an announcement in
  `/mod/announcements` makes it appear publicly without a deploy or restart.
- **AC-3:** No public page exposes moderator identity — no handle, display name, email or `*ById`
  field, in the DOM or in any response the page fetches.
- **AC-4:** `/mod/announcements` drives the real lifecycle: create → submit → review
  (publish / schedule / reject-with-reason) → archive, plus pin/unpin (cap 2) and feature/unfeature,
  with each row showing its resolved provenance (created / reviewed / published / featured /
  last-edited by).
- **AC-5:** Announcement photos upload in three steps — presign, direct browser `PUT` to R2 with
  exactly the declared `Content-Type` and `Content-Length`, then confirm — with client-side limits
  mirroring the server (JPEG/PNG/WebP, 1 byte–5 MB, at most 4) and the attached photos read back from
  the staff DTO.
- **AC-6:** `/mod/settings` renders every registry-backed key grouped into Branding / Copy / Toggles /
  Moderation, hydrated from a single `GET /api/settings/admin`, saved as one `PUT` per genuinely
  changed key with correctly typed values (a number key sends `5`, never `"5"`).
- **AC-7:** A settings change reflects on the site: branding/copy edits appear on public pages, and a
  request-budget change takes effect on the next listener request.
- **AC-8 (edge):** 429, 404 and empty collections each render a designed state on every public page —
  never an infinite spinner, never an unhandled error boundary.
- **AC-9:** Every form surfaces validation and mutation errors through exactly one `role="alert"`
  region; every element a spec touches carries a stable `data-testid`; every timestamp renders in the
  viewer's local time with state derived from a real date comparison.
- **AC-10:** LISTENER is refused at both staff routes; CUSTODIAN can do everything MODERATOR can.
- **AC-11 (readable URLs):** An announcement's public address is `/announcements/<slug>-<publicId>`,
  never a bare cuid — every link to it (list, hero, landing, staff preview) uses that form. If the
  slug portion is stale because the title was edited since the link was shared, the page still
  resolves and quietly corrects the address to the canonical one rather than 404ing.

## Scope

- **In:** the seven public routes; landing wiring (featured announcement, most requested, shows
  grid); top-nav and staff-sidebar link wiring; `/mod/announcements`; `/mod/settings`; the moderation
  filter lists inside the settings page; a Vitest unit tier (the repo had none); Playwright specs for
  all three surfaces.
- **Out:** `/mod/analytics` and Staff Review (the two remaining sidebar stubs — later milestones);
  announcement rich-text editing (the contract is plain text by design); historical chart weeks; a
  public per-DJ episode history.

## Contract

- **API consumed (orval-generated only, no hand-written fetch):** public — `GET /api/announcements`,
  `/announcements/:id`, `/shows`, `/shows/:slug`, `/shows/:slug/episodes`, `/djs`, `/djs/:id`,
  `/charts/current`, `/settings`, `/schedule`. Staff — `GET /announcements/admin(/:id)`, `POST
  /announcements`, `PATCH /:id`, `POST /:id/{submit,review,archive,feature,unfeature,pin,unpin}`,
  `POST /:id/photo` + `/photo/confirm`, `GET /settings/admin`, `PUT /settings/:key`,
  `GET/POST/DELETE /mod/filter`.
- **The one deliberate exception:** the direct `PUT` to R2's presigned URL is a raw `fetch` — it is a
  foreign origin with a signed URL, so no generated hook exists or should.

## Edge cases

- A DRAFT / REJECTED / ARCHIVED announcement id visited publicly → the not-found page, no title leak.
- Unknown show slug or inactive DJ id → not-found; the episode sections do not render.
- Chart with no snapshot for the current week → empty state with the week label.
- Public read throttled (429) → retry card whose button re-issues the request.
- Announcement with `publishedAt: null` or `photos: []` → renders without "Invalid Date" and without
  an empty image frame.
- Lifecycle actions offered per status exactly match the API's transitions: SCHEDULED has no
  "publish now", ARCHIVED has no "restore", DRAFT has no "archive".
- Pin attempt at the cap → the control is disabled with an explanation, and a forced attempt shows
  the 409 as a sentence in the single alert region.
- Photo: `.gif` refused, >5 MB refused, 5th file refused, and a confirm for an upload that never
  reached R2 surfaces the server's 400 rather than a phantom thumbnail.
- Settings: blank numeric blocked before any request; a partial save failure names the failing key
  and keeps it dirty while preserving the writes that succeeded.
- Staff dark-mode class never leaks onto a public page after "View public site".

## Known blocker

- **Announcement photo upload cannot complete in a browser: the `wildcat-radio` R2 bucket has no
  CORS policy.** The presign and confirm halves both work; the browser's `PUT` straight to the
  signed URL is rejected at preflight (`No 'Access-Control-Allow-Origin' header`). This is a bucket
  configuration change on Cloudflare, not a code change — set a CORS rule allowing `PUT` from the
  app origins with `content-type`/`content-length` allowed. The end-to-end test
  (`ANN-E-06b`) is written, was run against real credentials to prove the failure, and is skipped
  with that exact error recorded; un-skip it once the bucket is configured. Everything else in AC-5
  (client-side limits, the presign contract, the confirm contract, the honest error state) ships and
  is verified.

## Notes / decisions

- **The prototype's announcements page predates decisions L34/L35 and was adapted, not copied.**
  Dropped: the Audience toggle (L35 removed the enum, column and settings key), the second-mod
  featured-approval flow and its "you can't approve your own request" helper (L34 — one moderator
  publishes *and* features), Restore-from-archived and Publish-now-on-scheduled (neither transition
  exists; `SCHEDULED → PUBLISHED` belongs to the cron promoter). Added: the submit step, the
  PENDING_REVIEW and REJECTED states the prototype never drew, and pin/unpin.
- **The settings page renders the registry, not the mockup.** Omitted with reason: the
  chat/requests/polls/reactions master switches (no backend layer has ever had them), the logo file
  upload (only a `branding.logoUrl` string key exists), and the entire Session tab — station-session
  issue/revoke is specified in `final-build-plan/03-API-CONTRACT.md` but was never built, and station
  auth is a signed cookie today. The moderation block/watch lists are wired to
  `/api/mod/filter`, because they are `FilterEntry` rows with BLOCK/WATCH tiers rather than
  settings keys — a better home than the registry the spec originally imagined.
- **Backend Slice C was cut first** because four gaps made prototype parity impossible from the
  frontend alone: no public shows/DJs list routes, no `id` on the public roster ref (so a show could
  not link to a DJ), no `photos` on the staff announcement DTO, and no public per-show episode route.
  Slice C also wired `policy.*RequestBudget` into the engagement path — those keys were registered,
  validated and audited but read by nothing, so this page would otherwise have shipped a control that
  silently did nothing.
- **A Vitest unit tier was added** because the repo had only Playwright, and the pyramid's widest
  layer (status→action mapping, photo limits, save-plan diffing, error classification) does not need
  a browser to be tested honestly.
- **Public pages render only what the public DTOs carry.** Three prototype elements were dropped for
  that reason and are not oversights: the announcement-detail "Posted by Station Admin" byline and
  view counter (no such fields, and the byline would breach INV-1), the chart's artist line
  (`ChartEntryDto` is `{title, count}` — inventing an artist would be fabrication), and the roster
  subline on show *cards* (only the per-show detail DTO carries a roster).
- **The browser suite runs against a production build, not `next dev`** — under the dev server a
  ~1-in-22 intermittent failure appeared that isolation never reproduced, traced to route
  recompilation latency rather than app behaviour. Recorded in `qa-log.md`.
