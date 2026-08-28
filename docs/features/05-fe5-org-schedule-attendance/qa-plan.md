# QA Plan: Org & schedule admin + studio attendance  (Issue #5)

> Executed by the AI-agent QA loop (see conventions/03). Each path proves ≥1 acceptance criterion.
> Spec location — frontend: `e2e/mod-org-schedule-attendance.spec.ts`, `e2e/studio-attendance.spec.ts`, `e2e/public-schedule.spec.ts` · backend: `apps/api/test/{roster,shows,schedule,attendance}.e2e-spec.ts`.

## Setup / fixtures

- **Accounts (seed via `packages/db/seed.mjs`, not raw SQL):**
  - `mod@example.com` / `Password123!` — role **MODERATOR** (drives all `/mod/*` golden paths).
  - `test@example.com` / `Password123!` — role **LISTENER** (drives the 403 / redirect edge).
- **Seed rows:** ≥2 `RosterEntry` (one active, one archived), ≥1 `WEEKLY` `Show` with cadence + roster assignment, ≥1 `AttendanceRecord` for today.
- **Station device:** use the enrolled `STATION_DEVICE_TOKEN` plus matching `WC_DEVICE_ID` to mint a one-time handoff for `/studio`; reference the seeded `ROSTER_ID`.
- **Env:** backend on `:3010`, Next on `:3011`, Neon dev branch `DATABASE_URL`; stream stack not required for these flows.
- **Backend e2e:** authenticate the Better Auth session with each account, assert RBAC on every mod endpoint.

## Golden path (mod admin) → proves AC-1, AC-2, AC-3, AC-4, AC-5

1. Log in as `mod@example.com` (`data-testid=auth-email` / `auth-password`) → land on `/mod/roster`.
2. Roster: click `mod-roster-add`, fill `roster-name`/`roster-bio`, save → **assert** a new `mod-roster-card` appears; edit it, toggle status → **assert** archived card is muted and hidden until `mod-roster-show-archived` is on.
3. Schedule: go to `/mod/schedule`, click `mod-schedule-add`, set `show-name`/`show-recurrence`=Mon-Wed-Fri/`show-start`/`show-end`, assign a DJ (`show-djs`), save → **assert** the show renders in the Mon/Wed/Fri cells at the right daypart; edit it, then delete → **assert** it leaves the grid.
4. Attendance: go to `/mod/attendance`, set `mod-attendance-date` to today → **assert** the seeded row shows; open `mod-attendance-edit`, set `att-timein`/`att-timeout`/`att-note`, save → **assert** the row + note update and status recomputes.
- **Assert (DB):** new `roster_entries` row; new then-deleted `shows` row; updated `attendance_records` row; **one `staff_audit_logs` row per mutation** (create-roster, update-roster, create-show, delete-show, correct-attendance) with the mod's `actorId`.

## Golden path (studio attendance) → proves AC-6

1. Mint a one-time handoff with the enrolled station device, open `/listen#station_handoff=<code>`, and assert `/studio` defaults to **Attendance** mode (`studio-seg-attendance` active).
2. For a rostered DJ row (`studio-att-row`), click `studio-timein` → **assert** `POST /api/studio/time-in` fires and the row flips to the "Timed in ✓" pill; the console-unlock CTA reflects "N timed in".
3. Click `studio-timein-sub`, pick a non-slot roster entry → **assert** it times in and appears as a sub.
- **Assert (DB):** `attendance_records` upsert on `(episodeId, rosterId)`; an `episodes` row exists and is the single active episode.

## Golden path (public schedule) → proves AC-7

1. As anonymous (no session), visit `/schedule` → **assert** `schedule-grid` renders WEEKLY shows in the correct cells, with no `/mod` chrome and no auth redirect.

## Edge path(s) → proves AC-8, AC-9, AC-10

1. **RBAC:** as `test@example.com` (LISTENER), navigate to `/mod/roster` → **assert** client redirect away; call `GET /api/roster` with the listener session → **assert** `403`.
2. **Validation:** submit a `ONE_TIME` show with no `date`, and a `WEEKLY` show with no day → **assert** backend `400` + single `role="alert"`, no row written; submit `start >= end` → `400`.
3. **Attendance validation:** correct a record with `timeOut < timeIn` → **assert** `400`, no change.
4. **Ad-hoc episode:** `/studio` **Time in** with no scheduled show → **assert** an `unscheduled` episode is created and remains the only active episode.
5. **Empty states:** attendance date with no records, schedule day with no shows, empty roster → **assert** the prototype empty copy renders (not an error).
6. **Regression:** after time-ins, hit `GET /api/stream/manifest` → **assert** `dj` array reflects the timed-in roster entries.

## Selectors used (data-testid)

- `mod-nav`, `mod-nav-roster`, `mod-nav-schedule`, `mod-nav-attendance` — staff sidebar
- `mod-roster-add`, `mod-roster-card`, `mod-roster-edit`, `mod-roster-archive`, `mod-roster-show-archived`, `roster-name`, `roster-bio`, `roster-status` — roster
- `mod-schedule-add`, `mod-schedule-cell`, `show-name`, `show-recurrence`, `show-start`, `show-end`, `show-djs` — schedule
- `mod-attendance-date`, `mod-attendance-show`, `mod-attendance-row`, `mod-attendance-edit`, `att-timein`, `att-timeout`, `att-note` — attendance
- `studio-seg-attendance`, `studio-seg-console`, `studio-att-row`, `studio-timein`, `studio-timein-sub` — studio
- `schedule-grid`, `schedule-cell` — public schedule

## Evidence to capture

- Playwright output for all three golden specs + the edge spec (green).
- Backend e2e output showing `403` for LISTENER on each mod endpoint and `200`/`400` shapes.
- DB rows: a created `roster_entries`, a `shows` row, a corrected `attendance_records`, and matching `staff_audit_logs` rows (screenshot the Neon query).
- Screenshot of `/mod/schedule`, `/mod/attendance`, `/studio` (Attendance mode), `/schedule` against the prototype for parity.
- Console + backend log scan (clean) after each golden flow.
