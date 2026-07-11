import { expect, test, type Page } from '@playwright/test';

// FE#5 golden path (mod admin): roster + schedule + attendance, proving
// AC-1..AC-5. Edge proves AC-8's RBAC redirect for /mod/roster (mod-access.spec.ts
// already covers the unauthenticated + LISTENER edge for /mod as a whole; this
// spec's edge re-asserts it in the context of the fuller mod admin flow).
//
// Selectors per docs/features/05-fe5-org-schedule-attendance/qa-plan.md and the
// actual page/dialog source (src/app/(staff)/mod/{roster,schedule,attendance}/page.tsx,
// src/components/mod/*).

const MOD_EMAIL = 'mod@example.com';
const LISTENER_EMAIL = 'test@example.com';
const PASSWORD = 'Password123!';

function uniqueSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function loginAs(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(PASSWORD);
  await page.getByTestId('auth-submit').click();
  await page.waitForURL(new RegExp(`${next.replace(/\//g, '\\/')}$`), { timeout: 15_000 });
}

/**
 * Picks a Radix `<Select>` item by its exact visible text using pure keyboard
 * navigation (ArrowDown + Enter). Required here (see the app-bug note at the
 * "show-djs-add" call site below) because this Select is opened from inside a
 * Dialog, where its popover is stacked behind the Dialog's own overlay —
 * pointer clicks (even `force: true`) never reach the option. Typeahead
 * (typing the label) is too timing-sensitive when several roster entries
 * share a common prefix (e.g. repeated "E2E DJ …" runs), so this walks
 * ArrowDown to the exact index instead, which is deterministic.
 * Assumes the trigger is already open (`select-item`s are visible in the DOM,
 * even if the popover as a whole is not the top-most element).
 */
async function pickSelectItemByKeyboard(page: Page, exactText: string) {
  const items = page.locator('[data-slot="select-item"]');
  const count = await items.count();
  await expect(items.filter({ hasText: exactText })).toHaveCount(1);

  // Walk ArrowDown, checking `document.activeElement`'s text after each press
  // (Radix moves real DOM focus between items via roving tabindex — the
  // `data-highlighted` attribute does not reflect keyboard nav, only pointer
  // hover, so it can't be used here) — more robust than guessing a fixed
  // offset, since the very first item is already focused on open.
  const maxAttempts = (count + 2) * 4;
  for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
    const activeText = await page.evaluate(() => document.activeElement?.textContent?.trim());
    if (activeText === exactText) break;
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(60);
  }
  await page.keyboard.press('Enter');
}

test.describe.configure({ mode: 'serial' });

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
    // Assign the DJ just added above.
    //
    // NOTE (app bug, worked around here via keyboard, not by editing source):
    // shadcn Select popovers render at z-50 (src/components/ui/select.tsx)
    // while the Dialog overlay is z-[80] (src/components/ui/dialog.tsx). Any
    // Select opened from inside a Dialog (this one, roster-status,
    // show-recurrence) is therefore visually and pointer-wise BEHIND the
    // dialog's own overlay: `document.elementFromPoint` over an open option
    // resolves to the `dialog-overlay` div, not the option. A real mouse user
    // cannot pick a DJ here at all, and even a Playwright `.click({ force:
    // true })` on the option element does not register a selection (verified:
    // no chip appears) — Radix's pointer-capture handling for the item
    // apparently depends on the same broken hit-test. `pickSelectItemByKeyboard`
    // below (ArrowDown navigation + Enter) does not hit-test and reliably
    // drives the real `onValueChange` handler, so it's used to keep this
    // golden path exercising genuine business logic. The z-index bug itself
    // is reported precisely in the task summary — it was not fixed here per
    // the "don't edit app source to work around it" instruction.
    await page.getByTestId('show-djs-add').click();
    await pickSelectItemByKeyboard(page, djName);
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
});
