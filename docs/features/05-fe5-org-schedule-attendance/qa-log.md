# FE#5 browser QA coverage log

Comprehensive Playwright pass over every FE#5 feature + its key edges, run
against a live backend (`:3010`) and frontend (`:3011`). Extends the three
existing FE#5 specs rather than adding new files, using the Prisma-fixture
pattern already established in `e2e/studio-attendance.spec.ts` /
`e2e/engagement.spec.ts` for determinism (the DB accumulates state across
runs; nothing here depends on it).

Full run: `PLAYWRIGHT_BASE_URL=http://localhost:3011 pnpm exec playwright
test e2e/mod-org-schedule-attendance.spec.ts e2e/studio-attendance.spec.ts
e2e/public-schedule.spec.ts --reporter=list` → **17 passed**, run twice to
confirm no flakiness. The matrix below has **zero open gaps** — every FE#5
feature/scenario is covered by a passing test.

## Coverage matrix

| Feature / scenario | Covered? | Spec / test | Notes |
|---|---|---|---|
| Roster: add DJ | Yes | `mod-org-schedule-attendance.spec.ts::AC-1..AC-5 golden` | |
| Roster: edit DJ (displayName + bio) | Yes | `mod-org-schedule-attendance.spec.ts::AC-1 edge: mod edits an existing DJ (displayName + bio) and the card reflects it` | |
| Roster: archive | Yes | `mod-org-schedule-attendance.spec.ts::AC-1..AC-5 golden` (toggle only) and `::AC-1/AC-2 edge: archive then restore a DJ` (full archive+confirm+muted-card flow) | |
| Roster: restore | Yes | `mod-org-schedule-attendance.spec.ts::AC-1/AC-2 edge: archive then restore a DJ` | Same button/testid (`mod-roster-archive`), label flips Archive↔Restore |
| Roster: "show archived" toggle | Yes | `mod-org-schedule-attendance.spec.ts::AC-1..AC-5 golden` | |
| Roster: add-DJ form validation (empty name) | Yes | `mod-org-schedule-attendance.spec.ts::edge: submitting the "Add DJ" dialog with an empty name surfaces a field error` | Asserts `role="alert"`, dialog stays open, card count unchanged |
| Schedule: add show (MWF default recurrence) | Yes | `mod-org-schedule-attendance.spec.ts::AC-1..AC-5 golden` | |
| Schedule: edit show (time slot via grid cell) | Yes | `mod-org-schedule-attendance.spec.ts::AC-3 edge: mod edits an existing show (time slot) via its schedule cell` | Reopens via `mod-schedule-cell`, changes 06:00–07:00 → 06:30–07:30, asserts grid text updates |
| Schedule: delete show | Yes | `mod-org-schedule-attendance.spec.ts::AC-1..AC-5 golden` (and reused as cleanup in the new edit/daily tests) | |
| Schedule: Daily recurrence | Yes | `mod-org-schedule-attendance.spec.ts::AC-4 edge: a Daily show appears in all 7 day columns` | Asserts 7 `mod-schedule-cell` matches |
| Attendance: render sheet + correct a record (happy path) | Yes | `mod-org-schedule-attendance.spec.ts::AC-1..AC-5 golden` | |
| Attendance: station-TZ correction edge (the fix) | Yes | `mod-org-schedule-attendance.spec.ts::AC-5 edge: station-TZ correction to 05:15 does not roll the row off "today"` | Seeds an open attendance row, corrects time-in to `05:15`, reloads the page with the default (station-local) date filter, asserts the row is **still present**. Backend (`stationDayWindowUtc`) and frontend (`station.ts`) both already carry the fix — this is a regression guard, not a repro of a live bug. |
| Attendance: synthesized ABSENT row | Yes | `mod-org-schedule-attendance.spec.ts::edge: a scheduled DJ with no attendance record renders an Absent pill and no edit button` | Seeds a show airing today with an assigned DJ and no attendance record; asserts "Absent" pill + zero `mod-attendance-edit` buttons in that row |
| Attendance: correction-form validation (time-out before time-in) | Yes | `mod-org-schedule-attendance.spec.ts::edge: attendance correction validation — time-out before time-in is rejected` | Asserts `role="alert"`, dialog stays open, the row's rendered time-out cell is byte-identical before/after |
| Attendance: date filter | Yes (implicitly) | every attendance test relies on the default "today" station-local date filter (`mod-attendance-date`) | The station-TZ edge test is the strongest exercise of it |
| Attendance: show filter | Yes | `mod-org-schedule-attendance.spec.ts::edge: the attendance show filter narrows the sheet to the selected show` | Seeds two shows airing today (each with its own DJ + attendance record), selects one in `mod-attendance-show`, asserts only that show's DJ row remains and the other is filtered out server-side |
| Studio: Electron handoff unlock | Yes | `studio-attendance.spec.ts::AC-6 golden` | API-issued handoff exchanges for the httpOnly station cookie; no bearer token is entered in the browser |
| Studio: Attendance is default segment, Console/Attendance toggle | Yes | `studio-attendance.spec.ts::AC-6 golden` | |
| Studio: time-in (slot roster row) | Yes | `studio-attendance.spec.ts::AC-6 golden` | |
| Studio: time-out | Yes (was an open bug, now fixed + tested) | `studio-attendance.spec.ts::edge: time a slot DJ out — pill disappears and the time-in button returns` | The missing UI was added (a `studio-timeout` button next to the timed-in pill, wired to `timeOutStudio`) after this QA pass first surfaced the gap; see "Bugs found" |
| Studio: sub/guest time-in (DJ not on the slot roster) | Yes | `studio-attendance.spec.ts::edge: time in a sub/guest DJ not on any show roster` | Closes the fixture's open slot episode first (so there's genuinely no slot), opens an ad-hoc episode via "Time in a sub / guest DJ", asserts the guest renders as timed-in in the `attendees` branch (`studio-attendee-row` + guidance copy) |
| Studio: "Console is live" CTA once someone's timed in | Yes | `studio-attendance.spec.ts::edge: "Console is live" CTA appears once a DJ is timed in and opens the Console segment` | Asserts the CTA (`studio-console-cta`) is absent before anyone's in, appears after time-in, and clicking it selects the Console segment (`studio-seg-console` aria-selected + "Studio console" heading) |
| Studio: ad-hoc episode with no show (attendees fallback) | Yes | `studio-attendance.spec.ts::edge: time in a sub/guest DJ...` | This is the scenario the task called out as possibly impossible to set up in-browser — it's not: the sub/guest flow creates exactly this ad-hoc episode via `POST /api/studio/time-in`, and the test asserts its `attendees`-fallback rendering (`studio-attendee-row` + guidance copy) directly |
| Public schedule: weekly grid renders seeded show | Yes | `public-schedule.spec.ts::AC-7 golden` | Unchanged — already covered |
| RBAC: LISTENER redirected from `/mod` | Yes | `mod-org-schedule-attendance.spec.ts::AC-8 edge` | Unchanged — already covered; `mod-access.spec.ts` covers the unauthenticated case (pre-existing, out of this file's scope) |
| Cross-cutting: staff dark-mode toggle doesn't leak to public site | Yes | `mod-org-schedule-attendance.spec.ts::cross-cutting edge: staff dark mode does not leak onto the public site` | Toggles dark on `/mod`, client-side-navigates via "View public site" (`mod-nav-public-site`), asserts `<html>` loses `.dark`. Exercises the real mechanism (the `StaffThemeToggle` unmount-cleanup effect in `staff-sidebar.tsx`), not just a full reload which would trivially "pass" |

## Bugs found

**Studio time-out had no UI entry point — FOUND during this QA pass, now
FIXED and regression-tested.**

- Originally: the backend fully implemented DJ time-out (`POST
  /api/studio/time-out` → `StreamStateService.timeOut()` in
  `wildcat-radio-v2-backend/.../stream-state.service.ts:151`) and the
  frontend even had the generated hook (`timeOutStudio` /`useTimeOutStudio`
  in `src/lib/api/endpoints/studio/studio.ts`), but **nothing in the UI ever
  called it** — a timed-in slot row rendered only a static
  `studio-timedin-pill` `<span>`, no time-out affordance anywhere on
  `/studio`. Once a DJ tapped in, staff had no live way to tap them back out;
  the record stayed open (`timeOut: null`) until a mod manually corrected it
  from `/mod/attendance`, leaving on-air-hours and status wrong in the
  meantime.
- **Fix (applied in app source by the coordinator, not by this QA pass):**
  `src/components/studio/attendance-panel.tsx` now renders a
  `data-testid="studio-timeout"` button (outline, size sm) next to the
  timed-in pill on **both** the slot-roster rows and the attendees-fallback
  rows, wired to `timeOutStudio({ body: JSON.stringify({ rosterId }) })`
  followed by a today-query invalidation. The backend sets `timedIn: !!att &&
  att.timeOut === null`, so after time-out the row's `studio-timedin-pill`
  disappears and — as long as the episode stays open — the `studio-timein`
  button returns.
- **Coverage:** `studio-attendance.spec.ts::edge: time a slot DJ out — pill
  disappears and the time-in button returns` exercises this end-to-end. It
  adds a second slot DJ via fixture so the episode stays open after one DJ
  times out (timing out the *only* DJ instead transitions the episode to
  OFF_AIR and closes it — a separate, intended path where the whole slot card
  empties; that's the reason the test uses two DJs). It times both in,
  asserts both pills, times the first out, then asserts that row's pill +
  time-out button disappear and its `studio-timein` button returns, while the
  second DJ's pill is untouched.

No other app bugs were found. The station-TZ attendance-correction bug the
golden path's existing comment calls out is **already fixed** in both layers
(`src/lib/time/station.ts` frontend helpers, `stationDayWindowUtc` on the
backend) — scenario 5 above is a regression guard confirming that, not a
live repro.

## Test hygiene notes

- All new backend fixture rows in `mod-org-schedule-attendance.spec.ts` are
  id-prefixed with `e2e-fe5-qa-` and deleted in a file-level `afterAll`
  (FK-safe order: attendance records → show-roster links → episodes → shows
  → roster entries). Verified empty after a run (`0` roster/show/episode
  rows with that prefix remain).
- The new sub/guest studio test creates its own ad-hoc episode (via the real
  time-in flow, not a fixture) and explicitly closes it (`endedAt`) in a
  `finally` block so it can't become the "most recently created open
  episode" and break `studio-attendance.spec.ts`'s own fixture episode on a
  later run.
- The new studio time-out test adds a second roster entry to the seeded
  Afternoon Vibes show (`e2e-fe5-timeout-dj2`) and removes it (attendance →
  show-roster link → roster entry, FK-safe) in a `finally` block, so the
  seed show's roster is left exactly as it was.
- The attendance show-filter test's two fixture shows/episodes/DJs use the
  `e2e-fe5-qa-` prefix (cleaned up by the file-level `afterAll`). Their
  episodes are seeded **closed** (`endedAt` set) on purpose: the attendance
  sheet buckets rows by `timeIn` day-window + `showId`, not by `endedAt`, so
  they still render — and a closed episode can't hijack the studio spec's
  `findOpenEpisode()` when the two files run in parallel.
- Roster/show rows created purely through UI actions in the pre-existing
  golden test (e.g. its own `E2E DJ …` card) are left as-is, matching the
  golden test's existing convention — they don't affect any assertion here
  since every new test uses `.filter({ hasText })` scoping rather than
  absolute counts.

## Out-of-scope failures observed while running the full suite

Running the entire `e2e/` directory (not just the three FE#5 files) surfaces
pre-existing, unrelated failures caused by environment/port mismatches, not
by anything in this change:

- `auth-login-logout.spec.ts`, `auth-register.spec.ts`, `mod-access.spec.ts`,
  `profile-edit.spec.ts`, `listen-gate.spec.ts` hardcode
  `const BASE = 'http://localhost:3000'` instead of reading
  `PLAYWRIGHT_BASE_URL`, so they fail against this session's `:3011`
  frontend.
- `engagement.spec.ts`'s golden/edge tests fail without
  `NEXT_PUBLIC_API_URL`/`PLAYWRIGHT_API_BASE` exported in the shell (its
  Prisma fixture also reads a repo-root `.env` that doesn't exist in this
  backend checkout — only `apps/api/.env` does).
- `stream-playback.spec.ts` fails because no live HLS source is connected in
  this session (station shows `STATION_ROTATION`, not `LIVE`) — unrelated to
  FE#5.

None of these touch FE#5 code paths and none were modified as part of this
QA pass.
