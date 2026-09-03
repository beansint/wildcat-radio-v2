import path from 'node:path';
import { execBackendTsx } from './_fixtures';
import { expect, test } from '@playwright/test';

// /admin/escalations — custodian-only review of appeals + reinstatement
// requests escalated by moderators. Golden path proves the 3 SegTabs render;
// edges prove tab switching + the decision-dialog required-response
// validation, plus the CUSTODIAN-only RBAC gate (MODERATOR and LISTENER are
// both redirected to `/`, per `(staff)/admin/layout.tsx`).
//
// TODO: no CUSTODIAN seed account is documented in e2e/mod-access.spec.ts or
// the seed script (`pnpm --filter @wildcat/db seed` only creates
// mod@example.com/MODERATOR and test@example.com/LISTENER — see
// reference-wildcat-dev-ports memory). Add a CUSTODIAN row to the seed (or a
// one-off Prisma upsert here) before this spec can actually run; until then
// CUSTODIAN_EMAIL/CUSTODIAN_PASSWORD below are placeholders.
const CUSTODIAN_EMAIL = 'custodian@example.com'; // TODO: not yet seeded — see note above.
const CUSTODIAN_PASSWORD = 'Password123!'; // TODO: confirm once a CUSTODIAN seed row exists.
const MOD_EMAIL = 'mod@example.com';
const LISTENER_EMAIL = 'test@example.com';
const PASSWORD = 'Password123!';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3011';
const BACKEND_DIR = process.env.WILDCAT_BACKEND_DIR ?? path.resolve(process.cwd(), '../wildcat-radio-v2-backend');
const FIXTURE_PREFIX = 'e2e-esc-qa-';

function uniqueSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/** Runs a small Prisma script against the backend DB (pattern shared with e2e/mod-org-schedule-attendance.spec.ts). */
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
    execBackendTsx(script);
  } catch (error) {
    const details =
      error instanceof Error && 'stderr' in error
        ? String((error as Error & { stderr?: Buffer }).stderr)
        : String(error);
    throw new Error(`Backend fixture failed: ${details}`);
  }
}

/**
 * Seeds one OPEN appeal against the LISTENER seed account (test@example.com)
 * so the "Pending appeals" tab + Review dialog have a real row to exercise.
 * Cleaned up in afterAll by id prefix.
 */
function seedOpenAppeal(runId: string) {
  const appealId = `${FIXTURE_PREFIX}appeal-${runId}`;
  runPrismaScript(`
    const user = await prisma.user.findUniqueOrThrow({ where: { email: ${JSON.stringify(LISTENER_EMAIL)} } });
    await prisma.appeal.upsert({
      where: { id: ${JSON.stringify(appealId)} },
      update: { status: 'OPEN', text: 'I was struck for a track ID I did not post.', userId: user.id },
      create: { id: ${JSON.stringify(appealId)}, userId: user.id, text: 'I was struck for a track ID I did not post.', status: 'OPEN' },
    });
  `);
  return { appealId };
}

function cleanupFixtures() {
  runPrismaScript(`
    await prisma.appeal.deleteMany({ where: { id: { startsWith: ${JSON.stringify(FIXTURE_PREFIX)} } } });
    await prisma.reinstatementRequest.deleteMany({ where: { id: { startsWith: ${JSON.stringify(FIXTURE_PREFIX)} } } });
  `);
}

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

test.describe('admin escalations — RBAC', () => {
  // Edge: a MODERATOR (non-custodian) visiting /admin/escalations is
  // redirected to the staff portal — /admin/* is custodian-only, unlike
  // /mod/*. getStaffPortalPath returns /mod/roster for staff roles; only
  // listeners fall through to / (src/lib/auth/staff-routing.ts, documented on
  // (staff)/admin/layout.tsx; admin-staff-review.spec.ts SR-W-07/SR-X-01d
  // asserts the same destination).
  test('edge: MODERATOR visiting /admin/escalations is redirected to /mod/roster', async ({ page }) => {
    await login(page, MOD_EMAIL, PASSWORD);
    await page.goto(`${BASE}/admin/escalations`);
    await expect(page).toHaveURL(new RegExp(`^${BASE}/mod/roster$`), { timeout: 8_000 });
  });

  // Edge: a LISTENER visiting /admin/escalations is redirected away too.
  test('edge: LISTENER visiting /admin/escalations is redirected to /', async ({ page }) => {
    await login(page, LISTENER_EMAIL, PASSWORD);
    await page.goto(`${BASE}/admin/escalations`);
    await expect(page).toHaveURL(new RegExp(`^${BASE}/?$`), { timeout: 8_000 });
  });
});

test.describe('admin escalations — golden path + edges', () => {
  const runId = uniqueSuffix();

  test.beforeAll(() => {
    seedOpenAppeal(runId);
  });

  test.afterAll(() => {
    cleanupFixtures();
  });

  // Golden: a CUSTODIAN logs in, visits /admin/escalations, sees the 3 tabs.
  test('golden: CUSTODIAN sees the 3 escalation tabs', async ({ page }) => {
    await login(page, CUSTODIAN_EMAIL, CUSTODIAN_PASSWORD);
    await page.goto(`${BASE}/admin/escalations`);

    await expect(page.getByTestId('esc-tabs-pending')).toBeVisible();
    await expect(page.getByTestId('esc-tabs-reinstate')).toBeVisible();
    await expect(page.getByTestId('esc-tabs-resolved')).toBeVisible();
  });

  // Edge: switching tabs changes the visible panel.
  test('edge: switching tabs changes panels', async ({ page }) => {
    await login(page, CUSTODIAN_EMAIL, CUSTODIAN_PASSWORD);
    await page.goto(`${BASE}/admin/escalations`);

    await expect(page.getByTestId('esc-appeal-card').first()).toBeVisible();

    await page.getByTestId('esc-tabs-reinstate').click();
    await expect(page.getByTestId('esc-appeal-card')).toHaveCount(0);

    await page.getByTestId('esc-tabs-resolved').click();
    await expect(page.getByTestId('esc-appeal-card')).toHaveCount(0);
    await expect(page.getByTestId('esc-reinstate-card')).toHaveCount(0);

    await page.getByTestId('esc-tabs-pending').click();
    await expect(page.getByTestId('esc-appeal-card').first()).toBeVisible();
  });

  // Edge: opening Review shows the decision dialog, and deciding without a
  // written response surfaces a role="alert" validation message instead of
  // submitting.
  test('edge: Review opens the decision dialog and requires a written response', async ({ page }) => {
    await login(page, CUSTODIAN_EMAIL, CUSTODIAN_PASSWORD);
    await page.goto(`${BASE}/admin/escalations`);

    await page.getByTestId('esc-review').first().click();
    await expect(page.getByTestId('esc-decision-dialog')).toBeVisible();

    // Pick an outcome but leave the response empty — Decide should not
    // resolve the mutation; it should surface a role="alert" instead.
    await page.getByTestId('esc-overturn').click();
    await page.getByTestId('esc-decide').click();

    await expect(page.getByRole('alert').filter({ hasText: /written response is required/i })).toBeVisible();
    // Dialog stays open — no premature POST to moderationControllerResolveAppeal.
    await expect(page.getByTestId('esc-decision-dialog')).toBeVisible();

    // Now fill the response and decide for real.
    await page.getByTestId('esc-response').fill('Reviewed the context — overturning the strike.');
    await page.getByTestId('esc-decide').click();

    await expect(page.getByTestId('esc-decision-dialog')).not.toBeVisible({ timeout: 8_000 });
  });
});
