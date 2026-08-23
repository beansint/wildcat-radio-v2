import { expect, test } from '@playwright/test';
import { ACCOUNTS, PASSWORD, WEB_BASE, loginAs } from './_fixtures';

test.describe('staff entry and RBAC navigation', () => {
  test('moderator can return home and re-enter the staff console', async ({ page }) => {
    await loginAs(page, 'moderator');
    await page.goto(`${WEB_BASE}/`);

    const staffLink = page.getByTestId('staff-console-link');
    await expect(staffLink).toHaveAttribute('href', '/mod/roster');
    await staffLink.click();
    await expect(page).toHaveURL(/\/mod\/roster$/);
    await expect(page.getByTestId('mod-nav-staff-review')).toHaveCount(0);
    await expect(page.getByTestId('mod-nav-escalations')).toHaveCount(0);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${WEB_BASE}/`);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByTestId('staff-console-link-mobile')).toHaveAttribute('href', '/mod/roster');

    await page.goto(`${WEB_BASE}/admin/staff`);
    await expect(page).toHaveURL(/\/mod\/roster$/);
  });

  test('custodian sees the shared console and custodian-only navigation', async ({ page }) => {
    await loginAs(page, 'custodian');
    await expect(page).toHaveURL(/\/mod\/roster$/);
    await expect(page.getByTestId('mod-nav-staff-review')).toBeVisible();
    await expect(page.getByTestId('mod-nav-escalations')).toBeVisible();
  });

  test('listener has no staff entry action', async ({ page }) => {
    await loginAs(page, 'listener');
    await expect(page.getByTestId('staff-console-link')).toHaveCount(0);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${WEB_BASE}/`);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByTestId('staff-console-link-mobile')).toHaveCount(0);
  });

  test('moderator login preserves an explicit deep link', async ({ page }) => {
    await page.goto(`${WEB_BASE}/login?next=${encodeURIComponent('/mod/queue')}`);
    await page.getByTestId('auth-email').fill(ACCOUNTS.moderator);
    await page.getByTestId('auth-password').fill(PASSWORD);
    await page.getByTestId('auth-submit').click();
    await expect(page).toHaveURL(/\/mod\/queue$/);
  });

});
