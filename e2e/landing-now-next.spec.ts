import { expect, test } from '@playwright/test';
import { WEB_BASE } from './_fixtures';

/**
 * Landing "Now & next" — regression guard for the launch fix that replaced a
 * hardcoded mock (fake show "Afternoon Vibes" with fake DJs "DJ Mara" and
 * "DJ Ben", fake 2:00–4:00 PM slot) with the real public schedule.
 *
 * The section must never show the mock's fabricated DJ names, and must never
 * claim "On air" while the stream is not actually LIVE.
 */

test.describe('landing now & next', () => {
  test('never renders the retired mock DJs or a false on-air claim', async ({ page }) => {
    await page.goto(WEB_BASE);
    const main = page.locator('main');
    await expect(main).toBeVisible();

    // The fabricated mock names must be gone for good.
    await expect(main).not.toContainText('DJ Mara');
    await expect(main).not.toContainText('DJ Ben');

    // "On air" inside the Now & next section requires an actually-LIVE stream.
    const manifest = await page.request.get('http://localhost:3010/api/stream/manifest');
    const { status } = (await manifest.json()) as { status: string };
    const nowNext = page.locator('section', { hasText: 'Now & next' }).first();
    if ((await nowNext.count()) > 0 && status !== 'LIVE') {
      await expect(nowNext.locator('.wc-badge-live')).toHaveCount(0);
    }
  });
});
