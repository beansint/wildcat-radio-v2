import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// FE#5 golden path (mod admin): roster + schedule + attendance, proving
// AC-1..AC-5. Edge proves AC-8's RBAC redirect for /mod/roster (mod-access.spec.ts
// already covers the unauthenticated + LISTENER edge for /mod as a whole; this
// spec's edge re-asserts it in the context of the fuller mod admin flow).
//
// Selectors per docs/features/05-fe5-org-schedule-attendance/qa-plan.md and the
// actual page/dialog source (src/app/(staff)/mod/{roster,schedule,attendance}/page.tsx,
// src/components/mod/*).
//
// Beyond the golden path, this file also covers the FE#5 browser-QA coverage
// pass (docs/features/05-fe5-org-schedule-attendance/qa-log.md): roster
// edit/archive/restore, schedule edit/daily-recurrence, the attendance
// station-TZ correction edge (the bug the golden path's comment calls out),
// the synthesized ABSENT row, correction-form validation, and the staff
// dark-mode-doesn't-leak-to-public-site cross-cutting check. Those additions
// use a small Prisma fixture helper (same `execFileSync`/tsx pattern as
// e2e/studio-attendance.spec.ts and e2e/engagement.spec.ts) to seed
// deterministic rows rather than depending on whatever the DB has
// accumulated from prior runs.

const MOD_EMAIL = 'mod@example.com';
const LISTENER_EMAIL = 'test@example.com';
const PASSWORD = 'Password123!';
const BACKEND_DIR = process.env.WILDCAT_BACKEND_DIR ?? path.resolve(process.cwd(), '../wildcat-radio-v2-backend');
// All backend fixture rows created by the additions below are id-prefixed
// with this so a single afterAll can clean them up regardless of which test
// created them, without touching seed data or other specs' fixtures.
const FIXTURE_PREFIX = 'e2e-fe5-qa-';

function uniqueSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/** Runs a small Prisma script against the backend DB (see studio-attendance.spec.ts for the pattern). */
function runPrismaScript(body: string) {
  const script = `
    import * as dotenv from 'dotenv';
    import { PrismaPg } from '@prisma/adapter-pg';
    import { PrismaClient } from '@prisma/client';
    async function main() {
      dotenv.config({ path: ${JSON.stringify(path.join(BACKEND_DIR, 'apps/api/.env'))} });
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
      const prisma = new PrismaClient({ adapter });
      ${body}
      await prisma.$disconnect();
    }
    main().catch((error) => { console.error(error); process.exit(1); });
  `;
  try {
    execFileSync('pnpm', ['--dir', BACKEND_DIR, '--filter', '@wildcat/api', 'exec', 'tsx', '-e', script], {
      stdio: 'pipe',
    });
  } catch (error) {
    const details =
      error instanceof Error && 'stderr' in error
        ? String((error as Error & { stderr?: Buffer }).stderr)
        : String(error);
    throw new Error(`Backend fixture failed: ${details}`);
  }
}

/**
 * Seeds a roster entry + an open, show-less episode + an attendance record
 * for it, with `timeIn` at station-local `today 13:00` — used by the
 * station-TZ-edge and validation tests below. Both need a real, editable
 * attendance row that isn't tied to any other spec's seed data.
 */
function seedOpenAttendanceRow(runId: string) {
  const rosterId = `${FIXTURE_PREFIX}tz-roster-${runId}`;
  const episodeId = `${FIXTURE_PREFIX}tz-episode-${runId}`;
  const djName = `E2E TZ DJ ${runId}`;
  runPrismaScript(`
    const OFFSET_MIN = Number.parseInt(process.env.STATION_UTC_OFFSET_MINUTES ?? '480', 10);
    function stationDateNow() {
      return new Date(Date.now() + OFFSET_MIN * 60000).toISOString().slice(0, 10);
    }
    function stationLocalToUtc(dateISO, hhmm) {
      const [y, mo, d] = dateISO.split('-').map(Number);
      const [h, mi] = hhmm.split(':').map(Number);
      return new Date(Date.UTC(y, mo - 1, d, h, mi) - OFFSET_MIN * 60000);
    }
    const today = stationDateNow();
    const timeIn = stationLocalToUtc(today, '13:00');
    await prisma.rosterEntry.upsert({
      where: { id: ${JSON.stringify(rosterId)} },
      update: { displayName: ${JSON.stringify(djName)}, isActive: true },
      create: { id: ${JSON.stringify(rosterId)}, displayName: ${JSON.stringify(djName)}, isActive: true },
    });
    await prisma.episode.upsert({
      where: { id: ${JSON.stringify(episodeId)} },
      update: { showId: null, unscheduled: true, endedAt: null, scheduledFor: null },
      create: { id: ${JSON.stringify(episodeId)}, unscheduled: true, scheduledFor: null },
    });
    await prisma.attendanceRecord.upsert({
      where: { episodeId_rosterId: { episodeId: ${JSON.stringify(episodeId)}, rosterId: ${JSON.stringify(rosterId)} } },
      update: { timeIn, timeOut: null, note: null },
      create: { episodeId: ${JSON.stringify(episodeId)}, rosterId: ${JSON.stringify(rosterId)}, timeIn },
    });
  `);
  return { rosterId, episodeId, djName };
}

/**
 * Seeds a show airing today (station-local weekday) with one assigned DJ and
 * deliberately NO attendance record for them — the backend synthesizes an
 * ABSENT row for this (attendance.service.ts `list()`).
 */
function seedAbsentToday(runId: string) {
  const rosterId = `${FIXTURE_PREFIX}absent-roster-${runId}`;
  const showId = `${FIXTURE_PREFIX}absent-show-${runId}`;
  const djName = `E2E Absent DJ ${runId}`;
  const showName = `E2E Absent Show ${runId}`;
  const slug = `${FIXTURE_PREFIX}absent-${runId}`;
  runPrismaScript(`
    const OFFSET_MIN = Number.parseInt(process.env.STATION_UTC_OFFSET_MINUTES ?? '480', 10);
    const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const shifted = new Date(Date.now() + OFFSET_MIN * 60000);
    const todayWeekday = DAYS[shifted.getUTCDay()];
    const cadence = { kind: 'WEEKLY', days: [todayWeekday], start: '05:00', end: '05:30' };
    await prisma.rosterEntry.upsert({
      where: { id: ${JSON.stringify(rosterId)} },
      update: { displayName: ${JSON.stringify(djName)}, isActive: true },
      create: { id: ${JSON.stringify(rosterId)}, displayName: ${JSON.stringify(djName)}, isActive: true },
    });
    await prisma.show.upsert({
      where: { id: ${JSON.stringify(showId)} },
      update: { cadence },
      create: { id: ${JSON.stringify(showId)}, name: ${JSON.stringify(showName)}, slug: ${JSON.stringify(slug)}, cadence },
    });
    await prisma.showRosterEntry.upsert({
      where: { showId_rosterId: { showId: ${JSON.stringify(showId)}, rosterId: ${JSON.stringify(rosterId)} } },
      update: {},
      create: { showId: ${JSON.stringify(showId)}, rosterId: ${JSON.stringify(rosterId)} },
    });
    await prisma.attendanceRecord.deleteMany({ where: { rosterId: ${JSON.stringify(rosterId)} } });
  `);
  return { rosterId, showId, djName };
}

/** Deletes every backend row this file's fixtures created, FK-safe order. */
function cleanupFixtures() {
  runPrismaScript(`
    await prisma.attendanceRecord.deleteMany({ where: { rosterId: { startsWith: ${JSON.stringify(FIXTURE_PREFIX)} } } });
    await prisma.attendanceRecord.deleteMany({ where: { episodeId: { startsWith: ${JSON.stringify(FIXTURE_PREFIX)} } } });
    await prisma.showRosterEntry.deleteMany({ where: { rosterId: { startsWith: ${JSON.stringify(FIXTURE_PREFIX)} } } });
    await prisma.episode.deleteMany({ where: { id: { startsWith: ${JSON.stringify(FIXTURE_PREFIX)} } } });
    await prisma.show.deleteMany({ where: { id: { startsWith: ${JSON.stringify(FIXTURE_PREFIX)} } } });
    await prisma.rosterEntry.deleteMany({ where: { id: { startsWith: ${JSON.stringify(FIXTURE_PREFIX)} } } });
  `);
}

async function loginAs(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(PASSWORD);
  await page.getByTestId('auth-submit').click();
  await page.waitForURL(new RegExp(`${next.replace(/\//g, '\\/')}$`), { timeout: 15_000 });
}

/**
 * Picks a Radix `<Select>` item by its exact visible text with a real mouse
 * click. Selects here are opened from inside a Dialog; the SelectContent is
 * raised to z-[90] (above the Dialog's z-[80] overlay) so the option is the
 * top-most element at its point and a genuine pointer click registers — this
 * exercises the same interaction a real user performs. Assumes the trigger is
 * already open.
 */
async function pickSelectItem(page: Page, exactText: string) {
  const option = page
    .locator('[data-slot="select-item"]')
    .filter({ hasText: exactText });
  await expect(option).toHaveCount(1);
  await option.click();
}

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  cleanupFixtures();
});

test.describe('mod org/schedule/attendance', () => {
  test('AC-1..AC-5 golden: mod manages roster, schedule, and attendance', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const runId = uniqueSuffix();
    const djName = `E2E DJ ${runId}`;
    const showName = `E2E Show ${runId}`;
    const noteText = `E2E note ${runId}`;

    // ── Roster (AC-1, AC-2) ────────────────────────────────────────────────
    await loginAs(page, MOD_EMAIL, '/mod/roster');

    // Wait for the roster query to settle (card or empty state) before counting.
    await expect(async () => {
      const cards = await page.getByTestId('mod-roster-card').count();
      const empty = await page.getByTestId('mod-roster-empty').count();
      expect(cards + empty).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });

    const beforeCount = await page.getByTestId('mod-roster-card').count();

    await page.getByTestId('mod-roster-add').click();
    await page.getByTestId('roster-name').fill(djName);
    await page.getByTestId('roster-bio').fill('Added by Playwright e2e.');
    await page.getByTestId('roster-save').click();

    const newCard = page.getByTestId('mod-roster-card').filter({ hasText: djName });
    await expect(newCard).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('mod-roster-card')).toHaveCount(beforeCount + 1);

    // Toggle "show archived" — assert at least one archived card becomes visible,
    // and the active-only count no longer matches once archived cards are shown.
    const activeOnlyCount = await page.getByTestId('mod-roster-card').count();
    await page.getByTestId('mod-roster-show-archived').click();
    await expect
      .poll(async () => page.getByTestId('mod-roster-card').count(), { timeout: 10_000 })
      .toBeGreaterThan(activeOnlyCount);
    // Toggle back off — archived cards hide again.
    await page.getByTestId('mod-roster-show-archived').click();
    await expect(page.getByTestId('mod-roster-card')).toHaveCount(activeOnlyCount);

    // ── Schedule (AC-3, AC-4) ────────────────────────────────────────────────
    await page.goto('/mod/schedule');

    await page.getByTestId('mod-schedule-add').click();
    await page.getByTestId('show-name').fill(showName);
    // Recurrence already defaults to "Mon-Wed-Fri" for a fresh "Add show" (no
    // prefilled day/time). Confirmed via the dialog's visible trigger text
    // rather than re-opening the popover (see the force-click note below).
    await expect(page.getByTestId('show-recurrence')).toContainText('Mon-Wed-Fri');
    // Use a start/end slot distinct from the seeded "Afternoon Vibes" (13:00-16:00)
    // so this show lands in its own grid row.
    await page.getByTestId('show-start').fill('09:00');
    await page.getByTestId('show-end').fill('10:00');
    // Assign the DJ just added above. This Select is opened from inside the
    // show Dialog; SelectContent is z-[90] (above the Dialog's z-[80] overlay,
    // see src/components/ui/select.tsx) so a real mouse click on the option
    // registers — pickSelectItem drives the genuine pointer interaction.
    await page.getByTestId('show-djs-add').click();
    await pickSelectItem(page, djName);
    // Scope to the rendered chip (`.wc-chip-ghost`) — `show-djs` also contains
    // the Select's own hidden native <option> mirror (same text, not visible),
    // so a plain getByText() here can match that instead of the real chip.
    await expect(page.getByTestId('show-djs').locator('.wc-chip-ghost', { hasText: djName })).toBeVisible();
    await page.getByTestId('show-save').click();

    await expect(page.getByTestId('show-name')).toHaveCount(0, { timeout: 10_000 }); // dialog closed
    const scheduleCells = page.getByTestId('mod-schedule-cell').filter({ hasText: showName });
    // Mon + Wed + Fri => 3 filled cells for this show.
    await expect(scheduleCells).toHaveCount(3, { timeout: 10_000 });

    // Edit then delete the show — assert it leaves the grid.
    await scheduleCells.first().click();
    await expect(page.getByTestId('show-name')).toHaveValue(showName, { timeout: 5_000 });
    await page.getByTestId('show-delete').click();
    await page.getByTestId('show-delete-confirm-confirm').click();
    await expect(page.getByTestId('mod-schedule-cell').filter({ hasText: showName })).toHaveCount(0, {
      timeout: 10_000,
    });

    // ── Attendance (AC-5) ────────────────────────────────────────────────────
    await page.goto('/mod/attendance');

    // The page already defaults `mod-attendance-date` to "today" using the
    // browser's own local date (src/app/(staff)/mod/attendance/page.tsx
    // `todayIso()`). Don't recompute/overwrite it from Node — the app runs in
    // an Asia/Manila (UTC+8) browser context while this test runner's host
    // clock may be in a different zone, so a Node-computed "today" can be off
    // by a calendar day from what the seeded attendance row is dated against.
    const attendanceRows = page.getByTestId('mod-attendance-row');
    await expect(attendanceRows.first()).toBeVisible({ timeout: 10_000 });

    // Correct the first row that has an edit trigger (seeded attendance record).
    const editButton = page.getByTestId('mod-attendance-edit').first();
    await expect(editButton).toBeVisible({ timeout: 10_000 });
    await editButton.click();

    // Times deliberately kept mid-day (not pre-08:00 local), see the app-bug
    // note in the task summary: the correction dialog builds the new
    // `timeIn`/`timeOut` as `new Date(`${date}T${hhmm}:00`)` (browser-local,
    // Asia/Manila/UTC+8), but `GET /api/attendance?date=` buckets records by
    // UTC calendar day. A local time before ~08:00 rolls back to the
    // *previous* UTC date, so the corrected row silently vanishes from
    // "today"'s sheet. Not exercising that edge here keeps this golden path
    // green; it's reported precisely as a real app bug in the task summary,
    // not fixed in app source per the task's instructions.
    await page.getByTestId('att-timein').fill('13:15');
    await page.getByTestId('att-timeout').fill('14:00');
    await page.getByTestId('att-note').fill(noteText);
    await page.getByTestId('att-save').click();

    await expect(page.getByTestId('att-save')).toHaveCount(0, { timeout: 10_000 }); // dialog closed
    await expect(page.getByText(noteText)).toBeVisible({ timeout: 10_000 });

    // ── Console cleanliness (rubric item) ───────────────────────────────────
    expect(consoleErrors, `console errors observed during golden run:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC-8 edge: LISTENER visiting /mod/roster is redirected away from /mod', async ({ page }) => {
    await loginAs(page, LISTENER_EMAIL, '/');
    await page.goto('/mod/roster');
    await expect(page).not.toHaveURL(/\/mod/, { timeout: 8_000 });
  });

  test('AC-1 edge: mod edits an existing DJ (displayName + bio) and the card reflects it', async ({ page }) => {
    const runId = uniqueSuffix();
    const originalName = `E2E Editable DJ ${runId}`;
    const editedName = `E2E Edited DJ ${runId}`;

    await loginAs(page, MOD_EMAIL, '/mod/roster');

    await page.getByTestId('mod-roster-add').click();
    await page.getByTestId('roster-name').fill(originalName);
    await page.getByTestId('roster-bio').fill('Original bio.');
    await page.getByTestId('roster-save').click();
    const originalCard = page.getByTestId('mod-roster-card').filter({ hasText: originalName });
    await expect(originalCard).toBeVisible({ timeout: 10_000 });

    await originalCard.getByTestId('mod-roster-edit').click();
    await expect(page.getByTestId('roster-name')).toHaveValue(originalName, { timeout: 5_000 });
    await page.getByTestId('roster-name').fill(editedName);
    await page.getByTestId('roster-bio').fill('Edited bio via Playwright.');
    await page.getByTestId('roster-save').click();

    await expect(page.getByTestId('roster-save')).toHaveCount(0, { timeout: 10_000 }); // dialog closed
    await expect(page.getByTestId('mod-roster-card').filter({ hasText: originalName })).toHaveCount(0);
    const editedCard = page.getByTestId('mod-roster-card').filter({ hasText: editedName });
    await expect(editedCard).toBeVisible();
    await expect(editedCard).toContainText('Edited bio via Playwright.');
  });

  test('AC-1/AC-2 edge: archive then restore a DJ', async ({ page }) => {
    const runId = uniqueSuffix();
    const djName = `E2E Archivable DJ ${runId}`;

    await loginAs(page, MOD_EMAIL, '/mod/roster');

    await page.getByTestId('mod-roster-add').click();
    await page.getByTestId('roster-name').fill(djName);
    await page.getByTestId('roster-save').click();
    const card = page.getByTestId('mod-roster-card').filter({ hasText: djName });
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Archive — confirm, then it disappears from the default (active-only) view.
    await card.getByTestId('mod-roster-archive').click();
    await expect(page.getByTestId('mod-roster-archive-confirm')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('mod-roster-archive-confirm-confirm').click();
    await expect(page.getByTestId('mod-roster-archive-confirm')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId('mod-roster-card').filter({ hasText: djName })).toHaveCount(0, {
      timeout: 10_000,
    });

    // Toggle "show archived" — the card reappears, muted, with the Archived pill.
    await page.getByTestId('mod-roster-show-archived').click();
    const archivedCard = page.getByTestId('mod-roster-card').filter({ hasText: djName });
    await expect(archivedCard).toBeVisible({ timeout: 10_000 });
    await expect(archivedCard).toHaveClass(/opacity-60/);
    await expect(archivedCard).toContainText('Archived');

    // Restore — same button, now labeled "Restore".
    await archivedCard.getByTestId('mod-roster-archive').click();
    await expect(page.getByTestId('mod-roster-archive-confirm')).toContainText('Restore DJ');
    await page.getByTestId('mod-roster-archive-confirm-confirm').click();
    await expect(page.getByTestId('mod-roster-archive-confirm')).toHaveCount(0, { timeout: 10_000 });

    // Still under "show archived" — the same card is now Active and un-muted.
    await expect(archivedCard).not.toHaveClass(/opacity-60/, { timeout: 10_000 });
    await expect(archivedCard).toContainText('Active');
    // Toggle off — restored card shows in the default active-only view too.
    await page.getByTestId('mod-roster-show-archived').click();
    await expect(page.getByTestId('mod-roster-card').filter({ hasText: djName })).toBeVisible();
  });

  test('edge: submitting the "Add DJ" dialog with an empty name surfaces a field error', async ({ page }) => {
    await loginAs(page, MOD_EMAIL, '/mod/roster');
    await expect(async () => {
      const cards = await page.getByTestId('mod-roster-card').count();
      const empty = await page.getByTestId('mod-roster-empty').count();
      expect(cards + empty).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });
    const beforeCount = await page.getByTestId('mod-roster-card').count();

    await page.getByTestId('mod-roster-add').click();
    // Leave the required name field empty and submit directly.
    await page.getByTestId('roster-save').click();

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('alert')).toContainText(/display name/i);
    // Dialog stays open (no card was created).
    await expect(page.getByTestId('roster-name')).toBeVisible();
    await page.getByTestId('roster-cancel').click();
    await expect(page.getByTestId('mod-roster-card')).toHaveCount(beforeCount);
  });

  test('AC-3 edge: mod edits an existing show (time slot) via its schedule cell', async ({ page }) => {
    const runId = uniqueSuffix();
    const djName = `E2E Schedule DJ ${runId}`;
    const showName = `E2E Editable Show ${runId}`;

    await loginAs(page, MOD_EMAIL, '/mod/roster');
    await page.getByTestId('mod-roster-add').click();
    await page.getByTestId('roster-name').fill(djName);
    await page.getByTestId('roster-save').click();
    await expect(page.getByTestId('mod-roster-card').filter({ hasText: djName })).toBeVisible({ timeout: 10_000 });

    await page.goto('/mod/schedule');
    await page.getByTestId('mod-schedule-add').click();
    await page.getByTestId('show-name').fill(showName);
    // Pick a slot distinct from the seeded show and other fixtures in this file.
    await page.getByTestId('show-start').fill('06:00');
    await page.getByTestId('show-end').fill('07:00');
    await page.getByTestId('show-djs-add').click();
    await pickSelectItem(page, djName);
    await page.getByTestId('show-save').click();
    await expect(page.getByTestId('show-name')).toHaveCount(0, { timeout: 10_000 });

    const cellsBeforeEdit = page.getByTestId('mod-schedule-cell').filter({ hasText: showName });
    await expect(cellsBeforeEdit).toHaveCount(3, { timeout: 10_000 }); // MWF default recurrence
    await expect(cellsBeforeEdit.first()).toContainText('06:00–07:00');

    // Reopen via the grid cell, change the time slot, save.
    await cellsBeforeEdit.first().click();
    await expect(page.getByTestId('show-name')).toHaveValue(showName, { timeout: 5_000 });
    await page.getByTestId('show-start').fill('06:30');
    await page.getByTestId('show-end').fill('07:30');
    await page.getByTestId('show-save').click();
    await expect(page.getByTestId('show-name')).toHaveCount(0, { timeout: 10_000 });

    const cellsAfterEdit = page.getByTestId('mod-schedule-cell').filter({ hasText: showName });
    await expect(cellsAfterEdit).toHaveCount(3, { timeout: 10_000 });
    await expect(cellsAfterEdit.first()).toContainText('06:30–07:30');

    // Clean up via the dialog's own delete flow (keeps the grid tidy for other specs).
    await cellsAfterEdit.first().click();
    await page.getByTestId('show-delete').click();
    await page.getByTestId('show-delete-confirm-confirm').click();
    await expect(page.getByTestId('mod-schedule-cell').filter({ hasText: showName })).toHaveCount(0, {
      timeout: 10_000,
    });
  });

  test('AC-4 edge: a Daily show appears in all 7 day columns', async ({ page }) => {
    const runId = uniqueSuffix();
    const djName = `E2E Daily DJ ${runId}`;
    const showName = `E2E Daily Show ${runId}`;

    await loginAs(page, MOD_EMAIL, '/mod/roster');
    await page.getByTestId('mod-roster-add').click();
    await page.getByTestId('roster-name').fill(djName);
    await page.getByTestId('roster-save').click();
    await expect(page.getByTestId('mod-roster-card').filter({ hasText: djName })).toBeVisible({ timeout: 10_000 });

    await page.goto('/mod/schedule');
    await page.getByTestId('mod-schedule-add').click();
    await page.getByTestId('show-name').fill(showName);
    await page.getByTestId('show-recurrence').click();
    await pickSelectItem(page, 'Daily');
    await expect(page.getByTestId('show-recurrence')).toContainText('Daily');
    await page.getByTestId('show-start').fill('05:00');
    await page.getByTestId('show-end').fill('05:30');
    await page.getByTestId('show-djs-add').click();
    await pickSelectItem(page, djName);
    await page.getByTestId('show-save').click();
    await expect(page.getByTestId('show-name')).toHaveCount(0, { timeout: 10_000 });

    const cells = page.getByTestId('mod-schedule-cell').filter({ hasText: showName });
    await expect(cells).toHaveCount(7, { timeout: 10_000 }); // one per weekday

    await cells.first().click();
    await page.getByTestId('show-delete').click();
    await page.getByTestId('show-delete-confirm-confirm').click();
    await expect(page.getByTestId('mod-schedule-cell').filter({ hasText: showName })).toHaveCount(0, {
      timeout: 10_000,
    });
  });

  test('AC-5 edge: station-TZ correction to 05:15 does not roll the row off "today"', async ({ page }) => {
    const runId = uniqueSuffix();
    const { djName } = seedOpenAttendanceRow(runId);

    await loginAs(page, MOD_EMAIL, '/mod/attendance');
    // The date filter already defaults to the station-local date (stationDate()
    // in the page source) — don't overwrite it, see the golden test's note above.
    const row = page.getByTestId('mod-attendance-row').filter({ hasText: djName });
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.getByTestId('mod-attendance-edit').click();
    // This is exactly the edge the golden test's comment calls out as a real
    // app bug when the frontend used the browser's local timezone: a
    // pre-08:00 station-local correction used to roll to the previous UTC
    // calendar day and vanish from "today"'s sheet. station.ts's
    // stationLocalToUtcISO + the backend's stationDayWindowUtc fix that —
    // this asserts the fix holds.
    await page.getByTestId('att-timein').fill('05:15');
    await page.getByTestId('att-save').click();
    await expect(page.getByTestId('att-save')).toHaveCount(0, { timeout: 10_000 }); // dialog closed

    // Reload the sheet (fresh query, same default "today" station date filter)
    // and assert the row is STILL present.
    await page.reload();
    const reloadedRow = page.getByTestId('mod-attendance-row').filter({ hasText: djName });
    await expect(reloadedRow).toBeVisible({ timeout: 10_000 });
    await expect(reloadedRow).toContainText('5:15'); // 12-hour render of 05:15
  });

  test('edge: attendance correction validation — time-out before time-in is rejected', async ({ page }) => {
    const runId = uniqueSuffix();
    const { djName } = seedOpenAttendanceRow(runId);

    await loginAs(page, MOD_EMAIL, '/mod/attendance');
    const row = page.getByTestId('mod-attendance-row').filter({ hasText: djName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    const originalTimeOutCell = await row.locator('td').nth(3).innerText();

    await row.getByTestId('mod-attendance-edit').click();
    await page.getByTestId('att-timein').fill('13:00');
    await page.getByTestId('att-timeout').fill('12:00');
    await page.getByTestId('att-save').click();

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('alert')).toContainText(/time out must be after time in/i);
    // Dialog is still open — the bad submit never reached the server.
    await expect(page.getByTestId('att-save')).toBeVisible();
    await page.getByTestId('att-cancel').click();

    // Row is unchanged.
    await expect(row.locator('td').nth(3)).toHaveText(originalTimeOutCell);
  });

  test('edge: a scheduled DJ with no attendance record renders an Absent pill and no edit button', async ({
    page,
  }) => {
    const runId = uniqueSuffix();
    const { djName } = seedAbsentToday(runId);

    await loginAs(page, MOD_EMAIL, '/mod/attendance');
    const row = page.getByTestId('mod-attendance-row').filter({ hasText: djName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('Absent');
    await expect(row.getByTestId('mod-attendance-edit')).toHaveCount(0);
  });

  test('cross-cutting edge: staff dark mode does not leak onto the public site', async ({ page }) => {
    await loginAs(page, MOD_EMAIL, '/mod/roster');

    const toggle = page.getByTestId('mod-nav-theme-toggle');
    await expect(toggle).toBeVisible();
    // Force a known state: dark on.
    const html = page.locator('html');
    if (!(await html.evaluate((el) => el.classList.contains('dark')))) {
      await toggle.click();
    }
    await expect(html).toHaveClass(/dark/);

    // Client-side nav to the public site via the sidebar link (not page.goto —
    // this exercises the ModLayout/StaffThemeToggle unmount cleanup, which is
    // the actual mechanism preventing the leak, not a full page reload).
    await page.getByTestId('mod-nav-public-site').click();
    await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/, { timeout: 10_000 });
    await expect(html).not.toHaveClass(/dark/, { timeout: 5_000 });
  });
});
