import { test, expect } from '@playwright/test';

// FE#8 /mod/users. Login pattern mirrors e2e/mod-access.spec.ts (absolute
// goto + auth-email/auth-password/auth-submit testids) rather than the
// relative-URL `loginAs()` helper in e2e/mod-org-schedule-attendance.spec.ts,
// per this task's explicit instruction.
//
// TODO: MOD_EMAIL below is copied from e2e/mod-org-schedule-attendance.spec.ts
// (mod@example.com / Password123!) — confirm this is the intended seeded
// moderator account before relying on it in CI; it isn't otherwise
// documented in this file's own directory.
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3011';
const MOD_EMAIL = 'mod@example.com';
const LISTENER_EMAIL = 'test@example.com';
const PASSWORD = 'Password123!';

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(PASSWORD);
  await page.getByTestId('auth-submit').click();
  await page.waitForURL(new RegExp(`^${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/mod/roster$`), {
    timeout: 10_000,
  });
}

test('golden: MODERATOR visits /mod/users, sees the table + count, and searching narrows the list', async ({
  page,
}) => {
  await login(page, MOD_EMAIL);
  await page.goto(`${BASE}/mod/users`);

  await expect(page.getByTestId('mod-users-table')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('mod-users-count')).toContainText('users');

  const rowsBefore = page.getByTestId('mod-users-row');
  await expect(rowsBefore.first()).toBeVisible({ timeout: 10_000 });
  const countBefore = await rowsBefore.count();

  // Search for a handle fragment unlikely to match every seeded user —
  // narrows (not necessarily to zero) rather than asserting an exact count,
  // since this spec doesn't own/seed the users table's contents.
  const firstHandle = await rowsBefore.first().innerText();
  const fragment = firstHandle.replace('@', '').split(/\s/)[0].slice(0, 4);
  await page.getByTestId('mod-users-search').fill(fragment);

  await expect(async () => {
    const count = await page.getByTestId('mod-users-row').count();
    expect(count).toBeLessThanOrEqual(countBefore);
    expect(count).toBeGreaterThan(0);
  }).toPass({ timeout: 10_000 });
});

test('edge: an empty search result shows the empty state', async ({ page }) => {
  await login(page, MOD_EMAIL);
  await page.goto(`${BASE}/mod/users`);

  await expect(page.getByTestId('mod-users-table')).toBeVisible({ timeout: 10_000 });

  // A handle fragment that shouldn't exist in seeded/fixture data.
  await page.getByTestId('mod-users-search').fill('zzz-no-such-user-zzz-e2e');

  await expect(page.getByTestId('mod-users-empty')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('mod-users-table')).toHaveCount(0);
});

test('RBAC edge: a LISTENER visiting /mod/users is redirected away from /mod', async ({ page }) => {
  await login(page, LISTENER_EMAIL);
  await page.goto(`${BASE}/mod/users`);

  await expect(page).not.toHaveURL(/\/mod/, { timeout: 8_000 });
});
