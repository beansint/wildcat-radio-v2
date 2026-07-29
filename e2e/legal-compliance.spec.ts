import { expect, request as pwRequest, test, type APIRequestContext } from '@playwright/test';
import { appAlerts, attachConsoleGuard } from './_console';
import { API_BASE, WEB_BASE, apiLoginAs, loginAs } from './_fixtures';

/**
 * FE#11 — legal notices, the consent flow, the data-subject-rights centre and
 * the music-attribution surface.
 *
 * The destructive path (erasure) runs against a **throwaway account this spec
 * registers itself**, never a seed account: erasure is irreversible and would
 * take `test@example.com` out of every other suite permanently.
 */

let listenerApi: APIRequestContext;
let anonApi: APIRequestContext;

const PASSWORD = 'TestPass123!';
const suffix = () => `fe11${Date.now()}${Math.floor(Math.random() * 1000)}`;

test.beforeAll(async () => {
  listenerApi = await apiLoginAs('listener');
  anonApi = await pwRequest.newContext({ baseURL: API_BASE });
});

test.afterAll(async () => {
  await listenerApi.dispose();
  await anonApi.dispose();
});

/** Register a disposable account and sign the browser in as it. */
async function registerThrowaway(page: import('@playwright/test').Page) {
  const id = suffix();
  const email = `e2e_${id}@example.com`;
  const res = await anonApi.post('/api/auth/sign-up/email', {
    headers: { Origin: WEB_BASE },
    data: { email, password: PASSWORD, name: 'FE11 Throwaway', handle: id.slice(0, 20) },
  });
  expect(res.ok(), `sign-up failed: ${res.status()}`).toBe(true);

  await page.goto(`${WEB_BASE}/login`);
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
  return email;
}

// ── Contract tier ───────────────────────────────────────────────────────────

test.describe('@contract', () => {
  test('LC-C-01: legal notices are public and flagged as unreviewed placeholder', async () => {
    for (const doc of ['privacy', 'tos']) {
      const res = await anonApi.get(`/api/legal/${doc}`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.isPlaceholder).toBe(true);
      expect(body.version.length).toBeGreaterThan(0);
    }
    expect((await anonApi.get('/api/legal/cookies')).status()).toBe(404);
  });

  test('LC-C-02: the DSR routes require a session', async () => {
    for (const route of ['/api/me/data/export', '/api/consent']) {
      expect((await anonApi.get(route)).status(), route).toBe(401);
    }
  });

  test('LC-C-03: attribution is public and carries no internal clearance evidence', async () => {
    const res = await anonApi.get('/api/music-sources/attribution');
    expect(res.status()).toBe(200);
    expect(JSON.stringify(await res.json())).not.toContain('clearanceProof');
  });
});

// ── Legal pages ─────────────────────────────────────────────────────────────

test('LC-E-01: the privacy notice renders with its version and a draft warning', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto(`${WEB_BASE}/legal/privacy`);

  await expect(page.getByRole('heading', { level: 1, name: 'Privacy Notice' })).toBeVisible();
  await expect(page.getByTestId('legal-version')).toContainText(/Version .+ · effective \d{4}/);

  // The whole point of the flag: unreviewed text must never read as binding.
  await expect(page.getByTestId('legal-placeholder-banner')).toBeVisible();
  await expect(page.getByTestId('legal-placeholder-banner')).toContainText(/not binding terms/i);

  // The notice must describe what erasure actually does, because it is
  // anonymisation rather than deletion.
  await expect(page.getByTestId('legal-body')).toContainText(/not the same as deleting every trace/i);

  guard.assertClean();
});

test('LC-E-02: terms render, and both are reachable from any public page', async ({ page }) => {
  await page.goto(`${WEB_BASE}/shows`);

  // Reachability is the point — a notice nobody can find is not much of a
  // notice. These links live in the footer, which the public shell renders on
  // every page rather than only on the landing page.
  await expect(page.getByTestId('footer-privacy')).toBeVisible();
  await expect(page.getByTestId('footer-terms')).toBeVisible();
  await expect(page.getByTestId('footer-attribution')).toBeVisible();

  await page.getByTestId('footer-terms').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
});

test('LC-E-03: the attribution surface lists credits or says there are none', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await page.goto(`${WEB_BASE}/attribution`);

  await expect(page.getByRole('heading', { level: 1, name: 'Music credits' })).toBeVisible();
  await expect(
    page.getByTestId('attribution-list').or(page.getByTestId('public-empty')),
  ).toBeVisible({ timeout: 15_000 });

  guard.assertClean();
});

// ── The rights centre ───────────────────────────────────────────────────────

test('LC-E-04: golden path — grant, see the evidence, withdraw', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await registerThrowaway(page);
  await page.goto(`${WEB_BASE}/privacy`);

  const toggle = page.getByTestId('privacy-consent-toggle');
  await expect(toggle).toBeEnabled({ timeout: 15_000 });
  // A fresh account has not consented — opt-in must be off by default, which is
  // what makes it opt-in.
  await expect(toggle).toHaveAttribute('data-state', 'unchecked');

  await toggle.click();
  await expect(page.getByTestId('privacy-status')).toContainText(/may now be counted/i);
  await expect(toggle).toHaveAttribute('data-state', 'checked');

  // The evidence is visible to the person it concerns, including which version
  // of the notice they agreed to.
  await page.getByText('Consent history').click();
  await expect(page.getByTestId('privacy-consent-history')).toContainText(/DEMOGRAPHICS/);
  await expect(page.getByTestId('privacy-consent-history')).toContainText(/privacy-/);

  await toggle.click();
  await expect(page.getByTestId('privacy-status')).toContainText(/will not be counted/i);
  await expect(toggle).toHaveAttribute('data-state', 'unchecked');

  guard.assertClean();
});

test('LC-E-05: the export downloads the caller’s own data', async ({ page }) => {
  await registerThrowaway(page);
  await page.goto(`${WEB_BASE}/privacy`);

  const download = page.waitForEvent('download', { timeout: 20_000 });
  await page.getByTestId('privacy-export').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/wildcat-radio-my-data-\d{4}-\d{2}-\d{2}\.json/);
  await expect(page.getByTestId('privacy-status')).toContainText(/downloaded/i);
});

test('LC-E-06: edge — erasure is gated behind typing the confirmation exactly', async ({ page }) => {
  await registerThrowaway(page);
  await page.goto(`${WEB_BASE}/privacy`);

  // The control must be reachable: it sits at the bottom of the page behind a
  // fixed bottom nav and player, and with too little padding it was
  // permanently unclickable — the destructive action being the one you cannot
  // reach is the worst possible version of that bug.
  await page.getByTestId('privacy-erase-open').click();
  await expect(page.getByTestId('privacy-erase-dialog')).toBeVisible();

  const confirm = page.getByTestId('privacy-erase-confirm-button');
  await expect(confirm).toBeDisabled();

  // Near-misses must not unlock it — a confirmation that accepts anything is
  // just a second click.
  await page.getByTestId('privacy-erase-confirm').fill('delete');
  await expect(confirm).toBeDisabled();
  await page.getByTestId('privacy-erase-confirm').fill('DELETE ');
  await expect(confirm).toBeDisabled();

  await page.getByTestId('privacy-erase-confirm').fill('DELETE');
  await expect(confirm).toBeEnabled();
});

test('LC-E-07: erasure signs the account out and it cannot sign back in', async ({ page }) => {
  const email = await registerThrowaway(page);
  await page.goto(`${WEB_BASE}/privacy`);

  await page.getByTestId('privacy-erase-open').click();
  await page.getByTestId('privacy-erase-confirm').fill('DELETE');
  await page.getByTestId('privacy-erase-confirm-button').click();

  // The session is revoked server-side, so the app returns to the public site.
  await page.waitForURL(`${WEB_BASE}/`, { timeout: 20_000 });

  // The old credentials no longer work: erasure severs the sign-in rather than
  // merely hiding the profile.
  const signIn = await anonApi.post('/api/auth/sign-in/email', {
    headers: { Origin: WEB_BASE },
    data: { email, password: PASSWORD },
  });
  expect(signIn.ok()).toBe(false);
});

test('LC-E-08: RBAC — the rights centre needs a session', async ({ page }) => {
  await page.goto(`${WEB_BASE}/privacy`);
  // The (app) group guards client-side, so the assertion is that the content
  // never mounts.
  await expect(page.getByTestId('privacy-consent-toggle')).toHaveCount(0);
});

test('LC-E-09: a11y — one alert region, labelled controls, reachable by keyboard', async ({
  page,
}) => {
  await registerThrowaway(page);
  await page.goto(`${WEB_BASE}/privacy`);
  await expect(page.getByTestId('privacy-consent-toggle')).toBeVisible({ timeout: 15_000 });

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  // Never more than one app alert at a time (the convention's per-page rule).
  await expect(appAlerts(page)).toHaveCount(0);

  // The consent switch is labelled, so a screen reader says what it toggles.
  const label = page.locator('label[for="privacy-consent"]');
  await expect(label).toBeVisible();

  // Keyboard: the switch is operable with Space, like a native checkbox.
  // It stays disabled while the consent query is in flight, and focus() on a
  // disabled button is a no-op — so wait for enabled rather than merely visible.
  const toggle = page.getByTestId('privacy-consent-toggle');
  await expect(toggle).toBeEnabled({ timeout: 15_000 });
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('privacy-status')).toBeVisible({ timeout: 15_000 });
});

test('LC-E-10: 375x812 — no horizontal scroll on any legal surface', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const route of ['/legal/privacy', '/legal/terms', '/attribution']) {
    await page.goto(`${WEB_BASE}${route}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth, `${route} scrolls horizontally`).toBeLessThanOrEqual(clientWidth + 1);
  }
});
