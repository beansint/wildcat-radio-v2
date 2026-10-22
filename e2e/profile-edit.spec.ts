import { expect } from '@playwright/test';
import { API_BASE } from './_fixtures';
import { test, openProfile, setProfileConsent, saveProfile, profileData, activeProfileConsents } from './_profile-fixtures';

test.beforeEach(async ({ page, profileAccount }) => { await openProfile(page, profileAccount); });

test('profile save persists the canonical gender and consent through reload', async ({ page, profileAccount }) => {
  await expect(page.getByRole('button', { name: 'Woman', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Man', exact: true }).click();
  await setProfileConsent(page, true);
  const payload = await saveProfile(page);
  expect(payload).toMatchObject({ gender: 'male', demographicsConsent: true, expectedDemographicsConsent: false });
  expect(await profileData(profileAccount)).toMatchObject({ gender: 'male' });
  expect((await activeProfileConsents(profileAccount)).length).toBe(1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Man', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('profile-consent')).toBeChecked();
});

test('anonymous age contribution fires once and remains disabled after reload', async ({ page, profileAccount }) => {
  let calls = 0;
  page.on('request', req => { if (req.method() === 'POST' && req.url() === `${API_BASE}/api/analytics/age-bucket`) calls++; });
  profileAccount.contributedBucket = '18-20';
  await page.getByRole('button', { name: '18–20', exact: true }).click();
  await setProfileConsent(page, true);
  const ageResponse = page.waitForResponse(response => response.url() === `${API_BASE}/api/analytics/age-bucket` && response.request().method() === 'POST');
  await saveProfile(page);
  expect((await ageResponse).ok()).toBe(true);
  expect(calls).toBe(1);
  expect(await profileData(profileAccount)).toMatchObject({ ageBucketContributed: true });
  await page.reload();
  await expect(page.getByText('Your one-time anonymous age sample has already been recorded.')).toBeVisible();
  for (const age of await page.getByTestId('profile-age').all()) await expect(age).toBeDisabled();
  await expect(page.getByTestId('profile-consent')).toBeChecked();
  await saveProfile(page);
  expect(calls).toBe(1);
});

test('notification save writes the preference and survives reload', async ({ page, profileAccount }) => {
  await expect(page.getByTestId('notif-inapp')).not.toBeChecked();
  await page.getByTestId('notif-inapp').click();
  const pending = page.waitForResponse(response => response.url() === `${API_BASE}/api/users/me` && response.request().method() === 'PATCH');
  await page.getByTestId('profile-notification-save').click();
  const response = await pending;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toEqual({ notifyInApp: true });
  await expect(page.getByTestId('profile-notification-saved')).toHaveText('Notification preferences saved.');
  expect(await profileData(profileAccount)).toMatchObject({ notifyInApp: true, gender: 'female' });
  await page.reload();
  await expect(page.getByTestId('notif-inapp')).toBeChecked();
});

test('handle editing validates input then saves the public handle through reload', async ({ page, profileAccount }) => {
  let patches = 0;
  page.on('request', req => { if (req.method() === 'PATCH' && req.url() === `${API_BASE}/api/users/me`) patches++; });
  const input = page.getByLabel('Handle', { exact: true });
  await input.fill('AB');
  await page.getByRole('button', { name: 'Save handle', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /at least 3|lowercase/i })).toContainText(/at least 3|lowercase/i);
  expect(patches).toBe(0);
  const updated = `${profileAccount.handle}_edit`;
  await input.fill(updated);
  const pending = page.waitForResponse(response => response.url() === `${API_BASE}/api/users/me` && response.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Save handle', exact: true }).click();
  const response = await pending;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toEqual({ handle: updated });
  await expect(page.getByRole('status').filter({ hasText: 'Handle saved.' })).toBeVisible();
  await expect(page.getByTestId('profile-handle')).toHaveText(`@${updated}`);
  expect(await profileData(profileAccount)).toMatchObject({ handle: updated });
  await page.reload();
  await expect(page.getByTestId('profile-handle')).toHaveText(`@${updated}`);
  await expect(input).toHaveValue(updated);
});

test('persisted consent can be withdrawn in My data and a later field save does not re-grant it', async ({ page, profileAccount }) => {
  await setProfileConsent(page, true);
  await saveProfile(page);
  await page.reload();
  await expect(page.getByTestId('profile-consent')).toBeChecked();
  await page.goto('/my-data');
  const toggle = page.getByTestId('privacy-consent-toggle');
  await expect(toggle).toBeChecked();
  const withdrawn = page.waitForResponse(response => response.url() === `${API_BASE}/api/consent/DEMOGRAPHICS` && response.request().method() === 'DELETE');
  await toggle.click();
  expect((await withdrawn).ok()).toBe(true);
  await expect(page.getByTestId('privacy-status')).toContainText('Consent withdrawn.');
  await expect(toggle).not.toBeChecked();
  expect((await activeProfileConsents(profileAccount)).length).toBe(0);
  await page.goto('/profile');
  await expect(page.getByTestId('profile-consent')).toBeEnabled();
  await expect(page.getByTestId('profile-consent')).not.toBeChecked();
  await page.getByRole('button', { name: 'Other', exact: true }).click();
  const payload = await saveProfile(page);
  expect(payload).not.toHaveProperty('demographicsConsent');
  expect(await profileData(profileAccount)).toMatchObject({ gender: 'other' });
  expect((await activeProfileConsents(profileAccount)).length).toBe(0);
  await page.reload();
  await expect(page.getByTestId('profile-consent')).not.toBeChecked();
});

test('age failure explains the partial save and leaves the one-time contribution available', async ({ page, profileAccount }) => {
  // Fault only the age HTTP boundary; profile and consent still hit the real API.
  await page.route('**/api/analytics/age-bucket', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Age sample temporarily unavailable' }) }));
  await page.getByRole('button', { name: 'Man', exact: true }).click();
  await page.getByRole('button', { name: '21–23', exact: true }).click();
  await setProfileConsent(page, true);
  const ageResponse = page.waitForResponse(response => response.url() === `${API_BASE}/api/analytics/age-bucket`);
  await page.getByTestId('profile-save').click();
  expect((await ageResponse).status()).toBe(503);
  const partialFailure = page.getByRole('alert').filter({ hasText: 'Your profile and consent were saved, but the age sample could not be confirmed.' });
  await expect(partialFailure).toBeVisible();
  await expect(partialFailure).toContainText('Age sample temporarily unavailable');
  await expect(page.getByRole('status').filter({ hasText: 'Optional details saved.' })).toHaveCount(0);
  expect(await profileData(profileAccount)).toMatchObject({ gender: 'male', ageBucketContributed: false });
  expect((await activeProfileConsents(profileAccount)).length).toBe(1);
  await expect(page.getByTestId('profile-save')).toBeEnabled();
  for (const age of await page.getByTestId('profile-age').all()) await expect(age).toBeEnabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Man', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('profile-consent')).toBeChecked();
  await expect(page.getByText(/Age is an anonymous one-time sample/)).toBeVisible();
});
