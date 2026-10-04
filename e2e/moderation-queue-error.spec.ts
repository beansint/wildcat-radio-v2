import { expect, test, type APIRequestContext } from '@playwright/test';
import { API_BASE, apiLoginAs, loginAs } from './_fixtures';

let staff: APIRequestContext;
let reporter: APIRequestContext;
let reportId: string;
const reason = `Queue recovery ${Date.now()}`;
test.beforeAll(async () => {
  const url = new URL(API_BASE);
  if (url.hostname !== 'localhost' || url.port !== '3310') throw new Error('Fixtures require isolated API3310');
  staff = await apiLoginAs('custodian');
  reporter = await apiLoginAs('listener');
  const target = await apiLoginAs('moderator');
  const me = await target.get('/api/users/me');
  expect(me.ok()).toBeTruthy();
  const targetUserId = (await me.json()).id;
  await target.dispose();
  const response = await reporter.post('/api/mod/reports', { data: { targetUserId, reason } });
  expect(response.ok()).toBeTruthy();
  reportId = (await response.json()).id;
});
test.afterAll(async () => {
  if (reportId) {
    const response = await staff.post(`/api/mod/reports/${reportId}/resolve`, { data: { status: 'DISMISSED', reason: 'Isolated browser fixture cleanup' } });
    expect(response.ok()).toBeTruthy();
  }
  await staff.dispose();
  await reporter.dispose();
});
for (const status of [503, 401]) {
  test(`AC-${status}: failed queue is not empty and keyboard retry recovers real backlog`, async ({ page }) => {
    await loginAs(page, 'moderator');
    await page.route('**/api/mod/queue', (route) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ message: status === 401 ? 'Session expired' : 'Queue unavailable' }) }));
    await page.goto('/mod/queue');
    await expect(page.getByTestId('mod-queue-error')).toBeVisible({ timeout: 12_000 });
    await expect(page.getByTestId('mod-queue-empty')).toHaveCount(0);
    await expect(page.getByTestId('mod-queue-card')).toHaveCount(0);
    if (status === 401) await expect(page.getByTestId('mod-queue-error')).toContainText('Session expired');
    await page.unroute('**/api/mod/queue');
    const retry = page.getByTestId('mod-queue-retry');
    await retry.focus();
    await expect(retry).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('mod-queue-card').filter({ hasText: reason })).toBeVisible();
    await expect(page.getByTestId('mod-queue-error')).toHaveCount(0);
  });
}
