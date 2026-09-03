import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, request as pwRequest, test, type APIRequestContext, type Page } from '@playwright/test';

// FE#55 — these were locally redeclared with stale defaults (3000/3001 instead of
// 3011/3010) and a third env-var spelling (`PLAYWRIGHT_API_BASE`) used nowhere
// else. Re-exported from the shared fixtures so there is one source of truth.
import { API_BASE, WEB_BASE, execBackendTsx } from './_fixtures';
const BACKEND_DIR = process.env.WILDCAT_BACKEND_DIR ?? path.resolve(process.cwd(), '../wildcat-radio-v2-backend');
const STATION_TOKEN = process.env.STATION_DEVICE_TOKEN ?? 'dev-studio-token-change-me';
const STATION_DEVICE_ID = process.env.WC_DEVICE_ID ?? 'e2e-browser-device-3011';
const TOKEN_HASH = createHash('sha256').update(STATION_TOKEN).digest('hex');
const ROSTER_ID = 'e2e-fe7-roster-3011';
const STATION_SESSION_ID = 'seed-studio-pc-0001';
const PASSWORD = 'Password123!';

function uniqueId() {
  return `fe7${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function backendEnv(name: string) {
  if (process.env[name]) return process.env[name];
  for (const envPath of [
    path.join(BACKEND_DIR, 'apps/api/.env'),
    path.join(BACKEND_DIR, 'packages/db/.env'),
    path.join(BACKEND_DIR, 'apps', 'api', '.env'),
  ]) {
    try {
      const line = readFileSync(envPath, 'utf8')
        .split(/\r?\n/)
        .find((entry) => entry.startsWith(`${name}=`));
      if (line) return line.slice(name.length + 1).replace(/^['"]|['"]$/g, '');
    } catch {
      // Try the next conventional env location.
    }
  }
  return undefined;
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function buildVerificationToken(email: string) {
  const secret = backendEnv('BETTER_AUTH_SECRET');
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required for engagement e2e verification');
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: 'HS256' });
  const payload = base64UrlJson({ email: email.toLowerCase(), iat: now, exp: now + 3600 });
  const body = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function runBackendFixture() {
  const script = `
    import * as dotenv from 'dotenv';
    import { PrismaPg } from '@prisma/adapter-pg';
    import { PrismaClient } from '@prisma/client';
    async function main() {
      dotenv.config({ path: ${JSON.stringify(path.join(BACKEND_DIR, 'apps', 'api', '.env'))} });
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
      const prisma = new PrismaClient({ adapter });
      await prisma.rosterEntry.upsert({
        where: { id: ${JSON.stringify(ROSTER_ID)} },
        update: { displayName: 'FE7 Studio', isActive: true },
        create: { id: ${JSON.stringify(ROSTER_ID)}, displayName: 'FE7 Studio', isActive: true },
      });
      await prisma.stationSession.upsert({
        where: { id: ${JSON.stringify(STATION_SESSION_ID)} },
        update: { tokenHash: ${JSON.stringify(TOKEN_HASH)}, isActive: true, deviceId: ${JSON.stringify(STATION_DEVICE_ID)}, generation: 1, revokedAt: null, leaseExpiresAt: null, label: 'FE7 Studio Token' },
        create: { id: ${JSON.stringify(STATION_SESSION_ID)}, label: 'FE7 Studio Token', tokenHash: ${JSON.stringify(TOKEN_HASH)}, isActive: true, deviceId: ${JSON.stringify(STATION_DEVICE_ID)} },
      });
      await prisma.$disconnect();
    }
    main().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;
  try {
    execBackendTsx(script);
  } catch (error) {
    const details = error instanceof Error && 'stderr' in error
      ? String((error as Error & { stderr?: Buffer }).stderr)
      : String(error);
    throw new Error(`Backend fixture setup failed: ${details}`);
  }
}

async function createVerifiedListener(request: APIRequestContext) {
  const id = uniqueId();
  const email = `${id}@example.com`;
  const handle = `h${id}`;
  const res = await request.post(`${API_BASE}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE },
    data: { email, password: PASSWORD, name: handle, handle },
  });
  expect(res.ok()).toBeTruthy();
  const verify = await request.get(`${API_BASE}/api/auth/verify-email`, {
    params: { token: buildVerificationToken(email), callbackURL: '/' },
    maxRedirects: 0,
  });
  expect(verify.status()).toBeLessThan(400);
  runBackendFixture();
  return { email, handle };
}

async function openEpisode(request: APIRequestContext): Promise<string> {
  const timeIn = await request.post(`${API_BASE}/api/studio/time-in`, {
    headers: { Authorization: `Bearer ${STATION_TOKEN}`, 'x-wildcat-device-id': STATION_DEVICE_ID },
    data: { rosterId: ROSTER_ID },
  });
  expect(timeIn.ok()).toBeTruthy();
  const episodeId = (await timeIn.json() as { episodeId: string }).episodeId;
  const now = new Date().toISOString();
  const heartbeat = await request.post(`${API_BASE}/api/stream/heartbeat`, {
    headers: { Authorization: `Bearer ${STATION_TOKEN}`, 'x-wildcat-device-id': STATION_DEVICE_ID },
    data: { sourceConnected: true, lastSegmentAt: now, lastPublishedAt: now },
  });
  expect(heartbeat.ok()).toBeTruthy();
  return episodeId;
}

function closeFixtureEpisode(episodeId: string) {
  const script = `
    import * as dotenv from 'dotenv';
    import { PrismaPg } from '@prisma/adapter-pg';
    import { PrismaClient } from '@prisma/client';
    async function main() {
      dotenv.config({ path: ${JSON.stringify(path.join(BACKEND_DIR, 'apps', 'api', '.env'))} });
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
      const prisma = new PrismaClient({ adapter });
      await prisma.episode.updateMany({ where: { id: ${JSON.stringify(episodeId)} }, data: { status: 'OFF_AIR', endedAt: new Date() } });
      await prisma.$disconnect();
    }
    main().catch((error) => { console.error(error); process.exit(1); });
  `;
  execBackendTsx(script);
}

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(PASSWORD);
  await page.getByTestId('auth-submit').click();
  await page.waitForURL(`${WEB_BASE}/`, { timeout: 15_000 });
}

async function submitRequest(page: Page, text: string) {
  const sheet = page.getByTestId('engagement-sheet');
  if (await sheet.isVisible().catch(() => false)) {
    const submit = page.getByTestId('engagement-submit');
    if (await submit.isDisabled().catch(() => false)) {
      await sheet.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
    }
  }
  if (!(await sheet.isVisible().catch(() => false))) {
    const trigger = page.getByTestId('engagement-open-request');
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click({ force: true });
    await sheet.waitFor({ state: 'visible', timeout: 10_000 });
  }
  await page.getByTestId('engagement-request-song').fill(text);
  await page.getByTestId('engagement-request-note').fill('Submitted from Playwright');
  await expect(page.getByTestId('engagement-submit')).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId('engagement-submit').evaluate((element) => (element as HTMLButtonElement).click());
}

async function unlockStudio(page: Page, request: APIRequestContext) {
  const handoff = await request.post(`${API_BASE}/api/studio/handoff`, {
    headers: { Authorization: `Bearer ${STATION_TOKEN}`, 'x-wildcat-device-id': STATION_DEVICE_ID },
  });
  expect(handoff.ok()).toBeTruthy();
  const { handoff: code } = await handoff.json() as { handoff: string };
  await page.goto(`/listen#station_handoff=${encodeURIComponent(code)}`);
  await page.waitForURL(`${WEB_BASE}/studio`, { timeout: 15_000 });
  await page.getByTestId('studio-seg-console').click();
  await page.getByTestId('studio-queue').waitFor({ state: 'visible', timeout: 15_000 });
}

async function actOnQueueItem(page: Page, text: string, action: 'Queue' | 'Decline') {
  const button = page.locator('article').filter({ hasText: text }).first().getByRole('button', { name: action });
  await button.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 320);
  await button.evaluate((element) => (element as HTMLButtonElement).click());
}

test.describe.configure({ mode: 'serial' });

test.describe('engagement UI', () => {
  let fixtureEpisodeId = '';

  test.beforeAll(async () => {
    runBackendFixture();
    const context = await pwRequest.newContext({ baseURL: API_BASE });
    try {
      fixtureEpisodeId = await openEpisode(context);
    } finally {
      await context.dispose();
    }
  });

  test.afterAll(() => {
    if (fixtureEpisodeId) closeFixtureEpisode(fixtureEpisodeId);
  });

  test('AC-1/AC-2: anonymous listener sees gated writes and engagement shell', async ({ page }) => {
    await page.goto('/listen');

    const signInGate = page.getByTestId('listen-gate-signin').first();
    await expect(signInGate).toBeVisible({ timeout: 8_000 });
    await expect(signInGate).toHaveAttribute('href', /login/);
    await expect(signInGate).toHaveAttribute('href', /next=.*listen/);

    await expect(page.getByTestId('listen-chat-input').first()).not.toBeVisible();
    await expect(page.getByTestId('engagement-open-request')).toBeVisible();
    await expect(page.getByTestId('engagement-open-dedication')).toBeVisible();
    await expect(page.getByTestId('engagement-open-qa')).toBeVisible();
    await expect(page.getByTestId('engagement-hype-meter')).toBeVisible();
    await expect(page.getByTestId('engagement-pinned-topic')).toBeVisible();
    await expect(page.getByTestId('engagement-poll')).toBeVisible();
  });

  test('AC-8: studio console locks behind the Electron handoff', async ({ page }) => {
    await page.goto('/studio');

    await expect(page.getByRole('heading', { name: 'Studio console' })).toBeVisible();
    await expect(page.getByTestId('studio-handoff-required')).toBeVisible();
    await expect(page.getByTestId('studio-token-input')).not.toBeVisible();
    await expect(page.getByTestId('studio-queue')).not.toBeVisible();
  });

  test('golden: listener submits request, studio queues it, listener gets receipt and up next', async ({ browser, request }) => {
    const listenerUser = await createVerifiedListener(request);
    await openEpisode(request);

    const listenerContext = await browser.newContext();
    const studioContext = await browser.newContext();
    const listener = await listenerContext.newPage();
    const studio = await studioContext.newPage();
    const requestText = `FE7 golden ${uniqueId()}`;

    await login(listener, listenerUser.email);
    await listener.goto('/listen');
    await listener.getByTestId('listen-chat-input').first().waitFor({ state: 'visible', timeout: 15_000 });
    await listener.waitForTimeout(1_000);
    await submitRequest(listener, requestText);
    await expect(listener.getByText(/Sent to the booth/i).first()).toBeVisible({ timeout: 10_000 });

    await unlockStudio(studio, request);
    await studio.getByText(requestText).waitFor({ state: 'visible', timeout: 15_000 });
    await actOnQueueItem(studio, requestText, 'Queue');
    await expect(studio.getByText(/sent receipt/i)).toBeVisible({ timeout: 10_000 });
    await expect(listener.getByText('Your request is up next.')).toBeVisible({ timeout: 10_000 });
    await expect(listener.getByTestId('engagement-up-next').getByText(requestText)).toBeVisible({ timeout: 15_000 });

    await listenerContext.close();
    await studioContext.close();
  });

  test('edge: decline stays silent and guest budget block is clear', async ({ browser, request }) => {
    const listenerUser = await createVerifiedListener(request);
    await openEpisode(request);

    const listenerContext = await browser.newContext();
    const studioContext = await browser.newContext();
    const listener = await listenerContext.newPage();
    const studio = await studioContext.newPage();
    const declinedText = `FE7 declined ${uniqueId()}`;
    const secondText = `FE7 second ${uniqueId()}`;
    const overBudgetText = `FE7 over ${uniqueId()}`;

    await login(listener, listenerUser.email);
    await listener.goto('/listen');
    await listener.getByTestId('listen-chat-input').first().waitFor({ state: 'visible', timeout: 15_000 });
    await listener.waitForTimeout(1_000);
    await submitRequest(listener, declinedText);
    await expect(listener.getByText(/Sent to the booth/i).first()).toBeVisible({ timeout: 10_000 });

    await unlockStudio(studio, request);
    await studio.getByText(declinedText).waitFor({ state: 'visible', timeout: 15_000 });
    await actOnQueueItem(studio, declinedText, 'Decline');
    await expect(studio.getByText(/Declined silently/i)).toBeVisible({ timeout: 10_000 });
    await expect(listener.getByTestId('engagement-up-next').getByText(declinedText)).toHaveCount(0);
    await expect(listener.getByText('Your request is up next.')).toHaveCount(0);

    await submitRequest(listener, secondText);
    await expect(listener.getByText(/Sent to the booth/i).first()).toBeVisible({ timeout: 10_000 });
    await submitRequest(listener, overBudgetText);
    await expect(listener.getByRole('alert').filter({ hasText: /Queue limit reached/i })).toBeVisible({ timeout: 10_000 });

    await listenerContext.close();
    await studioContext.close();
  });
});
