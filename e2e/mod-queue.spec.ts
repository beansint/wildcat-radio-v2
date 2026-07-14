import { test, expect } from '@playwright/test';

// FE#8 /mod/queue: reports/watch-flags/appeals/reinstatement queue.
//
// NOTE on BASE: e2e/mod-access.spec.ts and playwright.config.ts's default
// both hardcode http://localhost:3000, but per project convention (BE 3010 /
// FE 3011) that's stale — this spec uses the documented FE dev port (3011)
// as its fallback instead of copying the stale 3000 default.
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3011';

// Seeded accounts (see e2e/mod-org-schedule-attendance.spec.ts): a MODERATOR
// at mod@example.com and a LISTENER at test@example.com, both Password123!.
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

test('golden: a MODERATOR visits /mod/queue and sees the tab bar + queue stack', async ({ page }) => {
  await loginAs(page, MOD_EMAIL, '/mod/queue');

  await expect(page.getByTestId('mod-queue-tabs')).toBeVisible();
  await expect(page.getByTestId('mod-queue-tabs-all')).toBeVisible();
  await expect(page.getByTestId('mod-queue-tabs-reports')).toBeVisible();
  await expect(page.getByTestId('mod-queue-tabs-flags')).toBeVisible();
  await expect(page.getByTestId('mod-queue-tabs-appeals')).toBeVisible();
  await expect(page.getByTestId('mod-queue-tabs-reinstatements')).toBeVisible();

  // Either the empty state or at least one card renders once the query settles.
  await expect(async () => {
    const cards = await page.getByTestId('mod-queue-card').count();
    const empty = await page.getByTestId('mod-queue-empty').count();
    expect(cards + empty).toBeGreaterThan(0);
  }).toPass({ timeout: 10_000 });
});

test('edge: filtering by a tab changes the visible cards', async ({ page }) => {
  await loginAs(page, MOD_EMAIL, '/mod/queue');

  await expect(async () => {
    const cards = await page.getByTestId('mod-queue-card').count();
    const empty = await page.getByTestId('mod-queue-empty').count();
    expect(cards + empty).toBeGreaterThan(0);
  }).toPass({ timeout: 10_000 });

  const allCount = await page.getByTestId('mod-queue-card').count();

  // Reports-only tab should never show more cards than "All".
  await page.getByTestId('mod-queue-tabs-reports').click();
  await expect(async () => {
    const reportsCount = await page.getByTestId('mod-queue-card').count();
    expect(reportsCount).toBeLessThanOrEqual(allCount);
  }).toPass({ timeout: 10_000 });

  // Switching to a tab with no seeded data at all renders the typed empty state.
  await page.getByTestId('mod-queue-tabs-reinstatements').click();
  const reinstatementCount = await page.getByTestId('mod-queue-card').count();
  if (reinstatementCount === 0) {
    await expect(page.getByTestId('mod-queue-empty')).toBeVisible({ timeout: 10_000 });
  }

  // Back to "All" restores the original count.
  await page.getByTestId('mod-queue-tabs-all').click();
  await expect(async () => {
    expect(await page.getByTestId('mod-queue-card').count()).toBe(allCount);
  }).toPass({ timeout: 10_000 });
});

test('RBAC edge: a LISTENER visiting /mod/queue is redirected away from /mod', async ({ page }) => {
  await loginAs(page, LISTENER_EMAIL, '/');
  await page.goto(`${BASE}/mod/queue`);
  await expect(page).not.toHaveURL(/\/mod/, { timeout: 8_000 });
});
