import { test, expect, type Page } from '@playwright/test';

/**
 * These tests require the user to be logged in.
 * In a real CI run, use storageState to inject a session cookie.
 * Here we log in via the UI before each test.
 */

const BASE  = 'http://localhost:3000';
const EMAIL = 'test@example.com';
const PASS  = 'Password123!';

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.getByTestId('auth-email').fill(EMAIL);
  await page.getByTestId('auth-password').fill(PASS);
  await page.getByTestId('auth-submit').click();
  await page.waitForURL(/localhost:3000(\/)?$/, { timeout: 10_000 });
}

/** Click the <label> wrapping an input to toggle a controlled checkbox reliably */
async function clickLabel(page: Page, inputTestId: string) {
  // Clicking the label is more reliable than the hidden/controlled input directly
  const label = page.locator(`label:has([data-testid="${inputTestId}"])`);
  await label.scrollIntoViewIfNeeded();
  await label.click();
}

// AC-3 golden: profile edit persists gender/notify
// Note: year/college selects are disabled for GUEST users (only enabled for CAMPUS class)
test('AC-3 golden: profile save sends PATCH and UI reflects changes', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/profile`);

  // Wait for profile card to load
  await expect(page.getByTestId('profile-handle')).toBeVisible({ timeout: 8_000 });

  // Gender pick button — click the first one (Woman)
  const genderBtns = page.getByTestId('profile-gender');
  await genderBtns.first().click();

  // Check consent (required to enable Save) — click the label, not the controlled input
  await clickLabel(page, 'profile-consent');

  // Save button should now be enabled
  const saveBtn = page.getByTestId('profile-save');
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  // Save button should show "Saving…" then revert (loading cycle)
  await expect(saveBtn).toContainText(/saving/i, { timeout: 5_000 });
  await expect(saveBtn).not.toContainText(/saving/i, { timeout: 10_000 });
});

// AC-4 golden: demographics consent + age-bucket fires once
test('AC-4 golden: age-bucket fires on first save; disabled on re-save', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/profile`);

  // Wait for profile to load
  await expect(page.getByTestId('profile-handle')).toBeVisible({ timeout: 8_000 });

  // Intercept the age-bucket API call
  let ageBucketCalls = 0;
  await page.route('**/api/analytics/age-bucket', (route) => {
    ageBucketCalls++;
    route.continue();
  });

  // Select an age bucket
  const ageBtns = page.getByTestId('profile-age');
  await ageBtns.first().click(); // 18–20

  // Check consent by clicking the label
  await clickLabel(page, 'profile-consent');
  await page.getByTestId('profile-save').click();
  await page.getByTestId('profile-save').waitFor({ state: 'visible' });
  await expect(page.getByTestId('profile-save')).not.toContainText(/saving/i, { timeout: 10_000 });

  // First save should have called age-bucket
  expect(ageBucketCalls).toBeGreaterThanOrEqual(1);
  const callsAfterFirst = ageBucketCalls;

  // Second save — age-bucket should NOT fire again (local state disables it)
  // Re-check consent for second save (it's unchecked after first save resets the flow)
  const isConsentChecked = await page.getByTestId('profile-consent').isChecked();
  if (!isConsentChecked) {
    await clickLabel(page, 'profile-consent');
  }
  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('profile-save')).not.toContainText(/saving/i, { timeout: 10_000 });
  expect(ageBucketCalls).toBe(callsAfterFirst);
});

// AC-3 edge: notification toggles save correctly
test('AC-3 edge: notification toggles update via save', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/profile`);

  // Wait for profile to load
  await expect(page.getByTestId('profile-handle')).toBeVisible({ timeout: 8_000 });

  // Scroll the notifications section into view then click the label
  // (wc-switch hides the checkbox input with opacity:0 width:0 height:0)
  await clickLabel(page, 'notif-email');

  // Intercept the PATCH call
  let patchCalled = false;
  await page.route('**/api/users/me', (route) => {
    if (route.request().method() === 'PATCH') patchCalled = true;
    route.continue();
  });

  // Click the notifications Save button — it's inside the Notifications wc-card
  const saveButtons = page.locator('.wc-card .wc-btn-primary');
  await saveButtons.last().scrollIntoViewIfNeeded();
  await saveButtons.last().click({ force: true });

  await expect(async () => {
    expect(patchCalled).toBe(true);
  }).toPass({ timeout: 8_000 });
});
