import { expect } from '@playwright/test';
import { API_BASE } from './_fixtures';
import { test, openProfile, setProfileConsent, saveProfile, profileData, activeProfileConsents } from './_profile-fixtures';

test.beforeEach(async ({ page, profileAccount }) => {
  await openProfile(page, profileAccount);
  await expect(page.getByTestId('profile-year')).toContainText('2nd year');
  await expect(page.getByRole('button', { name: 'Woman', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('AC-1: opt-out survives reload and demographics cannot write pending preference edits', async ({ page, profileAccount }) => {
  await expect(page.getByTestId('notif-inapp')).not.toBeChecked();
  await page.getByTestId('notif-inapp').click();
  await page.getByRole('button', { name: 'Man', exact: true }).click();
  await setProfileConsent(page, true);
  const body = await saveProfile(page);
  expect(body).not.toHaveProperty('notifyInApp');
  expect(body).not.toHaveProperty('notifyEmail');
  expect(body.gender).toBe('male');
  expect(await profileData(profileAccount)).toMatchObject({ notifyEmail: false, notifyInApp: false, gender: 'male' });
  await page.reload();
  await expect(page.getByTestId('notif-inapp')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Man', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('profile-consent')).toBeChecked();
});

test('AC-2: clear works without consent, persists nulls, and stays cleared after reload', async ({ page, profileAccount }) => {
  await expect(page.getByTestId('profile-consent')).not.toBeChecked();
  await page.getByRole('button', { name: 'Clear optional fields', exact: true }).click();
  // Clear prepares the form; persistence is explicit through Save.
  expect(await profileData(profileAccount)).toMatchObject({ yearLevel: '2', college: 'CCS — Computer Studies', gender: 'female' });
  await expect(page.getByTestId('profile-save')).toBeEnabled();
  const body = await saveProfile(page);
  expect(body).toMatchObject({ yearLevel: null, college: null, gender: null });
  expect(body).not.toHaveProperty('demographicsConsent');
  expect(await profileData(profileAccount)).toMatchObject({ yearLevel: null, college: null, gender: null, notifyInApp: false, notifyEmail: false });
  expect((await activeProfileConsents(profileAccount)).length).toBe(0);
  await page.reload();
  await expect(page.getByTestId('profile-year')).toContainText('Select year');
  await expect(page.getByTestId('profile-college')).toContainText('Select college');
  await expect(page.getByRole('button', { name: 'Woman', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('profile-consent')).not.toBeChecked();
});

test('AC-3: keyboard preference save writes only supported preference and preserves demographics', async ({ page, profileAccount }) => {
  await page.getByTestId('notif-inapp').focus();
  await page.keyboard.press('Space');
  const pending = page.waitForResponse(response => response.url() === `${API_BASE}/api/users/me` && response.request().method() === 'PATCH');
  await page.getByTestId('profile-notification-save').click();
  const response = await pending;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toEqual({ notifyInApp: true });
  await expect(page.getByTestId('profile-notification-saved')).toBeVisible();
  expect(await profileData(profileAccount)).toMatchObject({ yearLevel: '2', college: 'CCS — Computer Studies', gender: 'female', notifyInApp: true, notifyEmail: false });
  await page.reload();
  await expect(page.getByTestId('notif-inapp')).toBeChecked();
  await expect(page.getByTestId('notif-email')).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'Announcement pushes' })).toHaveCount(0);
});

test('AC-4: unavailable profile cannot expose writable default preferences', async ({ page }) => {
  await page.route('**/api/users/me', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Profile temporarily unavailable' }) }));
  await page.reload();
  await expect(page.getByText('Could not load your profile.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('profile-save')).toHaveCount(0);
  await expect(page.getByTestId('notif-inapp')).toHaveCount(0);
  await page.unroute('**/api/users/me');
  const retry = page.getByRole('button', { name: 'Try again', exact: true });
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('profile-year')).toContainText('2nd year');
  await expect(page.getByTestId('notif-inapp')).not.toBeChecked();
});
