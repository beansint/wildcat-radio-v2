import { expect, test, type APIRequestContext } from '@playwright/test';
import { API_BASE, apiLoginAs, archiveAnnouncement, createAnnouncement, loginAs } from './_fixtures';

let api: APIRequestContext;
const rows: Array<{ id: string; title: string }> = [];
const prefix = `Pagination ${Date.now()}`;

test.beforeAll(async () => {
  const url = new URL(API_BASE);
  if (url.hostname !== 'localhost' || url.port !== '3310') throw new Error('Pagination fixtures require the isolated local API on3310');
  api = await apiLoginAs('moderator');
  for (let i = 0; i < 105; i += 1) {
    const title = `${prefix} ${i}`;
    const row = await createAnnouncement(api, { title, content: 'Staff pagination regression.' });
    rows.push({ id: row.id, title });
  }
});

test.afterAll(async () => {
  for (const { id } of rows) {
    const response = await api.get(`/api/announcements/admin/${id}`);
    if ((await response.json()).status !== 'ARCHIVED') await archiveAnnouncement(api, id);
  }
  await api.dispose();
});

test.beforeEach(async ({ page }) => {
  await loginAs(page, 'moderator');
  await page.goto('/mod/announcements');
  await page.getByTestId('mod-ann-tabs-draft').click();
});

test('AC-1: older records remain editable past the hundred-row cap', async ({ page }) => {
  await expect(page.getByTestId('mod-ann-row')).toHaveCount(100);
  await expect(page.getByTestId('mod-ann-pagination-next')).toBeEnabled();
  await page.getByTestId('mod-ann-pagination-next').focus();
  await expect(page.getByTestId('mod-ann-pagination-next')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('mod-ann-row')).toHaveCount(5);
  await expect(page.getByTestId('mod-ann-row').filter({ hasText: rows[0].title })).toBeVisible();
  await page.getByTestId('mod-ann-pagination-prev').click();
  await expect(page.getByTestId('mod-ann-row')).toHaveCount(100);
  await expect(page.getByTestId('mod-ann-row').filter({ hasText: rows[104].title })).toBeVisible();
});

test('AC-2: selecting another status resets the page', async ({ page }) => {
  await page.getByTestId('mod-ann-pagination-next').click();
  await expect(page.getByTestId('mod-ann-row')).toHaveCount(5);
  await page.getByTestId('mod-ann-tabs-archived').click();
  await expect(page.getByTestId('mod-ann-pagination-prev')).toBeDisabled();
  await page.getByTestId('mod-ann-tabs-draft').click();
  await expect(page.getByTestId('mod-ann-row')).toHaveCount(100);
  await expect(page.getByTestId('mod-ann-pagination-prev')).toBeDisabled();
});

test('AC-3: publishing the final draft page returns to remaining drafts', async ({ page }) => {
  await page.getByTestId('mod-ann-pagination-next').click();
  await expect(page.getByTestId('mod-ann-row')).toHaveCount(5);
  for (let remaining = 5; remaining > 0; remaining -= 1) {
    await page.getByTestId('mod-ann-row').first().getByTestId('mod-ann-publish').click();
    await page.getByTestId('mod-ann-publish-confirm').click();
    await expect(page.getByTestId('mod-ann-row')).toHaveCount(remaining === 1 ? 100 : remaining - 1);
  }
  await expect(page.getByTestId('mod-ann-pagination-next')).toBeDisabled();
  await expect(page.getByTestId('mod-ann-pagination-prev')).toBeDisabled();
});
