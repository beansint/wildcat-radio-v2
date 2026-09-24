import { test, expect } from '@playwright/test';
import { loginAs } from './_fixtures';

// FE#8 /mod/users. Login uses the shared role-aware `loginAs()` helper from
// _fixtures: this file's original inline helper waited for /mod/roster after
// sign-in, which no longer holds for LISTENER (#64 made post-login routing
// role-aware — listeners land on /), so the RBAC edge below could not even
// reach its own assertion.
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3011';

test('golden: MODERATOR visits /mod/users, sees the table + count, and searching narrows the list', async ({
  page,
}) => {
  await loginAs(page, 'moderator');
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
  await loginAs(page, 'moderator');
  await page.goto(`${BASE}/mod/users`);

  await expect(page.getByTestId('mod-users-table')).toBeVisible({ timeout: 10_000 });

  // A handle fragment that shouldn't exist in seeded/fixture data.
  await page.getByTestId('mod-users-search').fill('zzz-no-such-user-zzz-e2e');

  await expect(page.getByTestId('mod-users-empty')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('mod-users-table')).toHaveCount(0);
});

test('RBAC edge: a LISTENER visiting /mod/users is redirected away from /mod', async ({ page }) => {
  await loginAs(page, 'listener');
  await page.goto(`${BASE}/mod/users`);

  await expect(page).not.toHaveURL(/\/mod/, { timeout: 8_000 });
});
