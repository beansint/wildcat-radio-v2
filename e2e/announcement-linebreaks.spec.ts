import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiLoginAs, archiveAnnouncement, createAnnouncement } from './_fixtures';

let api: APIRequestContext;
const ids: string[] = [];

test.beforeAll(async () => { api = await apiLoginAs('moderator'); });
test.afterAll(async () => {
  for (const id of ids) await archiveAnnouncement(api, id);
  await api.dispose();
});

async function publish(content: string) {
  const row = await createAnnouncement(api, { title: 'Line break regression', content });
  ids.push(row.id);
  const response = await api.post(`/api/announcements/${row.id}/publish`, { data: {} });
  expect(response.ok()).toBeTruthy();
  return `/announcements/${row.slug}-${row.publicId}`;
}

test('AC-1: public announcement preserves consecutive text lines', async ({ page }) => {
  await page.goto(await publish('Time: 10 AM\nLocation: Studio\n\nSee you there.'));
  const first = page.getByTestId('public-announcement-body').locator('p').first();
  await expect(first).toContainText('Time: 10 AM\nLocation: Studio');
  await expect(first).toHaveCSS('white-space', 'pre-line');
  const dimensions = await first.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  }));
  expect(dimensions.height).toBeGreaterThan(dimensions.lineHeight * 1.5);
});

test('AC-2: blank paragraphs and HTML-like content stay plain text', async ({ page }) => {
  await page.goto(await publish('<script>unsafe()</script>\nPlain text\n\nNext paragraph'));
  const body = page.getByTestId('public-announcement-body');
  await expect(body.locator('p')).toHaveCount(2);
  await expect(body.locator('script')).toHaveCount(0);
  await expect(body.locator('p').first()).toHaveCSS('white-space', 'pre-line');
  await expect(body.locator('p').last()).toHaveText('Next paragraph');
});
