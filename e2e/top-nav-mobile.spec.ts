import { expect, test } from '@playwright/test';

/**
 * Logged-out top nav at phone widths: the wordmark used to wrap under the
 * Sign in pill at 360px. The brand link must never meet Sign in, and the page
 * must not scroll sideways. Listen live leaves the header below 640px (the
 * drawer and the player still link to /listen).
 */
const WIDTHS = [
  { width: 320, wordmark: false, listenLive: false },
  { width: 360, wordmark: true, listenLive: false },
  { width: 412, wordmark: true, listenLive: false },
  { width: 640, wordmark: true, listenLive: true },
  { width: 1280, wordmark: true, listenLive: true },
];

for (const { width, wordmark, listenLive } of WIDTHS) {
  test(`NAV-M: header fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/listen');
    const nav = page.getByRole('banner').first();
    const signIn = nav.getByRole('link', { name: 'Sign in' });
    await expect(signIn).toBeVisible({ timeout: 15_000 });

    const home = nav.getByRole('link', { name: 'Wildcat Radio home' });
    await expect(home).toBeVisible();
    const brand = (await home.boundingBox())!;
    const sign = (await signIn.boundingBox())!;
    expect(brand.x + brand.width).toBeLessThanOrEqual(sign.x);

    await expect(nav.getByText('Wildcat Radio', { exact: true })).toBeVisible({ visible: wordmark });
    await expect(nav.getByRole('link', { name: 'Listen live' })).toBeVisible({ visible: listenLive });

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(width);
  });
}

test('NAV-M: Listen live stays one tap away in the drawer on phones', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('complementary', { name: 'Site navigation' }).getByRole('link', { name: /listen live/i })).toBeVisible();
});
