import { expect, test, type APIRequestContext } from '@playwright/test';
import { API_BASE, apiLoginAs, archiveAnnouncement, createAnnouncement, pinAnnouncement } from './_fixtures';

let api: APIRequestContext;
const rows: Array<{ id: string; title: string }> = [];
const prefix = `Public pagination ${Date.now()}`;

test.beforeAll(async () => {
  const url = new URL(API_BASE);
  if (url.hostname !== 'localhost' || url.port !== '3310') throw new Error('Fixtures require isolated local API3310');
  api = await apiLoginAs('moderator');
  for (let i = 0; i < 105; i += 1) {
    const title = `${prefix} ${i}`;
    const row = await createAnnouncement(api, { title });
    rows.push({ id: row.id, title });
    const response = await api.post(`/api/announcements/${row.id}/publish`, { data: {} });
    expect(response.ok()).toBeTruthy();
  }
  await pinAnnouncement(api, rows[0].id);
});
test.afterAll(async () => {
  for (const { id } of rows) {
    const response = await api.get(`/api/announcements/admin/${id}`);
    if ((await response.json()).status !== 'ARCHIVED') await archiveAnnouncement(api, id);
  }
  await api.dispose();
});

test('AC-1: keyboard paging exposes all105 records without duplicating the pinned hero', async ({ page }) => {
  await page.goto('/announcements');
  const cards = page.getByTestId('public-announcement-card');
  await expect(cards).toHaveCount(100);
  await expect(cards.filter({ hasText: rows[0].title })).toHaveCount(1);
  const first = await cards.evaluateAll((els) => els.map((el) => el.getAttribute('href')));
  const next = page.getByTestId('public-ann-pagination-next');
  await expect(next).toBeEnabled();
  await next.focus();
  await expect(next).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(cards).toHaveCount(5);
  const second = await cards.evaluateAll((els) => els.map((el) => el.getAttribute('href')));
  expect(new Set([...first, ...second]).size).toBe(105);
  await expect(next).toBeDisabled();
  await page.getByTestId('public-ann-pagination-prev').click();
  await expect(cards).toHaveCount(100);
});

test('AC-2: failed next page has truthful error and keyboard retry preserves page', async ({ page }) => {
  await page.goto('/announcements');
  await expect(page.getByTestId('public-announcement-card')).toHaveCount(100);
  await page.route('**/api/announcements?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('page') === '2') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary test outage' }) });
    } else await route.continue();
  });
  await expect(page.getByTestId('public-ann-pagination-next')).toBeEnabled();
  await page.getByTestId('public-ann-pagination-next').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Temporary test outage' })).toBeVisible();
  await expect(page.getByTestId('public-announcement-card')).toHaveCount(0);
  await page.unroute('**/api/announcements?*');
  const retry = page.getByTestId('public-ann-pagination-retry');
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('public-announcement-card')).toHaveCount(5);
  await expect(page.getByTestId('public-ann-pagination-prev')).toBeEnabled();
});

test('AC-3: actual empty collection has no paging controls', async ({ page }) => {
  for (const { id } of rows) await archiveAnnouncement(api, id);
  await page.goto('/announcements');
  await expect(page.getByTestId('public-empty')).toBeVisible();
  await expect(page.getByTestId('public-ann-pagination-next')).toHaveCount(0);
});
