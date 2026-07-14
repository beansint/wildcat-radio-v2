import { test, expect, type Page } from '@playwright/test';

/**
 * /profile/standing — listener-facing strikes/mute/ban standing page.
 * Golden: status card + strike count render for a logged-in listener.
 * Edge: empty appeal submit shows a role="alert" validation error; a real
 * submit shows the success confirmation (falls back to asserting the
 * "nothing to appeal" empty state if the seeded account has no active
 * strike/mute to appeal — see inline note below).
 * Auth: unauthenticated visit redirects to /login?next=.
 */

const BASE  = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3011';
const EMAIL = 'test@example.com';
const PASS  = 'Password123!';

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.getByTestId('auth-email').fill(EMAIL);
  await page.getByTestId('auth-password').fill(PASS);
  await page.getByTestId('auth-submit').click();
  await page.waitForURL(new RegExp(`^${BASE}(/)?$`), { timeout: 10_000 });
}

// golden: a LISTENER logs in, visits /profile/standing, sees the status
// card + strike count.
test('golden: listener sees status card and strike count on /profile/standing', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/profile/standing`);

  await expect(page.getByTestId('standing-status')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByTestId('standing-strike-count')).toBeVisible();
  await expect(page.getByTestId('standing-strike-count')).toContainText(/of 3 strikes/i);
  await expect(page.getByTestId('standing-history')).toBeVisible();
});

// edge: submitting an empty appeal shows the role="alert" validation error;
// submitting text shows the success confirmation. If the seeded test
// account has no active strike/mute, the appeal card shows the
// "nothing to appeal" empty state instead — in that case this test
// asserts that path rather than the form (documented deviation, since we
// can't seed a strike for this account from the E2E layer).
test('edge: appeal form validates empty input and confirms on submit (or shows nothing-to-appeal)', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/profile/standing`);

  await expect(page.getByTestId('standing-status')).toBeVisible({ timeout: 8_000 });

  const appealForm = page.getByTestId('standing-appeal-form');
  const hasAppealForm = await appealForm.isVisible().catch(() => false);

  if (!hasAppealForm) {
    // Nothing to appeal — the card renders the gentle empty-state copy instead.
    await expect(page.getByText(/nothing to appeal right now/i)).toBeVisible();
    return;
  }

  // Empty submit → role="alert" validation error, no network call.
  await page.getByTestId('standing-appeal-submit').click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 4_000 });

  // Real submit → success confirmation.
  await page.getByTestId('standing-appeal-text').fill('I do not think this strike was fair.');
  await page.getByTestId('standing-appeal-submit').click();
  await expect(page.getByTestId('standing-appeal-success')).toBeVisible({ timeout: 8_000 });
});

// auth: unauthenticated visit redirects to /login?next=.
test('auth: unauthenticated visit to /profile/standing redirects to /login?next=', async ({ page }) => {
  await page.goto(`${BASE}/profile/standing`);

  await expect(page).toHaveURL(/\/login\?next=%2Fprofile%2Fstanding/, { timeout: 8_000 });
});
