import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, request as playwrightRequest, test, type Page } from '@playwright/test';
import { API_BASE, WEB_BASE, PASSWORD } from './_fixtures';
import { localDb } from './_broadcast-integrity';

// Actual generated Better Auth links, captured only at the Resend transport.
// Start e2e/local-mail-api.cjs; this deliberately does not manufacture a JWT or
// set emailVerified directly for verification acceptance.
const emails: string[] = [];
type CapturedMail = { id: string; idempotencyKey: string; to: string[]; subject: string; text: string };
function capturePath() {
  const configured = process.env.AUTH_EMAIL_CAPTURE_PATH;
  if (!configured || !path.resolve(configured).split(path.sep).includes('.agent')) {
    throw new Error('Account verification requires the guarded local-mail-api and an explicit .agent AUTH_EMAIL_CAPTURE_PATH');
  }
  return path.resolve(configured);
}
function capturedMail(email: string, subject: RegExp): CapturedMail | undefined {
  const file = capturePath();
  if (!existsSync(file)) return undefined;
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as CapturedMail)
    .find(mail => mail.to.includes(email) && subject.test(mail.subject));
}
async function actualMailLink(email: string, subject: RegExp) {
  await expect.poll(() => !!capturedMail(email, subject), { timeout: 90_000, message: 'Actual generated mail reaches the local provider boundary' }).toBe(true);
  const mail = capturedMail(email, subject)!;
  const link = mail.text.match(/https?:\/\/\S+/)?.[0];
  if (!link || new URL(link).origin !== API_BASE) throw Error('Generated email must link to the isolated API');
  return link;
}
function identity(prefix: string) {
  const handle = `${prefix}${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const email = `${handle}@example.com`;
  emails.push(email);
  return { handle, email };
}
async function register(page: Page, user: { handle: string; email: string }) {
  await page.goto(`${WEB_BASE}/register`);
  await page.getByTestId('auth-email').fill(user.email);
  await page.getByTestId('auth-handle').fill(user.handle);
  await page.getByTestId('auth-password').fill(PASSWORD);
  await page.getByTestId('auth-confirm').fill(PASSWORD);
  await page.getByTestId('auth-terms').check();
  await page.getByTestId('auth-submit').click();
  await expect(page.getByRole('heading', { name: /welcome.*wildcat/i })).toBeVisible();
}

test.describe('account verification and recovery — real generated links', () => {
  test.setTimeout(150_000);
  test.afterAll(() => {
    if (!emails.length) return;
    const remaining = localDb<number>(`
      const emails=${JSON.stringify(emails)};
      const users=await p.user.findMany({where:{email:{in:emails}},select:{id:true}});
      const ids=users.map(user=>user.id);
      await p.session.deleteMany({where:{userId:{in:ids}}});
      await p.account.deleteMany({where:{userId:{in:ids}}});
      await p.notification.deleteMany({where:{userId:{in:ids}}});
      await p.consentRecord.deleteMany({where:{userId:{in:ids}}});
      await p.user.deleteMany({where:{id:{in:ids}}});
      const {createHash,createHmac}=await import('node:crypto');
      const key=createHash('sha256').update('wildcat:auth-mail:v1:').update(process.env.AUTH_EMAIL_ENCRYPTION_KEY||process.env.BETTER_AUTH_SECRET!).digest();
      const hashes=emails.map(email=>createHmac('sha256',key).update('mailbox:'+email).digest('hex'));
      await p.authEmailJob.deleteMany({where:{recipientHash:{in:hashes}}});
      return p.user.count({where:{email:{in:emails}}});
    `);
    expect(remaining).toBe(0);
  });

  test('AC-1/2: signup, truthful resend cooldown, actual link, fresh verified profile', async ({ page }) => {
    const user = identity('verify');
    await register(page, user);
    await page.goto(`${WEB_BASE}/profile`);
    const resend = page.getByRole('button', { name: 'Resend verification email' });
    await expect(resend).toBeVisible();
    await resend.click();
    await expect(page.getByRole('alert').filter({ hasText: /wait|seconds/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Try again in/ })).toBeDisabled();
    await expect(page.getByText('Verification email queued.', { exact: false })).toHaveCount(0);
    await page.goto(await actualMailLink(user.email, /verify/i));
    await expect(page).toHaveURL(new RegExp(`${WEB_BASE.replaceAll('.', '\\.')}\/verify-email`));
    await expect(page.getByRole('heading', { name: /email verified/i })).toBeVisible();
    await page.goto(`${WEB_BASE}/profile`);
    await expect(page.getByTestId('profile-handle')).toHaveText(`@${user.handle}`);
    await expect(page.getByRole('button', { name: 'Resend verification email' })).toHaveCount(0);
    const profile = await page.request.get(`${API_BASE}/api/users/me`);
    expect(profile.ok()).toBe(true);
    expect((await profile.json()).emailVerified).toBe(true);
  });

  test('AC-1: actual verification link opened signed out returns to app and permits verified login', async ({ browser, request }) => {
    const user = identity('away');
    const signup = await request.post(`${API_BASE}/api/auth/sign-up/email`, {
      headers: { Origin: WEB_BASE },
      data: { ...user, name: user.handle, password: PASSWORD, callbackURL: `${WEB_BASE}/verify-email?returned=1` },
    });
    expect(signup.ok()).toBe(true);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(await actualMailLink(user.email, /verify/i));
      await expect(page).toHaveURL(new RegExp('/verify-email'));
      expect(new URL(page.url()).origin).toBe(WEB_BASE);
      await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible();
      await page.goto(`${WEB_BASE}/login`);
      await page.getByTestId('auth-email').fill(user.email);
      await page.getByTestId('auth-password').fill(PASSWORD);
      await page.getByTestId('auth-submit').click();
      await page.waitForURL(`${WEB_BASE}/`);
      const profile = await page.request.get(`${API_BASE}/api/users/me`);
      expect((await profile.json()).emailVerified).toBe(true);
    } finally { await context.close(); }
  });

  test('AC-1/4: actual reset link updates password and revokes an existing session', async ({ page }) => {
    const user = identity('reset');
    // Deterministic existing-account fixture; reset token itself must come from
    // the real UI -> Better Auth -> durable mail -> transport path below.
    localDb(`
      const {hashPassword}=await import('better-auth/crypto');
      const user=await p.user.create({data:{email:${JSON.stringify(user.email)},handle:${JSON.stringify(user.handle)},name:'Reset fixture',emailVerified:true}});
      await p.account.create({data:{userId:user.id,providerId:'credential',accountId:user.id,password:await hashPassword(${JSON.stringify(PASSWORD)})}});
    `);
    const oldSession = await playwrightRequest.newContext({ extraHTTPHeaders: { Origin: WEB_BASE } });
    try {
      expect((await oldSession.post(`${API_BASE}/api/auth/sign-in/email`, { data: { email: user.email, password: PASSWORD } })).ok()).toBe(true);
      expect((await oldSession.get(`${API_BASE}/api/users/me`)).ok()).toBe(true);
      await page.goto(`${WEB_BASE}/forgot-password`);
      await page.getByLabel('Email', { exact: true }).fill(user.email);
      await page.getByRole('button', { name: 'Send reset link' }).click();
      await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
      await page.goto(await actualMailLink(user.email, /reset/i));
      expect(new URL(page.url()).origin).toBe(WEB_BASE);
      await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
      await page.getByLabel('New password', { exact: true }).fill('ReplacementPass123!');
      await page.getByLabel('Confirm password', { exact: true }).fill('ReplacementPass123!');
      await page.getByRole('button', { name: 'Update password' }).click();
      await expect(page.getByRole('heading', { name: 'Password updated!' })).toBeVisible();
      expect((await oldSession.get(`${API_BASE}/api/users/me`)).status()).toBe(401);
      const login = await page.request.post(`${API_BASE}/api/auth/sign-in/email`, {
        headers: { Origin: WEB_BASE }, data: { email: user.email, password: 'ReplacementPass123!' },
      });
      expect(login.ok()).toBe(true);
    } finally { await oldSession.dispose(); }
  });

  test('AC-1/2: invalid callback gives recovery without claiming verification success', async ({ page }) => {
    await page.goto(`${WEB_BASE}/verify-email?returned=1&error=TOKEN_EXPIRED`);
    await expect(page.getByRole('heading', { name: /expired|invalid/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /email verified/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible();
  });
});
