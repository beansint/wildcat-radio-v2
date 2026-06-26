import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';
const ts = () => Date.now();

// AC-1: Guest registers → logged-in + verify banner shown
test('AC-1 golden: guest registers and sees verify-inbox state', async ({ page }) => {
  await page.goto(`${BASE}/register`);

  // The CIT button is disabled (coming-soon gate)
  const citBtn = page.getByTestId('auth-cit-btn');
  await expect(citBtn).toBeDisabled();

  // Fill out the guest form
  const email = `test+${ts()}@example.com`;
  const handle = `wildcat_${ts()}`;

  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-handle').fill(handle);
  await page.getByTestId('auth-password').fill('Password123!');
  await page.getByTestId('auth-confirm').fill('Password123!');
  await page.getByTestId('auth-terms').check();

  await page.getByTestId('auth-submit').click();

  // On success: form is replaced with verify-inbox / welcome state
  await expect(page.getByRole('heading', { name: /welcome.*wildcat/i })).toBeVisible({ timeout: 10_000 });
});

// Edge E-2: duplicate email shows an error message
test('AC-1 edge E-2: duplicate email shows error', async ({ page }) => {
  // Register once
  const email  = `dupe+${ts()}@example.com`;
  const handle = `dupe_${ts()}`;

  await page.goto(`${BASE}/register`);
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-handle').fill(handle);
  await page.getByTestId('auth-password').fill('Password123!');
  await page.getByTestId('auth-confirm').fill('Password123!');
  await page.getByTestId('auth-terms').check();
  await page.getByTestId('auth-submit').click();

  // Wait for success state
  await expect(page.getByRole('heading', { name: /welcome.*wildcat/i })).toBeVisible({ timeout: 10_000 });

  // Try to register again with the same email
  await page.goto(`${BASE}/register`);
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-handle').fill(`other_${ts()}`);
  await page.getByTestId('auth-password').fill('Password123!');
  await page.getByTestId('auth-confirm').fill('Password123!');
  await page.getByTestId('auth-terms').check();
  await page.getByTestId('auth-submit').click();

  // An error alert should appear
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 8_000 });
});

// Passwords don't match → client-side validation
// Use :not(#__next-route-announcer__) to avoid matching Next.js's built-in alert region
test('AC-1 edge: passwords-mismatch shows error without network call', async ({ page }) => {
  await page.goto(`${BASE}/register`);
  await page.getByTestId('auth-email').fill('mismatch@example.com');
  await page.getByTestId('auth-handle').fill('mismatch_user');
  await page.getByTestId('auth-password').fill('Password123!');
  await page.getByTestId('auth-confirm').fill('WrongConfirm!');
  await page.getByTestId('auth-terms').check();
  await page.getByTestId('auth-submit').click();

  // .first() handles Next.js's hidden aria-live="assertive" route announcer also having role="alert"
  await expect(page.getByRole('alert').first()).toContainText(/match/i);
});
