import { test, expect } from '@playwright/test';

// FE#8 /mod/logs: two read-only audit tables (Broadcast activity / Staff
// audit) over useModerationControllerGetBroadcastLogs / *GetAudit.
//
// NOTE on BASE: e2e/mod-access.spec.ts and playwright.config.ts's default
// both hardcode http://localhost:3000, but per project convention (BE 3010 /
// FE 3011) that's stale — this spec uses the documented FE dev port (3011)
// as its fallback instead of copying the stale 3000 default (see
// e2e/mod-queue.spec.ts, which does the same).
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3011';

// Seeded accounts (see e2e/mod-org-schedule-attendance.spec.ts): a MODERATOR
// at mod@example.com and a LISTENER at test@example.com, both Password123!.
// TODO: replace with the project's documented moderator test account if one
// exists elsewhere (reference_playwright_test_account.md or equivalent) —
// this constant is copied from the sibling /mod specs' convention.
const MOD_EMAIL = 'mod@example.com';
const LISTENER_EMAIL = 'test@example.com';
const PASSWORD = 'Password123!';

async function loginAs(page: import('@playwright/test').Page, email: string, next: string) {
  await page.goto(`${BASE}/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(PASSWORD);
  await page.getByTestId('auth-submit').click();
  await page.waitForURL(new RegExp(`${next.replace(/\//g, '\\/')}$`), { timeout: 15_000 });
}

/** Either the table's rows or its typed empty state must be present once the query settles. */
async function expectBroadcastSettled(page: import('@playwright/test').Page) {
  await expect(async () => {
    const rows = await page.getByTestId('mod-logs-row').count();
    const empty = await page.getByTestId('mod-logs-empty').count();
    expect(rows + empty).toBeGreaterThan(0);
  }).toPass({ timeout: 10_000 });
}

test('golden: a MODERATOR visits /mod/logs and sees both tabs + the broadcast activity table', async ({ page }) => {
  await loginAs(page, MOD_EMAIL, '/mod/logs');

  await expect(page.getByTestId('mod-logs-tabs')).toBeVisible();
  await expect(page.getByTestId('mod-logs-tabs-broadcast')).toBeVisible();
  await expect(page.getByTestId('mod-logs-tabs-audit')).toBeVisible();
  await expect(page.getByTestId('mod-logs-tabs-broadcast')).toHaveAttribute('aria-selected', 'true');

  await expect(page.getByTestId('mod-logs-broadcast-table')).toBeVisible();

  // Fresh DB → may render either the empty state or seeded rows; either is fine.
  await expectBroadcastSettled(page);
});

test('edge: switching to Staff audit shows the audit-specific columns', async ({ page }) => {
  await loginAs(page, MOD_EMAIL, '/mod/logs');
  await expectBroadcastSettled(page);

  await page.getByTestId('mod-logs-tabs-audit').click();
  await expect(page.getByTestId('mod-logs-tabs-audit')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('mod-logs-audit-table')).toBeVisible();

  await expect(async () => {
    const rows = await page.getByTestId('mod-logs-row').count();
    const empty = await page.getByTestId('mod-logs-empty').count();
    expect(rows + empty).toBeGreaterThan(0);
  }).toPass({ timeout: 10_000 });

  // Staff audit's column set is Timestamp/Action/Details/Mod/Reason — distinct
  // from broadcast's Timestamp/Event/Details/Triggered by. Assert at least
  // the audit-only "Mod"/"Reason" headers render inside the audit table.
  const auditTable = page.getByTestId('mod-logs-audit-table');
  await expect(auditTable.getByTestId('mod-logs-col-mod')).toBeVisible();
  await expect(auditTable.getByTestId('mod-logs-col-reason')).toBeVisible();
});

// FE#51: the search box is a client-side quick-filter over the already-loaded
// page (see src/lib/mod/log-search.ts's header note — neither log endpoint
// takes a `q` param), so these assert the box narrows the visible rows
// in-place rather than asserting a network refetch.
test('golden: searching the broadcast activity tab narrows visible rows', async ({ page }) => {
  await loginAs(page, MOD_EMAIL, '/mod/logs');
  await expectBroadcastSettled(page);

  await expect(page.getByTestId('mod-logs-search')).toBeVisible();

  const rowsBefore = page.getByTestId('mod-logs-row');
  const countBefore = await rowsBefore.count();

  // A query that shouldn't match any seeded broadcast log entry.
  await page.getByTestId('mod-logs-search').fill('zzz-no-such-log-entry-zzz-e2e');

  if (countBefore > 0) {
    await expect(page.getByTestId('mod-logs-empty')).toBeVisible({ timeout: 5_000 });
  }

  // Clearing the search restores the original row count.
  await page.getByTestId('mod-logs-search').fill('');
  await expect(async () => {
    const count = await page.getByTestId('mod-logs-row').count();
    expect(count).toBe(countBefore);
  }).toPass({ timeout: 5_000 });
});

test('edge: the search box carries over to the Staff audit tab and resets on tab switch', async ({ page }) => {
  await loginAs(page, MOD_EMAIL, '/mod/logs');
  await expectBroadcastSettled(page);

  await page.getByTestId('mod-logs-search').fill('some-broadcast-only-query');

  await page.getByTestId('mod-logs-tabs-audit').click();
  await expect(page.getByTestId('mod-logs-audit-table')).toBeVisible();

  // Switching tabs clears the filter rather than silently carrying a
  // broadcast-shaped query over to the differently-shaped audit rows.
  await expect(page.getByTestId('mod-logs-search')).toHaveValue('');

  await expect(async () => {
    const rows = await page.getByTestId('mod-logs-row').count();
    const empty = await page.getByTestId('mod-logs-empty').count();
    expect(rows + empty).toBeGreaterThan(0);
  }).toPass({ timeout: 10_000 });
});

test('edge: applying a date range refetches the active table', async ({ page }) => {
  await loginAs(page, MOD_EMAIL, '/mod/logs');
  await expectBroadcastSettled(page);

  // A network round-trip to the broadcast-logs endpoint should follow Apply.
  const refetch = page.waitForResponse(
    (res) => res.url().includes('/api/mod/logs/broadcast') && res.request().method() === 'GET',
    { timeout: 10_000 },
  );

  await page.getByTestId('mod-logs-from').fill('2026-01-01');
  await page.getByTestId('mod-logs-to').fill('2026-01-31');
  await page.getByTestId('mod-logs-apply').click();

  await refetch;
  await expectBroadcastSettled(page);
});

test('RBAC edge: a LISTENER visiting /mod/logs is redirected away from /mod', async ({ page }) => {
  await loginAs(page, LISTENER_EMAIL, '/');
  await page.goto(`${BASE}/mod/logs`);
  await expect(page).not.toHaveURL(/\/mod/, { timeout: 8_000 });
});
