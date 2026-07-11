# Feature: Org & schedule admin + studio attendance  (Issue #5)

- **Branch:** `feature/5-org-schedule-attendance`  ·  **Milestone:** M2 (closes it)  ·  **Repo(s):** backend **and** frontend (one combined full-stack slice)
- **Spec:** backend `docs/planning-docs/v2.2-org-attendance/00-DESIGN.md` (behaviour), `01-DECISION-REGISTER.md` (locked calls), `docs/planning-docs/REFERENCE-pages-and-access.md` (role→route), `docs/final-build-plan/{02-DATA-MODEL.md,03-API-CONTRACT.md}` (contract)
- **Prototype parity (1:1):** `docs/frontend-design-basis-prototype/mod/{roster,schedule,attendance}.html`, `studio/studio-attendance.html`, plus the public weekly schedule

## Problem & why

The v2.2 org/attendance layer is designed but only its **studio time-in/out** endpoints were built (as part of the M1 spine). Moderators still have **no way to manage the DJ roster, define the weekly show schedule, or correct the attendance sheet**, and the public site cannot show "what's on." DJs are **roster data, not accounts** (decision #22) — there is no DJ role and no promotion flow — so all of this talent/schedule data must be moderator-managed. This slice builds the missing backend endpoints and the admin + studio + public UI that consume them, closing M2.

## Acceptance criteria (numbered, testable)

- **AC-1:** A MODERATOR (or CUSTODIAN) opens `/mod/roster`, sees active DJs as cards, and adds a DJ via the dialog (`POST /api/roster`); the new card appears without a reload.
- **AC-2:** A MODERATOR edits a DJ and archives/restores one (`PATCH /api/roster/:id` toggling `isActive`); archived cards render muted (`opacity-60 grayscale`) and are hidden unless "show archived" is on.
- **AC-3:** A MODERATOR opens `/mod/schedule`, sees `WEEKLY` shows placed in the correct day×daypart cells, and adds a show (name, recurrence, start/end, assigned roster entries) via the dialog (`POST /api/shows`); it lands in the right cell(s).
- **AC-4:** A MODERATOR edits a show's cadence/roster and deletes a show (`PATCH`/`DELETE /api/shows/:id`); the weekly grid reflects the change.
- **AC-5:** `/mod/attendance` shows the sheet for a chosen `date` (and optional `show`) with columns **DJ · Scheduled · Timed-in · Timed-out · On-air hrs · Status · Note**, and a moderator corrects time-in/out and attaches a note (`PATCH /api/attendance/:recordId`); the row and note update in place.
- **AC-6:** `/studio` defaults to **Attendance** mode behind a `.wc-seg` Attendance⇄Console toggle; each rostered DJ for the current slot has a **Time in** button that calls `POST /api/studio/time-in` and flips the row to a "Timed in ✓ HH:MM" pill; **Time in a sub/guest** times in a roster entry not assigned to the slot.
- **AC-7:** The public `/schedule` renders the read-only weekly grid from `GET /api/schedule` for anonymous users (no auth, no `/mod` chrome).
- **AC-8:** All `/mod/*` routes are gated to MODERATOR+: a LISTENER is redirected by the client-side role guard, and the backend returns **403** on the same call (first live use of `RolesGuard`).
- **AC-9 (edge):** Every moderator mutation writes exactly one append-only `StaffAuditLog` row (`actorId`, `action`, `entity`, `entityId`, `metadata`). A `ONE_TIME` show requires a `date`; a `WEEKLY` show requires ≥1 `day`. A `/studio` time-in with no scheduled show creates an `unscheduled` episode (single-active-episode invariant holds).
- **AC-10 (edge):** Empty states (no roster, no shows for the day, no attendance rows) render the prototype's empty copy; invalid form input surfaces a single `role="alert"` region per form and blocks submit.

## Scope

- **In:**
  - **Backend (new):** `roster` CRUD, `shows` CRUD, public `GET /api/schedule`, `attendance` sheet read + correction — all moderator-gated via `RolesGuard` + `StaffAuditLog` writes on every mutation; DTO validation incl. the `cadence` shape.
  - **Frontend (new):** staff sidebar shell (`.wc-sidenav`) + `/mod` role-gated layout; `/mod/roster`, `/mod/schedule`, `/mod/attendance`; `/studio` Attendance mode + segmented nav; public `/schedule`; a reusable data-table primitive; orval regen + generated-hook wiring.
  - Feature docs + Playwright golden/edge + backend e2e.
- **Out (owned elsewhere):**
  - Custodian **Staff Review** / role management (`/admin/staff`, `PATCH /api/users/:id/role`) — deferred, decision #18 ("first needed at first turnover"); its own later custodian slice.
  - `/mod/users` listener strikes/mutes/bans — **M4 Moderation** (#8/#9).
  - Analytics, broadcast log, **staff-audit-log *viewer* UI** — **Slice 6 / Insights** (this slice only *writes* audit rows).
  - Public DJ profile pages, announcements/settings — **M5 Content** (#9/#10).
  - Deployment — no deploy this phase (locked).

## Contract

- **Data:** `docs/final-build-plan/02-DATA-MODEL.md` → `RosterEntry`, `Show` (`cadence Json?`), `ShowRosterEntry`, `Episode`, `AttendanceRecord`, `StaffAuditLog`. **No migration required — every model already exists** in `packages/db/schema.prisma`.
- **`Show.cadence` JSON shape (this slice defines it):**
  ```jsonc
  {
    "kind": "WEEKLY" | "ONE_TIME",
    "days": ["MON","WED","FRI"],   // WEEKLY only; subset of MON..SUN
    "date": "2026-07-20",          // ONE_TIME only (YYYY-MM-DD)
    "start": "13:00",              // 24h, station-local HH:MM
    "end":   "16:00"
  }
  ```
  Prototype recurrence maps: **One-time** → `{kind:ONE_TIME,date}`, **Mon-Wed-Fri** → `{kind:WEEKLY,days:[MON,WED,FRI]}`, **Daily** → `{kind:WEEKLY,days:[MON..SUN]}` (custom day sets allowed).
- **REST (new — all `/api`, `@Roles('MODERATOR')` unless noted):**
  - `GET /api/roster?includeArchived` · `POST /api/roster` · `PATCH /api/roster/:id`
  - `GET /api/shows` · `POST /api/shows` · `PATCH /api/shows/:id` · `DELETE /api/shows/:id`
  - `GET /api/schedule` **(public)** — weekly grid data (WEEKLY shows by day/daypart + today's episode statuses)
  - `GET /api/attendance?date&showId` · `PATCH /api/attendance/:recordId`
- **REST (existing, reused, station-token auth):** `GET /api/studio/today`, `POST /api/studio/time-in`, `POST /api/studio/time-out`.
- **Generated files (after `pnpm api:refresh`):** frontend `openapi/openapi.json`, `src/lib/api/endpoints/{roster,shows,schedule,attendance}/*`, `src/lib/api/model/*` (+ existing `endpoints/studio/*`).

## Edge cases

- LISTENER (or anonymous) hits any `/mod/*` route → client guard redirect **and** backend `403`.
- `ONE_TIME` show without a `date`, or `WEEKLY` show without a `day` → DTO validation `400`, form shows one `role="alert"`.
- `start >= end` on a show → validation `400`.
- Attendance correction where `timeOut < timeIn` → validation `400`.
- Attendance sheet with no records for the date → empty-state copy, not an error.
- `/studio` **Time in** with no scheduled show → creates an `unscheduled` episode; a second concurrent open episode must never exist (single-active-episode invariant, decision #21).
- Timing in a roster entry **not** assigned to the slot (sub/guest) → allowed, record is fine; episode may be marked `unscheduled` per spec.
- Attendance status derivation: `no time-in → ABSENT`, `time-in ≤ scheduled+grace → ON_TIME`, `> grace → LATE (n min)`, moderator note present + over-slot → `AGREED_OVERTIME` (confirm-to-credit: no tap, no credit).
- Regression: `/listen` manifest `dj` array is now sourced from **attendance** (timed-in roster entries), not the heartbeat — verify it still populates after this slice.

## Known limitations / follow-ups (surfaced during implementation)

- **Timezone (medium, cross-cutting):** attendance status derivation (`deriveStatus`) and cadence day-matching (`showsOnDate`) currently interpret `cadence.start`/date in **UTC**, but the station operates in the Philippines (UTC+8). Late/absent detection and day-boundary matching will be wrong in production. Fix needs a `STATION_TZ` config decision (e.g. `Asia/Manila`, no DST → fixed +8). Attendance status is display-only + moderator-correctable, so this is not a blocker, but it must be resolved before go-live. **Deferred — needs an owner decision.**
- **Show hard-delete (minor):** `DELETE /api/shows/:id` relies on the DB FK `episodes.showId ON DELETE SET NULL`, which silently orphans historical episodes from their show (losing the show link for analytics/history — the design values history survival). Recommend either blocking delete when episodes exist or soft-archiving shows. **Follow-up.**
- **Timezone manifestation in attendance correction (medium):** a concrete symptom of the UTC issue above — the `/mod/attendance` edit dialog builds the corrected time in the browser's local TZ, but `GET /api/attendance?date=` buckets by UTC day, so correcting a record to a local time before ~08:00 rolls it to the previous UTC day and the row disappears from "today". Resolved by the same `STATION_TZ` decision. **Deferred with the timezone follow-up.**
- **Typed response client (minor):** the new endpoints use `@ApiOkResponse({ description })` with no `type`, so orval generates `void` response types and the frontend hand-types the shapes in `src/lib/mod/types.ts` + `src/lib/studio/types.ts`. Adding response DTO classes (`@ApiOkResponse({ type: XDto })`) would let orval generate typed responses and drop the hand-written types. **Follow-up.**
- **Select-in-Dialog z-index (fixed):** the first Select-inside-Dialog usage exposed a latent stacking bug (`SelectContent z-50` under the Dialog overlay `z-[80]`), making in-dialog dropdowns unclickable by mouse. Fixed by raising `SelectContent` to `z-[90]`; regression-guarded by a real mouse-click in `e2e/mod-org-schedule-attendance.spec.ts`.

## Notes / decisions

- **DJs are roster data, not accounts** (decision #22): no DJ role, no promotion; roster CRUD only. `linkedAccountId` stays a deferred nullable seam.
- **Moderators own scheduling** (decision #17); MODERATOR and CUSTODIAN have identical operational access to roster/schedule/attendance ("higher tier includes lower").
- **First live use of `RolesGuard`** — apply `@UseGuards(SessionGuard, RolesGuard)` (order matters: session first) + `@Roles('MODERATOR')`. The guard exists and is unit-tested but currently applied to zero routes.
- **Every mod mutation is audit-logged** to the append-only, peer-visible `StaffAuditLog` — "logged to staff audit" is shown on every prototype action. Viewer UI is out of scope.
- **On-air hours** in this slice = `duration(timeIn, timeOut)`; the refined *timed-in ∧ source-connected* overlap metric (decision #25) is deferred to analytics/Slice 6 — noted, not built.
- **Migrations use Prisma scripts** (`pnpm --filter <db> migrate:dev`) if any schema tweak is ever needed — **no raw SQL**. This slice expects **no** migration.
- **shadcn/ui primitives emitting `wc-*` classes** per frontend `AGENTS.md`; `Dialog` (installed, unused) drives create/edit modals; install shadcn `table` and theme to `wc-table` for the sheet/grid. Black+gold, dark-default staff register. `data-testid` selectors, generated orval hooks (profile pattern), one `role="alert"` per form.
- **Studio placement:** `/studio` stays in the `(station)` route group (station token, not user session); `/mod/*` in `(app)` with an added role check; `/schedule` in `(public)`.
- **e2e needs a seeded MODERATOR** account (`mod@example.com` / `Password123!`) + a couple roster entries and a show, added to `packages/db/seed.mjs`.
