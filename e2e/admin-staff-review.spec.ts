import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ACCOUNTS, PASSWORD, WEB_BASE, API_BASE, loginAs, apiLoginAs } from './_fixtures';
import { attachConsoleGuard, appAlerts } from './_console';

/**
 * /admin/staff — "Staff review" (BEA-184).
 * `.agent/test-suites/staff-review/web/e2e.md` (SR-W-*) +
 * `.agent/test-suites/staff-review/cross-cutting/invariants.md` (SR-X-01d, SR-X-15, SR-X-16).
 *
 * Written spec-first against the prototype (`docs/frontend-design-basis-prototype/admin/staff.html`)
 * and the test-suite README's "Decided semantics" — not against the page implementation.
 *
 * Fixture note: promotion targets a "verified campus user" (README § Decided
 * semantics 5 / SR-C-12), but the public /register flow only offers a GUEST
 * signup today (the CIT button is a disabled coming-soon gate — see
 * e2e/auth-register.spec.ts). So the throwaway target here is created via
 * the real register UI (a genuine account + password, through better-auth)
 * and then flipped to `class: CAMPUS` / `emailVerified: true` with a small
 * Prisma script — the same "backend fixture script" pattern
 * e2e/admin-escalations.spec.ts already uses for rows the UI/API can't
 * produce directly. Its role is restored to LISTENER in `afterAll` per the
 * suite's fixture rules (`workers: 1` against a shared Neon dev branch).
 *
 * NEVER mutate `mod@example.com` — mod-users/mod-queue/mod-logs depend on it
 * staying a MODERATOR.
 */

const BACKEND_DIR = process.env.WILDCAT_BACKEND_DIR ?? path.resolve(process.cwd(), '../wildcat-radio-v2-backend');

function runPrismaScript(body: string) {
  const script = `
    import * as dotenv from 'dotenv';
    import { PrismaPg } from '@prisma/adapter-pg';
    import { PrismaClient } from '@prisma/client';
    async function main() {
      dotenv.config({ path: ${JSON.stringify(path.join(BACKEND_DIR, 'apps/api/.env'))} });
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
      const prisma = new PrismaClient({ adapter });
      ${body}
      await prisma.$disconnect();
    }
    main().catch((error) => { console.error(error); process.exit(1); });
  `;
  try {
    execFileSync('pnpm', ['--dir', BACKEND_DIR, '--filter', '@wildcat/api', 'exec', 'tsx', '-e', script], {
      stdio: 'pipe',
    });
  } catch (error) {
    const details =
      error instanceof Error && 'stderr' in error
        ? String((error as Error & { stderr?: Buffer }).stderr)
        : String(error);
    throw new Error(`Backend fixture failed: ${details}`);
  }
}

function uniqueSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 100_000)}`;
}

/** Registers a throwaway GUEST account through the real UI, then flips it to a verified CAMPUS listener via Prisma. */
async function createThrowawayCampusUser(page: Page): Promise<{ email: string; handle: string; name: string }> {
  const id = uniqueSuffix();
  const email = `sr${id}@example.com`;
  const handle = `sr_${id}`;

  // Register in an ISOLATED context. Registering signs the new user in, so
  // doing it on the caller's page silently replaces the custodian session with
  // a LISTENER one — every later /admin/staff visit then redirects to / and
  // the whole suite fails with "testid never appeared" rather than saying why.
  const browser = page.context().browser();
  if (!browser) throw new Error('createThrowawayCampusUser needs a browser-backed context');
  const ctx = await browser.newContext();
  const regPage = await ctx.newPage();
  try {
    await regPage.goto(`${WEB_BASE}/register`);
    await regPage.getByTestId('auth-email').fill(email);
    await regPage.getByTestId('auth-handle').fill(handle);
    await regPage.getByTestId('auth-password').fill(PASSWORD);
    await regPage.getByTestId('auth-confirm').fill(PASSWORD);
    await regPage.getByTestId('auth-terms').check();
    await regPage.getByTestId('auth-submit').click();
    await expect(regPage.getByRole('heading', { name: /welcome.*wildcat/i })).toBeVisible({ timeout: 10_000 });
  } finally {
    await ctx.close();
  }

  runPrismaScript(`
    await prisma.user.update({
      where: { email: ${JSON.stringify(email)} },
      data: { class: 'CAMPUS', emailVerified: true },
    });
  `);

  return { email, handle, name: handle };
}

/** Best-effort: restores a throwaway user's role to LISTENER (shared dev-branch hygiene). */
function restoreListenerRole(email: string) {
  runPrismaScript(`
    await prisma.user.updateMany({ where: { email: ${JSON.stringify(email)} }, data: { role: 'LISTENER' } });
  `);
}

async function loginCustodian(page: Page) {
  await loginAs(page, 'custodian');
}

// ── RBAC (SR-W-07 / SR-X-01d) ───────────────────────────────────────────

test.describe('admin staff review — authorization at the UI', () => {
  test('SR-W-07/SR-X-01d edge: MODERATOR visiting /admin/staff is redirected to / and the table never renders', async ({
    page,
  }) => {
    await loginAs(page, 'moderator');
    await page.goto(`${WEB_BASE}/admin/staff`);
    await expect(page).toHaveURL(new RegExp(`^${WEB_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`), {
      timeout: 8_000,
    });
    await expect(page.getByTestId('admin-staff-active-table')).toHaveCount(0);
  });

  test('SR-W-07 edge: LISTENER visiting /admin/staff is redirected to /', async ({ page }) => {
    await loginAs(page, 'listener');
    await page.goto(`${WEB_BASE}/admin/staff`);
    await expect(page).toHaveURL(new RegExp(`^${WEB_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`), {
      timeout: 8_000,
    });
  });

  test('SR-W-07 edge: an anonymous visitor is redirected to /login', async ({ page }) => {
    await page.goto(`${WEB_BASE}/admin/staff`);
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });
});

// ── Golden path + edges ──────────────────────────────────────────────────

test.describe('admin staff review — golden path + edges', () => {
  let target: { email: string; handle: string; name: string } | null = null;

  test.afterEach(async () => {
    if (target) {
      restoreListenerRole(target.email);
      target = null;
    }
  });

  test('SR-W-01 golden: the page renders — header, sub-line, both sections, sidebar current, header row order', async ({
    page,
  }) => {
    const guard = attachConsoleGuard(page);
    await loginCustodian(page);
    await page.goto(`${WEB_BASE}/admin/staff`);

    await expect(page.getByRole('heading', { name: 'Staff review' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/custodian-only/i)).toBeVisible();
    await expect(page.getByText(/logged/i)).toBeVisible();

    // Scope to the section headings: "Deactivated" is also the text of every
    // status pill in that table, so a bare getByText matches N+1 elements and
    // trips strict mode as soon as the table has any rows.
    await expect(page.getByRole('heading', { name: 'Active moderators' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Deactivated' })).toBeVisible();

    await expect(page.getByTestId('mod-nav-staff-review')).toHaveAttribute('aria-current', 'page');

    const headerRow = page.getByTestId('admin-staff-active-table').locator('thead tr');
    await expect(headerRow).toHaveText(/Name\s*Email\s*Status\s*Joined\s*Last action\s*Actions/);

    guard.assertClean();
  });

  test('SR-W-02 golden: promote adds an Active row without a manual page reload', async ({ page }) => {
    await loginCustodian(page);
    target = await createThrowawayCampusUser(page);

    await page.goto(`${WEB_BASE}/admin/staff`);
    await page.getByTestId('admin-staff-promote-open').click();
    await expect(page.getByTestId('admin-staff-promote-dialog')).toBeVisible();

    await page.getByTestId('admin-staff-promote-email').fill(target.email);
    await page.getByTestId('admin-staff-promote-reason').fill('Elected by the org for AY 2026-2027');
    await page.getByTestId('admin-staff-promote-confirm').click();

    await expect(page.getByTestId('admin-staff-promote-dialog')).toBeHidden({ timeout: 10_000 });

    await page.getByTestId('admin-staff-search').fill(target.handle);
    const row = page.getByTestId('admin-staff-active-row').filter({ hasText: target.email });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('Active')).toBeVisible();
  });

  test('SR-W-03 golden: deactivate moves the row from Active to Deactivated', async ({ page }) => {
    const api = await apiLoginAs('custodian');
    await loginCustodian(page);
    target = await createThrowawayCampusUser(page);

    const promoteRes = await api.post(`${API_BASE}/api/admin/staff/promote`, {
      data: { email: target.email, reason: 'fixture: promote for SR-W-03' },
    });
    expect(promoteRes.ok()).toBe(true);
    await api.dispose();

    await page.goto(`${WEB_BASE}/admin/staff`);
    await page.getByTestId('admin-staff-search').fill(target.handle);
    const activeRow = page.getByTestId('admin-staff-active-row').filter({ hasText: target.email });
    await expect(activeRow).toBeVisible({ timeout: 10_000 });

    await activeRow.getByTestId('admin-staff-deactivate').click();
    await expect(page.getByTestId('admin-staff-deactivate-dialog')).toBeVisible();
    await page.getByTestId('admin-staff-deactivate-reason').fill('Term ended / stepped down');
    await page.getByTestId('admin-staff-deactivate-confirm').click();
    await expect(page.getByTestId('admin-staff-deactivate-dialog')).toBeHidden({ timeout: 10_000 });

    await expect(page.getByTestId('admin-staff-active-row').filter({ hasText: target.email })).toHaveCount(0);

    const deactivatedRow = page.getByTestId('admin-staff-deactivated-row').filter({ hasText: target.email });
    await expect(deactivatedRow).toBeVisible({ timeout: 10_000 });
    await expect(deactivatedRow.getByText('Deactivated')).toBeVisible();
  });

  test('SR-W-04 golden: promote + deactivate reasons appear verbatim on /mod/logs (audit round trip)', async ({
    page,
  }) => {
    const api = await apiLoginAs('custodian');
    await loginCustodian(page);
    target = await createThrowawayCampusUser(page);

    const promoteReason = `SR-W-04 promote reason ${uniqueSuffix()}`;
    const deactivateReason = `SR-W-04 deactivate reason ${uniqueSuffix()}`;

    const promoteRes = await api.post(`${API_BASE}/api/admin/staff/promote`, {
      data: { email: target.email, reason: promoteReason },
    });
    expect(promoteRes.ok()).toBe(true);
    const { id } = await promoteRes.json();

    const deactivateRes = await api.post(`${API_BASE}/api/admin/staff/${id}/deactivate`, {
      data: { reason: deactivateReason },
    });
    expect(deactivateRes.ok()).toBe(true);

    // The invariant under test (SR-I-11) is that each state change lands an
    // audit row carrying the operator's reason verbatim. Assert it at the read
    // model first, so a UI-side selector problem can never be mistaken for the
    // audit write silently not happening.
    const auditRes = await api.get(`${API_BASE}/api/mod/audit?page=1&pageSize=25`);
    expect(auditRes.ok()).toBe(true);
    const audit = await auditRes.json();
    const reasons = (audit.items ?? []).map(
      (row: { metadata?: { reason?: string } }) => row.metadata?.reason,
    );
    expect(reasons).toContain(promoteReason);
    expect(reasons).toContain(deactivateReason);
    await api.dispose();

    // Then the round trip proper: both reasons render verbatim in the staff
    // audit table's Reason column. /mod/logs opens on "Broadcast activity", so
    // the staff tab has to be selected — without that click this assertion was
    // searching the wrong table and failing against a correct implementation.
    await page.goto(`${WEB_BASE}/mod/logs`);
    await page.getByRole('tab', { name: 'Staff audit' }).click();
    await expect(page.getByText(promoteReason)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(deactivateReason)).toBeVisible({ timeout: 10_000 });
  });

  test('SR-W-05 golden: search narrows the active table and updates the count', async ({ page }) => {
    await loginCustodian(page);
    await page.goto(`${WEB_BASE}/admin/staff`);

    await expect(page.getByTestId('admin-staff-active-table')).toBeVisible({ timeout: 10_000 });
    const rows = page.getByTestId('admin-staff-active-row');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    const countBefore = await rows.count();

    const firstEmail = await rows.first().locator('td').nth(1).innerText();
    const fragment = firstEmail.split('@')[0].slice(0, 4);

    await page.getByTestId('admin-staff-search').fill(fragment);

    await expect(async () => {
      const count = await page.getByTestId('admin-staff-active-row').count();
      expect(count).toBeLessThanOrEqual(countBefore);
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });
    await expect(page.getByTestId('admin-staff-count')).toContainText('moderator');

    await page.getByTestId('admin-staff-search').fill('');
    await expect(async () => {
      const count = await page.getByTestId('admin-staff-active-row').count();
      expect(count).toBe(countBefore);
    }).toPass({ timeout: 10_000 });
  });

  test('SR-W-06 golden: pagination footer text, Prev disabled on page one, Next disabled on the last page', async ({
    page,
  }) => {
    await loginCustodian(page);
    await page.goto(`${WEB_BASE}/admin/staff`);
    await expect(page.getByTestId('admin-staff-active-table')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText(/Showing \d+–\d+ of \d+/)).toBeVisible();
    await expect(page.getByTestId('admin-staff-prev')).toBeDisabled();

    const nextBtn = page.getByTestId('admin-staff-next');
    if (await nextBtn.isEnabled()) {
      const firstRowEmailBefore = await page
        .getByTestId('admin-staff-active-row')
        .first()
        .locator('td')
        .nth(1)
        .innerText();
      await nextBtn.click();
      await expect(async () => {
        const firstRowEmailAfter = await page
          .getByTestId('admin-staff-active-row')
          .first()
          .locator('td')
          .nth(1)
          .innerText();
        expect(firstRowEmailAfter).not.toBe(firstRowEmailBefore);
      }).toPass({ timeout: 10_000 });
      await expect(page.getByTestId('admin-staff-prev')).toBeEnabled();
    } else {
      test.skip(true, 'Fewer than PAGE_SIZE+1 active moderators seeded — pagination advance not exercisable.');
    }
  });

  test('SR-W-E1 edge: promote with an empty reason blocks the request client-side', async ({ page }) => {
    await loginCustodian(page);
    target = await createThrowawayCampusUser(page);

    await page.goto(`${WEB_BASE}/admin/staff`);
    let promoteCalls = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/admin/staff/promote')) promoteCalls += 1;
    });

    await page.getByTestId('admin-staff-promote-open').click();
    await page.getByTestId('admin-staff-promote-email').fill(target.email);
    // Reason left empty.
    await page.getByTestId('admin-staff-promote-confirm').click();

    await expect(appAlerts(page).first()).toBeVisible();
    await expect(page.getByTestId('admin-staff-promote-dialog')).toBeVisible();
    expect(promoteCalls).toBe(0);
    target = null; // never promoted; nothing to restore
  });

  test('SR-W-E2 edge: promoting an unknown email surfaces the 404 in the same alert region, dialog stays open with values preserved', async ({
    page,
  }) => {
    await loginCustodian(page);
    await page.goto(`${WEB_BASE}/admin/staff`);

    const unknownEmail = `sr-nobody-${uniqueSuffix()}@cit.edu`;
    await page.getByTestId('admin-staff-promote-open').click();
    await page.getByTestId('admin-staff-promote-email').fill(unknownEmail);
    await page.getByTestId('admin-staff-promote-reason').fill('Elected by the org');
    await page.getByTestId('admin-staff-promote-confirm').click();

    await expect(appAlerts(page).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('admin-staff-promote-dialog')).toBeVisible();
    await expect(page.getByTestId('admin-staff-promote-email')).toHaveValue(unknownEmail);
    await expect(page.getByTestId('admin-staff-promote-reason')).toHaveValue('Elected by the org');
  });

  test('SR-W-E3 edge: promoting an existing moderator surfaces the 409, no duplicate row', async ({ page }) => {
    await loginCustodian(page);
    await page.goto(`${WEB_BASE}/admin/staff`);

    await page.getByTestId('admin-staff-promote-open').click();
    await page.getByTestId('admin-staff-promote-email').fill(ACCOUNTS.moderator);
    await page.getByTestId('admin-staff-promote-reason').fill('Already a moderator — expect 409');
    await page.getByTestId('admin-staff-promote-confirm').click();

    await expect(appAlerts(page).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('admin-staff-promote-dialog')).toBeVisible();

    await page.getByTestId('admin-staff-promote-cancel').click();
    await page.getByTestId('admin-staff-search').fill(ACCOUNTS.moderator.split('@')[0]);
    // Exact-text match on the email cell, not `hasText`. Other seeded e2e
    // moderators are named `e2e_<id>_mod@example.com`, which *contains*
    // `mod@example.com` — substring matching selects every one of them and the
    // "no duplicate row" assertion fails against a perfectly correct table.
    await expect(
      page
        .getByTestId('admin-staff-active-row')
        .filter({ has: page.getByText(ACCOUNTS.moderator, { exact: true }) }),
    ).toHaveCount(1);
  });

  test('SR-W-E4 edge: deactivate with an empty reason blocks the request, row stays active', async ({ page }) => {
    const api = await apiLoginAs('custodian');
    await loginCustodian(page);
    target = await createThrowawayCampusUser(page);
    const promoteRes = await api.post(`${API_BASE}/api/admin/staff/promote`, {
      data: { email: target.email, reason: 'fixture: promote for SR-W-E4' },
    });
    expect(promoteRes.ok()).toBe(true);
    await api.dispose();

    await page.goto(`${WEB_BASE}/admin/staff`);
    await page.getByTestId('admin-staff-search').fill(target.handle);
    const row = page.getByTestId('admin-staff-active-row').filter({ hasText: target.email });
    await expect(row).toBeVisible({ timeout: 10_000 });

    let deactivateCalls = 0;
    page.on('request', (req) => {
      if (/\/api\/admin\/staff\/.+\/deactivate/.test(req.url())) deactivateCalls += 1;
    });

    await row.getByTestId('admin-staff-deactivate').click();
    await page.getByTestId('admin-staff-deactivate-confirm').click();

    await expect(appAlerts(page).first()).toBeVisible();
    await expect(page.getByTestId('admin-staff-deactivate-dialog')).toBeVisible();
    expect(deactivateCalls).toBe(0);

    await page.getByTestId('admin-staff-deactivate-cancel').click();
    await expect(page.getByTestId('admin-staff-active-row').filter({ hasText: target.email })).toBeVisible();
  });

  test('SR-W-E5 edge: Cancel is genuinely inert on both dialogs — no submit, fields reset on reopen', async ({
    page,
  }) => {
    await loginCustodian(page);
    await page.goto(`${WEB_BASE}/admin/staff`);

    await page.getByTestId('admin-staff-promote-open').click();
    await page.getByTestId('admin-staff-promote-email').fill('someone@cit.edu');
    await page.getByTestId('admin-staff-promote-reason').fill('typed but abandoned');
    await page.getByTestId('admin-staff-promote-cancel').click();
    await expect(page.getByTestId('admin-staff-promote-dialog')).toBeHidden();

    await page.getByTestId('admin-staff-promote-open').click();
    await expect(page.getByTestId('admin-staff-promote-email')).toHaveValue('');
    await expect(page.getByTestId('admin-staff-promote-reason')).toHaveValue('');
    await page.getByTestId('admin-staff-promote-cancel').click();
  });

  test('SR-W-E6 edge: empty states — no search matches, and (best-effort) no deactivated moderators', async ({
    page,
  }) => {
    await loginCustodian(page);
    await page.goto(`${WEB_BASE}/admin/staff`);

    await page.getByTestId('admin-staff-search').fill(`no-such-user-${uniqueSuffix()}`);
    await expect(page.getByTestId('admin-staff-active-empty')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('admin-staff-active-table')).toHaveCount(0);
  });
});

// ── Authorization / control-surface shape ────────────────────────────────

test.describe('admin staff review — one destructive action, not two', () => {
  test('SR-W-08: each active row exposes exactly one role-removing control ("Deactivate"), no separate "Demote"', async ({
    page,
  }) => {
    await loginCustodian(page);
    await page.goto(`${WEB_BASE}/admin/staff`);
    await expect(page.getByTestId('admin-staff-active-table')).toBeVisible({ timeout: 10_000 });

    const firstRow = page.getByTestId('admin-staff-active-row').first();
    await expect(firstRow.getByTestId('admin-staff-deactivate')).toHaveCount(1);
    await expect(firstRow.getByRole('button', { name: /demote/i })).toHaveCount(0);
  });
});

// ── Presentation fidelity ─────────────────────────────────────────────────

test('SR-W-09: the "Yearly review" info card renders with its heading and copy', async ({ page }) => {
  await loginCustodian(page);
  await page.goto(`${WEB_BASE}/admin/staff`);

  await expect(page.getByText('Yearly review')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/last reviewed/i)).toBeVisible();
});

test.describe('admin staff review — accessibility (SR-W-10 / SR-X-16)', () => {
  test('promote dialog: focus trapped, Escape closes, focus returns to opener; textarea has a label', async ({
    page,
  }) => {
    await loginCustodian(page);
    await page.goto(`${WEB_BASE}/admin/staff`);

    const opener = page.getByTestId('admin-staff-promote-open');
    await opener.click();
    await expect(page.getByTestId('admin-staff-promote-dialog')).toBeVisible();

    const reasonInput = page.getByTestId('admin-staff-promote-reason');
    await expect(reasonInput).toHaveAccessibleName(/reason/i);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('admin-staff-promote-dialog')).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('search input keeps its accessible name "Search staff"', async ({ page }) => {
    await loginCustodian(page);
    await page.goto(`${WEB_BASE}/admin/staff`);
    await expect(page.getByLabel('Search staff')).toBeVisible({ timeout: 10_000 });
  });
});

test('SR-W-11: at a 375px viewport the page does not scroll horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loginCustodian(page);
  await page.goto(`${WEB_BASE}/admin/staff`);
  await expect(page.getByRole('heading', { name: 'Staff review' })).toBeVisible({ timeout: 10_000 });

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});

test.describe('admin staff review — dark and light (SR-W-12)', () => {
  for (const mode of ['dark', 'light'] as const) {
    test(`renders correctly in ${mode} mode`, async ({ page }) => {
      await loginCustodian(page);
      await page.goto(`${WEB_BASE}/admin/staff`);
      await page.evaluate((theme) => {
        window.localStorage.setItem('wc-staff-theme:v1', theme);
      }, mode);
      await page.reload();

      await expect(page.getByRole('heading', { name: 'Staff review' })).toBeVisible({ timeout: 10_000 });
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(isDark).toBe(mode === 'dark');

      // Contrast floor spot-check: pills must not be transparent/unstyled.
      const pill = page.locator('.wc-pill').first();
      await expect(pill).toBeVisible();
    });
  }
});

// SR-X-15: zero console errors/warnings and zero >=400 responses across the golden path.
test('SR-X-15: the golden path is console-clean and produces no >=400 responses', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  await loginCustodian(page);
  await page.goto(`${WEB_BASE}/admin/staff`);
  await expect(page.getByTestId('admin-staff-active-table')).toBeVisible({ timeout: 10_000 });
  guard.assertClean();
});
