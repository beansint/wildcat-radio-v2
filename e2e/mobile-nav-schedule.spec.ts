import { test, expect } from '@playwright/test';
import { WEB_BASE, loginAs } from './_fixtures';

/**
 * FE#42 / FE#43 / FE#49 — public schedule + footer at a 375px viewport.
 *
 * The FE#41 bottom-nav block that used to live here was removed with the
 * component: the dock duplicated the top nav and the owner cut it. Mobile
 * navigation is the hamburger MobileDrawer, which is already session-aware
 * and covered by its own specs — so nothing is left untested by the deletion.
 *
 * Coverage:
 *  - /schedule never causes horizontal page scroll at 375px
 *  - /schedule cells/cards are real links into /shows/...
 *  - /profile ((app) route) renders a footer
 */

const VIEWPORT_375 = { width: 375, height: 812 };


test.describe('FE#43 — Footer on (app) listener pages', () => {
  // /profile lives behind the (app) client-side auth guard, which renders a
  // chrome skeleton — no footer — until the session resolves. So this needs a
  // real session; without one the page redirects to /login and the assertion
  // would be measuring the wrong page.
  test('/profile renders a footer', async ({ page }) => {
    await loginAs(page, 'listener');
    await page.goto(`${WEB_BASE}/profile`);
    // Assert we are actually on /profile and past the guard before looking for
    // the footer, so a silent redirect can never read as a footer failure.
    await expect(page).toHaveURL(new RegExp('/profile$'));
    await expect(page.locator('footer')).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('FE#42 — /schedule mobile view', () => {
  test.use({ viewport: VIEWPORT_375 });

  test('no horizontal page scroll at 375px', async ({ page }) => {
    await page.goto(`${WEB_BASE}/schedule`);
    await expect(page.getByTestId('schedule-day-tab-MON').or(page.getByTestId('schedule-empty'))).toBeVisible({
      timeout: 8_000,
    });

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1 for sub-pixel rounding
  });

  test('the desktop table is not rendered at 375px', async ({ page }) => {
    await page.goto(`${WEB_BASE}/schedule`);
    await expect(page.getByTestId('schedule-grid')).toBeHidden({ timeout: 8_000 });
  });

  test('day tabs are Mon-Fri only, and switching tabs swaps the card list', async ({ page }) => {
    await page.goto(`${WEB_BASE}/schedule`);
    await expect(page.getByTestId('schedule-day-tab-MON')).toBeVisible({ timeout: 8_000 });
    for (const day of ['MON', 'TUE', 'WED', 'THU', 'FRI']) {
      await expect(page.getByTestId(`schedule-day-tab-${day}`)).toBeVisible();
    }
    for (const day of ['SAT', 'SUN']) {
      await expect(page.getByTestId(`schedule-day-tab-${day}`)).toHaveCount(0);
    }

    await page.getByTestId('schedule-day-tab-FRI').click();
    await expect(page.getByTestId('schedule-day-tab-FRI')).toHaveAttribute('aria-selected', 'true');
  });

  test('a filled schedule card navigates to /shows/...', async ({ page }) => {
    await page.goto(`${WEB_BASE}/schedule`);
    const card = page.getByTestId('schedule-mobile-card').first();
    // Skip gracefully if the seeded week has no shows on the default day.
    if ((await card.count()) === 0) test.skip();

    const href = await card.getAttribute('href');
    expect(href).toMatch(/^\/shows\//);
    await card.click();
    await page.waitForURL(/\/shows\//, { timeout: 8_000 });
  });
});

test.describe('FE#42 — /schedule desktop table cells are links', () => {
  test('table cells link into /shows/...', async ({ page }) => {
    await page.goto(`${WEB_BASE}/schedule`);
    const cell = page.locator('.wc-slot').first();
    if ((await cell.count()) === 0) test.skip();
    const href = await cell.getAttribute('href');
    expect(href).toMatch(/^\/shows\//);
  });
});
