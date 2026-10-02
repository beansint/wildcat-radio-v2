import { expect, test } from '@playwright/test';
import { WEB_BASE, loginAs } from './_fixtures';

/**
 * Public shell regressions: footer placement, the listen stage overlap, the
 * minimizable player and the avatar account menu.
 */

test.describe('public shell layout', () => {
  test('SHELL-01: on a short page the footer sits at the viewport bottom with no bare strip below it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(`${WEB_BASE}/listen`);
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    const { bottom, docHeight, viewport } = await footer.evaluate((el) => ({
      bottom: el.getBoundingClientRect().bottom + window.scrollY,
      docHeight: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
    }));
    expect(Math.round(bottom)).toBe(docHeight);
    expect(docHeight).toBeGreaterThanOrEqual(viewport);
  });

  test('SHELL-02: the listen stage is not shoved down onto the footer (sticky, not relative+top)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(`${WEB_BASE}/listen`);
    const stage = page.locator('main section.wc-grad-maroon').first();
    await expect(stage).toBeVisible();
    expect(await stage.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    const [stageBox, footerBox] = await Promise.all([
      stage.boundingBox(),
      page.locator('footer').boundingBox(),
    ]);
    expect(stageBox!.y + stageBox!.height).toBeLessThanOrEqual(footerBox!.y);
  });
});

test.describe('minimizable player', () => {
  test('SHELL-03: minimize → pill with focus on Expand, persists across navigation, expand restores focus', async ({ page }) => {
    await page.goto(`${WEB_BASE}/`);
    await page.getByTestId('player-minimize').click();
    await expect(page.getByTestId('player-mini')).toBeVisible();
    await expect(page.getByTestId('player-expand')).toBeFocused();
    // One audio element in both modes — collapsing must not remount it.
    await expect(page.getByTestId('player-audio')).toHaveCount(1);

    await page.goto(`${WEB_BASE}/schedule`);
    await expect(page.getByTestId('player-mini')).toBeVisible();
    await expect(page.getByTestId('player-play')).toBeVisible();

    await page.getByTestId('player-expand').click();
    await expect(page.getByTestId('player-mini')).toHaveCount(0);
    await expect(page.getByTestId('player-minimize')).toBeFocused();
  });

  test('SHELL-04: blocked storage still lets the player toggle (in-memory)', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('blocked');
        },
      });
    });
    await page.goto(`${WEB_BASE}/`);
    await page.getByTestId('player-minimize').click();
    await expect(page.getByTestId('player-mini')).toBeVisible();
  });
});

test.describe('account menu', () => {
  test('SHELL-05: avatar opens profile/settings/sign-out menu, keyboard operable', async ({ page }) => {
    await loginAs(page, 'listener');
    await page.goto(`${WEB_BASE}/`);
    const trigger = page.getByTestId('account-menu-trigger');
    await trigger.click();
    const menu = page.getByTestId('account-menu');
    await expect(menu).toBeVisible();
    await expect(page.getByTestId('account-menu-profile')).toHaveAttribute('href', '/profile');
    await expect(page.getByTestId('account-menu-signout')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await page.keyboard.press('Enter');
    await page.getByTestId('account-menu-profile').click();
    await expect(page).toHaveURL(/\/profile$/);
  });

  test('SHELL-06: sign out from the menu ends the session', async ({ page }) => {
    await loginAs(page, 'listener');
    await page.goto(`${WEB_BASE}/`);
    await page.getByTestId('account-menu-trigger').click();
    await page.getByTestId('account-menu-signout').click();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('account-menu-trigger')).toHaveCount(0);
  });
});
