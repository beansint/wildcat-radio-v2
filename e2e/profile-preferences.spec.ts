import { expect, test, request, type APIRequestContext } from '@playwright/test';
import { API_BASE, WEB_BASE, execBackendTsx } from './_fixtures';

let api: APIRequestContext;
let userId = '';
const email = `profile_${Date.now()}@cit.edu`;
const password = 'Password123!';
const db = new URL(process.env.DATABASE_URL ?? '');

test.beforeAll(async () => {
  const url = new URL(API_BASE);
  if (url.hostname !== 'localhost' || url.port !== '3314' || db.hostname !== '127.0.0.1' || db.port !== '55432' || db.pathname !== '/review_frontend') throw new Error('Use isolated consumer API3314 and review_frontend DB');
  api = await request.newContext({ baseURL: API_BASE, extraHTTPHeaders: { Origin: WEB_BASE } });
  const signup = await api.post('/api/auth/sign-up/email', { data: { email, password, name: 'Profile fixture', handle: `profile_${Date.now()}` } });
  expect(signup.ok()).toBeTruthy();
  userId = (await signup.json()).user.id;
  execBackendTsx(`import { PrismaService } from './src/prisma/prisma.service'; const p=new PrismaService(); async function main(){ await p.user.update({where:{id:${JSON.stringify(userId)}},data:{emailVerified:true,class:'CAMPUS'}}); await p.$disconnect(); } main().catch(e=>{console.error(e);process.exit(1)});`);
});
test.afterAll(async () => {
  if (userId) execBackendTsx(`import { PrismaService } from './src/prisma/prisma.service'; const p=new PrismaService(); async function main(){ await p.consentRecord.deleteMany({where:{userId:${JSON.stringify(userId)}}}); await p.user.delete({where:{id:${JSON.stringify(userId)}}}); await p.$disconnect(); } main().catch(e=>{console.error(e);process.exit(1)});`);
  await api.dispose();
});
test.beforeEach(async ({ page }) => {
  expect((await api.patch('/api/users/me', { data: { yearLevel: 2, college: 'CCS — Computer Studies', gender: 'Woman', notifyEmail: false, notifyInApp: false } })).ok()).toBeTruthy();
  await page.goto('/login');
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-submit').click();
  await page.waitForURL(url => url.pathname === '/');
  await page.goto('/profile');
  await expect(page.getByTestId('profile-year')).toContainText('2nd year');
});

test('AC-1: opt-out survives reload and demographics cannot write pending preference edits', async ({ page }) => {
  await expect(page.getByTestId('notif-inapp')).not.toBeChecked();
  await page.getByTestId('notif-inapp').click();
  await page.getByRole('button', { name: 'Man', exact: true }).click();
  await page.getByTestId('profile-consent').click();
  const patch = page.waitForRequest(r => r.method() === 'PATCH' && r.url().endsWith('/api/users/me'));
  await page.getByTestId('profile-save').click();
  const body = (await patch).postDataJSON();
  expect(body).not.toHaveProperty('notifyInApp');
  expect(body).not.toHaveProperty('notifyEmail');
  await expect(page.getByTestId('profile-save')).toBeEnabled();
  const stored = await (await api.get('/api/users/me')).json();
  expect(stored).toMatchObject({ notifyEmail: false, notifyInApp: false, gender: 'Man' });
  await page.reload();
  await expect(page.getByTestId('notif-inapp')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Man', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('AC-2: cleared demographics are persisted as explicit null and stay cleared after reload', async ({ page }) => {
  await page.getByTestId('profile-year').click();
  await page.getByRole('option', { name: 'Select year', exact: true }).click();
  await page.getByTestId('profile-college').click();
  await page.getByRole('option', { name: 'Select college', exact: true }).click();
  await page.getByRole('button', { name: 'Woman', exact: true }).click();
  await page.getByTestId('profile-consent').click();
  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('profile-save')).toBeEnabled();
  expect(await (await api.get('/api/users/me')).json()).toMatchObject({ yearLevel: null, college: null, gender: null, notifyInApp: false, notifyEmail: false });
  await page.reload();
  await expect(page.getByTestId('profile-year')).toContainText('Select year');
  await expect(page.getByTestId('profile-college')).toContainText('Select college');
  await expect(page.getByRole('button', { name: 'Woman', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('AC-3: keyboard preference save writes only supported preference and preserves demographics', async ({ page }) => {
  await page.getByTestId('notif-inapp').focus();
  await page.keyboard.press('Space');
  const patch = page.waitForRequest(r => r.method() === 'PATCH' && r.url().endsWith('/api/users/me'));
  await expect(page.getByTestId('profile-notification-save')).toBeVisible();
  await page.getByTestId('profile-notification-save').click();
  expect((await patch).postDataJSON()).toEqual({ notifyInApp: true });
  await expect(page.getByTestId('profile-notification-saved')).toBeVisible();
  expect(await (await api.get('/api/users/me')).json()).toMatchObject({ yearLevel: '2', college: 'CCS — Computer Studies', gender: 'Woman', notifyInApp: true, notifyEmail: false });
  await page.reload();
  await expect(page.getByTestId('notif-inapp')).toBeChecked();
  await expect(page.getByTestId('notif-email')).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'Announcement pushes' })).toHaveCount(0);
});

test('AC-4: unavailable profile cannot expose writable default preferences', async ({ page }) => {
  await page.route('**/api/users/me', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Profile temporarily unavailable' }) }));
  await page.reload();
  await expect(page.getByText('Could not load your profile.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('profile-save')).toHaveCount(0);
  await expect(page.getByTestId('notif-inapp')).toHaveCount(0);
  await page.unroute('**/api/users/me');
  const retry = page.getByRole('button', { name: 'Try again', exact: true });
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('profile-year')).toContainText('2nd year');
  await expect(page.getByTestId('notif-inapp')).not.toBeChecked();
});
