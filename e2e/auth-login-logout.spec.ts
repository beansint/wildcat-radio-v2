import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

// AC-2 golden: sign in → session-aware nav shows avatar → sign out → nav shows Sign in
test('AC-2 golden: login shows avatar in nav; sign out restores Sign in', async ({ page }) => {
  await page.goto(`${BASE}/login`);

  await page.getByTestId('auth-email').fill('test@example.com');
  await page.getByTestId('auth-password').fill('Password123!');
  await page.getByTestId('auth-submit').click();

  // After login: should land on / or the ?next= page
  await page.waitForURL(/^http:\/\/localhost:3000(\/)?$/, { timeout: 10_000 });

  // Nav should now show a profile avatar link (aria-label contains "profile")
  // .first() because profile link exists in both top-nav avatar and mobile-drawer
  const avatarLink = page.getByRole('link', { name: /profile/i }).first();
  await expect(avatarLink).toBeVisible({ timeout: 6_000 });

  // Sign out: call the Better Auth sign-out endpoint directly to avoid GlobalPlayer click-intercept
  await page.request.post(`http://localhost:3001/api/auth/sign-out`, {
    headers: { Origin: BASE },
  });
  await page.goto(`${BASE}/`);

  // Nav should now show Sign in button
  // .first() because Sign in link appears in both top-nav and mobile-drawer
  await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible({ timeout: 6_000 });
});

// Edge E-1: wrong password shows error
test('AC-2 edge E-1: wrong password shows error', async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await page.getByTestId('auth-email').fill('test@example.com');
  await page.getByTestId('auth-password').fill('WrongPassword999!');
  await page.getByTestId('auth-submit').click();

  await expect(page.getByRole('alert')).toBeVisible({ timeout: 8_000 });
});

// Edge E-5: auth guard preserves ?next= redirect
test('AC-2 edge E-5: visiting /profile unauth redirects to /login?next=/profile', async ({ page }) => {
  await page.goto(`${BASE}/profile`);

  // Should be redirected to login page
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile/, { timeout: 8_000 });
});

// Edge E-3: invalid verify-email token shows error + resend button
test('AC-2 edge E-3: invalid verify-email token shows error state', async ({ page }) => {
  await page.goto(`${BASE}/verify-email?token=invalid-token-xyz`);

  // Should show error state with resend button
  await expect(page.getByRole('heading', { name: /expired|invalid/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /resend/i })).toBeVisible();
});

// Edge E-4: invalid reset token shows error
test('AC-2 edge E-4: invalid reset token shows error state', async ({ page }) => {
  await page.goto(`${BASE}/reset-password?token=invalid-reset-token`);

  // Fill in a new password with the invalid token
  const newPassInput = page.locator('#rp-pass');
  await expect(newPassInput).toBeVisible({ timeout: 6_000 });
  await newPassInput.fill('NewPassword123!');
  await page.locator('#rp-confirm').fill('NewPassword123!');
  await page.locator('[type="submit"]').click();

  await expect(page.getByRole('alert')).toBeVisible({ timeout: 8_000 });
});
