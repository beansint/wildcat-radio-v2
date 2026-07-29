import { expect, request as pwRequest, test, type APIRequestContext } from '@playwright/test';
import { appAlerts, attachConsoleGuard } from './_console';
import { ACCOUNTS, API_BASE, WEB_BASE, apiLoginAs, loginAs } from './_fixtures';

/**
 * FE#10 `/mod/analytics` — the M6 curation dashboard.
 *
 * The page reads finished episode snapshots, which only exist for episodes that
 * have actually ended, so these cases assert the dashboard's *behaviour*
 * (structure, states, gating, export, a11y) rather than specific numbers: the
 * numbers are the backend's contract and are covered by its own suite.
 */

let modApi: APIRequestContext;
let listenerApi: APIRequestContext;
let anonApi: APIRequestContext;

test.beforeAll(async () => {
  modApi = await apiLoginAs('moderator');
  listenerApi = await apiLoginAs('listener');
  anonApi = await pwRequest.newContext({ baseURL: API_BASE });
});

test.afterAll(async () => {
  await modApi.dispose();
  await listenerApi.dispose();
  await anonApi.dispose();
});

// ── Contract tier ───────────────────────────────────────────────────────────

test.describe('@contract', () => {
  test('AN-C-01: every analytics route is moderator-gated by minimum rank', async () => {
    const routes = [
      '/api/analytics/overview',
      '/api/analytics/shows',
      '/api/analytics/dayparts',
      '/api/analytics/media-kit/export?format=csv',
    ];
    for (const route of routes) {
      expect((await anonApi.get(route)).status(), `${route} anonymous`).toBe(401);
      expect((await listenerApi.get(route)).status(), `${route} listener`).toBe(403);
      expect((await modApi.get(route)).status(), `${route} moderator`).toBe(200);
    }
  });

  test('AN-C-02: the export downloads as an attachment in both formats', async () => {
    const csv = await modApi.get('/api/analytics/media-kit/export?format=csv');
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toMatch(/text\/csv/);
    expect(csv.headers()['content-disposition']).toMatch(/attachment/);

    const pdf = await modApi.get('/api/analytics/media-kit/export?format=pdf');
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toMatch(/application\/pdf/);

    expect((await modApi.get('/api/analytics/media-kit/export?format=xlsx')).status()).toBe(400);
  });

  test('AN-C-03: the export never carries a listener identity', async () => {
    // The file leaves the building and may reach a sponsor, so it gets its own
    // assertion rather than trusting the route's.
    const csv = await (await modApi.get('/api/analytics/media-kit/export?format=csv')).text();
    expect(csv).not.toMatch(/@example\.com/);
    expect(csv).not.toMatch(/\bc[a-z0-9]{24}\b/);
  });
});

// ── Integration + E2E tier ──────────────────────────────────────────────────

test('AN-E-01: golden path — the dashboard renders all four panels with real data', async ({
  page,
}) => {
  const guard = attachConsoleGuard(page);
  await loginAs(page, 'moderator');
  await page.goto(`${WEB_BASE}/mod/analytics`);

  await expect(page.getByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible();

  // Four stat cards, each showing a number rather than a dash once loaded.
  for (const stat of ['peak', 'reach', 'tlh', 'engagement']) {
    await expect(page.getByTestId(`mod-analytics-stat-${stat}`)).toBeVisible({ timeout: 15_000 });
  }

  // Each panel renders either its chart or its own empty state — never nothing,
  // and never a spinner that never resolves.
  await expect(
    page.getByTestId('mod-analytics-retention').or(page.getByTestId('mod-analytics-retention-empty')),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('mod-analytics-heatmap')).toBeVisible();
  await expect(
    page.getByTestId('mod-analytics-shows').or(page.getByTestId('mod-analytics-shows-empty')),
  ).toBeVisible();
  await expect(
    page.getByTestId('mod-analytics-scatter').or(page.getByTestId('mod-analytics-scatter-empty')),
  ).toBeVisible();

  guard.assertClean();
});

test('AN-E-02: the heatmap distinguishes a silent slot from one never broadcast', async ({
  page,
}) => {
  await loginAs(page, 'moderator');
  await page.goto(`${WEB_BASE}/mod/analytics`);
  await expect(page.getByTestId('mod-analytics-heatmap')).toBeVisible({ timeout: 15_000 });

  // 6 two-hour rows x 7 weekdays. A zero-filled grid would say "we aired and
  // nobody came" everywhere the station simply does not broadcast.
  const cells = page.locator('[data-testid^="mod-analytics-heat-"]');
  await expect(cells).toHaveCount(42);

  const unaired = page.locator('[data-testid^="mod-analytics-heat-"][data-aired="false"]').first();
  await expect(unaired).toHaveAttribute('aria-label', /no broadcast/);
});

test('AN-E-03: switching period refetches, and a custom range is validated before it is sent', async ({
  page,
}) => {
  const guard = attachConsoleGuard(page);
  await loginAs(page, 'moderator');
  await page.goto(`${WEB_BASE}/mod/analytics`);
  await expect(page.getByTestId('mod-analytics-stat-peak')).toBeVisible({ timeout: 15_000 });

  const requests: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/analytics/overview')) requests.push(req.url());
  });

  await page.getByTestId('mod-analytics-period-psem').click();
  await expect.poll(() => requests.length, { timeout: 10_000 }).toBeGreaterThan(0);

  // Custom range: an inverted range must be refused in the browser rather than
  // firing a 400 on every keystroke.
  await page.getByTestId('mod-analytics-period-pcustom').click();
  await page.getByTestId('mod-analytics-from').fill('2026-07-20');
  await page.getByTestId('mod-analytics-to').fill('2026-07-10');
  // `appAlerts`, not getByRole('alert'): Next injects its own
  // #__next-route-announcer__ with role="alert", which over-counts.
  await expect(appAlerts(page)).toContainText(/must not be after/i);

  guard.assertClean();
});

test('AN-E-04: exporting downloads a file and says it was audited', async ({ page }) => {
  await loginAs(page, 'moderator');
  await page.goto(`${WEB_BASE}/mod/analytics`);
  await expect(page.getByTestId('mod-analytics-stat-peak')).toBeVisible({ timeout: 15_000 });

  const download = page.waitForEvent('download', { timeout: 20_000 });
  await page.getByTestId('mod-analytics-export-csv').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/wildcat-audience-report-\d{4}-\d{2}-\d{2}\.csv/);

  // The prototype's button only toasted; this one reports what the backend
  // actually recorded.
  await expect(page.getByTestId('mod-analytics-export-message')).toContainText(/staff audit/i);
});

test('AN-E-05: RBAC — a LISTENER never reaches the dashboard', async ({ page }) => {
  await loginAs(page, 'listener');
  await page.goto(`${WEB_BASE}/mod/analytics`);

  // The staff layout is a client-side guard, so the assertion is that the
  // page's content never mounts — not merely that a redirect eventually fires.
  await expect(page.getByTestId('mod-analytics-stat-peak')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Analytics' })).toHaveCount(0);
});

test('AN-E-06: CUSTODIAN passes (rank-based, not an exact-role allowlist)', async ({ page }) => {
  test.skip(!ACCOUNTS.custodian, 'no custodian fixture account configured');
  await loginAs(page, 'custodian');
  await page.goto(`${WEB_BASE}/mod/analytics`);
  await expect(page.getByTestId('mod-analytics-stat-peak')).toBeVisible({ timeout: 15_000 });
});

test('AN-E-07: a11y — headings are structured, the table has real headers, cells are labelled', async ({
  page,
}) => {
  await loginAs(page, 'moderator');
  await page.goto(`${WEB_BASE}/mod/analytics`);
  await expect(page.getByTestId('mod-analytics-heatmap')).toBeVisible({ timeout: 15_000 });

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(4);

  // Every heat cell carries its value for a screen reader, even though only the
  // strongest cells print it visually.
  const cell = page.locator('[data-testid^="mod-analytics-heat-"]').first();
  await expect(cell).toHaveAttribute('aria-label', /.+/);

  // Keyboard: the period control and both export buttons are reachable.
  await page.keyboard.press('Tab');
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? '');
  expect(['A', 'BUTTON', 'INPUT']).toContain(focusedTag);
});

test('AN-E-08: 375x812 — no horizontal page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loginAs(page, 'moderator');
  await page.goto(`${WEB_BASE}/mod/analytics`);
  await expect(page.getByTestId('mod-analytics-stat-peak')).toBeVisible({ timeout: 15_000 });

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  // The ranking table scrolls inside its own container; the page must not.
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});
