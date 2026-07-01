import { execFileSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const WEB_BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? process.env.PLAYWRIGHT_API_BASE ?? 'http://localhost:3001';
const BACKEND_DIR = process.env.WILDCAT_BACKEND_DIR ?? path.resolve(process.cwd(), '../wildcat-radio-v2-backend');
const STATION_TOKEN = process.env.STATION_DEVICE_TOKEN ?? 'dev-studio-token-change-me';
const TOKEN_HASH = createHash('sha256').update(STATION_TOKEN).digest('hex');
const ROSTER_ID = 'e2e-fe7-roster-3011';
const PASSWORD = 'Password123!';

function uniqueId() {
  return `fe7${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function backendEnv(name: string) {
  if (process.env[name]) return process.env[name];
  for (const envPath of [
    path.join(BACKEND_DIR, 'apps/api/.env'),
    path.join(BACKEND_DIR, 'packages/db/.env'),
    path.join(BACKEND_DIR, '.env'),
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
      dotenv.config({ path: ${JSON.stringify(path.join(BACKEND_DIR, '.env'))} });
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
      const prisma = new PrismaClient({ adapter });
      await prisma.rosterEntry.upsert({
        where: { id: ${JSON.stringify(ROSTER_ID)} },
        update: { displayName: 'FE7 Studio', isActive: true },
        create: { id: ${JSON.stringify(ROSTER_ID)}, displayName: 'FE7 Studio', isActive: true },
      });
      await prisma.stationSession.upsert({
        where: { id: 'e2e-fe7-station-3011' },
        update: { tokenHash: ${JSON.stringify(TOKEN_HASH)}, isActive: true, label: 'FE7 Studio Token' },
        create: { id: 'e2e-fe7-station-3011', label: 'FE7 Studio Token', tokenHash: ${JSON.stringify(TOKEN_HASH)}, isActive: true },
      });
      await prisma.$disconnect();
    }
    main().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;
  try {
    execFileSync('pnpm', ['--dir', BACKEND_DIR, '--filter', '@wildcat/api', 'exec', 'tsx', '-e', script], { stdio: 'pipe' });
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

async function openEpisode(request: APIRequestContext) {
  const timeIn = await request.post(`${API_BASE}/api/studio/time-in`, {
    headers: { Authorization: `Bearer ${STATION_TOKEN}` },
    data: { rosterId: ROSTER_ID },
  });
  expect(timeIn.ok()).toBeTruthy();
  await request.post(`${API_BASE}/api/stream/heartbeat`, {
    headers: { Authorization: `Bearer ${STATION_TOKEN}` },
    data: { sourceConnected: true },
  });
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

async function unlockStudio(page: Page) {
  await page.addInitScript((token) => window.localStorage.setItem('wildcat.stationToken', token), STATION_TOKEN);
  await page.goto('/studio');
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

  test('AC-8: studio console locks behind station token entry', async ({ page }) => {
    await page.goto('/studio');

    await expect(page.getByRole('heading', { name: 'Studio console' })).toBeVisible();
    await expect(page.getByTestId('studio-token-input')).toBeVisible();
    await expect(page.getByTestId('studio-token-save')).toBeVisible();
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
    await expect(listener.getByText(/Sent to the booth/i)).toBeVisible({ timeout: 10_000 });

    await unlockStudio(studio);
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
    await expect(listener.getByText(/Sent to the booth/i)).toBeVisible({ timeout: 10_000 });

    await unlockStudio(studio);
    await studio.getByText(declinedText).waitFor({ state: 'visible', timeout: 15_000 });
    await actOnQueueItem(studio, declinedText, 'Decline');
    await expect(studio.getByText(/Declined silently/i)).toBeVisible({ timeout: 10_000 });
    await expect(listener.getByTestId('engagement-up-next').getByText(declinedText)).toHaveCount(0);
    await expect(listener.getByText('Your request is up next.')).toHaveCount(0);

    await submitRequest(listener, secondText);
    await expect(listener.getByText(/Sent to the booth/i)).toBeVisible({ timeout: 10_000 });
    await submitRequest(listener, overBudgetText);
    await expect(listener.getByRole('alert').filter({ hasText: /Queue limit reached/i })).toBeVisible({ timeout: 10_000 });

    await listenerContext.close();
    await studioContext.close();
  });
});
