import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

// AC-8 edge: a LISTENER (no staff role) is redirected away from /mod.
// Full mod golden-path flows land in Task 16 (mod-org-schedule-attendance.spec.ts)
// once /mod/roster etc. exist; this spec only covers the Task 9 RBAC gate.
test('AC-8 edge: LISTENER visiting /mod/roster is redirected away from /mod', async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await page.getByTestId('auth-email').fill('test@example.com');
  await page.getByTestId('auth-password').fill('Password123!');
  await page.getByTestId('auth-submit').click();
  await page.waitForURL(/^http:\/\/localhost:3000(\/)?$/, { timeout: 10_000 });

  await page.goto(`${BASE}/mod/roster`);

  await expect(page).not.toHaveURL(/\/mod/, { timeout: 8_000 });
});

// Edge: an unauthenticated visitor is sent to /login?next=/mod/roster.
test('edge: unauthenticated visit to /mod/roster redirects to /login?next=', async ({ page }) => {
  await page.goto(`${BASE}/mod/roster`);

  await expect(page).toHaveURL(/\/login\?next=%2Fmod%2Froster/, { timeout: 8_000 });
});
