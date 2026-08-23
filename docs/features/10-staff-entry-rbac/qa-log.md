# Staff entry and RBAC navigation QA log

**Run date:** 2026-08-23
**Stack:** frontend production server on `localhost:3011`, backend on `localhost:3010`

## Scope

Role-aware login destinations, public desktop/mobile Staff console discovery, moderator versus custodian sidebar visibility, preserved staff deep links, and moderator handling of custodian-only routes.

## Results

| Check | Result |
| --- | --- |
| Unit suite | 24 files, 221 tests passed |
| Typecheck | Passed |
| Lint | Passed, 0 errors and 5 pre-existing warnings |
| Production build | Passed, 37 routes generated |
| Staff entry + existing mod access E2E | 6 passed |
| Existing moderator `/admin/staff` redirect regression | 1 passed |
| Backend changes | None; existing backend session and RBAC endpoints exercised live |

The first browser attempt hit the backend's development sign-in throttle after repeated login attempts. The focused rerun stayed within the existing limit and passed; no application failure was observed.

## Manual verification

1. Start the backend on `3010` and frontend on `3011`.
2. Sign in as a moderator. Confirm the default destination is `/mod/roster`.
3. Visit `/`. Confirm `Staff console` appears in the desktop header, then open the mobile menu at a narrow viewport and confirm the same action appears there.
4. Sign in as a custodian. Confirm Staff Review and Escalations appear in the staff sidebar.
5. Sign in as a moderator and visit `/admin/staff`. Confirm the app returns to `/mod/roster` and does not render the admin table.
6. Sign in as a listener. Confirm no Staff console action appears and direct `/mod/roster` access is refused.
