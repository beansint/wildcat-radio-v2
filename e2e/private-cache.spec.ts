import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { forceNativeHls, toneWav } from './_live-path-mocks';

const profiles = {
  alice: { id: 'alice', handle: 'alice_private', name: 'Alice', email: 'alice@example.test', yearLevel: 4, college: 'Alice private college', gender: 'female', notifyInApp: false },
  bob: { id: 'bob', handle: 'bob_listener', name: 'Bob', email: 'bob@example.test', yearLevel: null, college: null, gender: null, notifyInApp: true },
};
type Owner = keyof typeof profiles;

async function fixture(context: BrowserContext, staff = false) {
  let owner: Owner | null = 'alice';
  let failBob = false;
  let releaseAlice: (() => void) | undefined;
  let holdAlice = false;
  let held = false;
  let exportHeld = false;
  let releaseExport: (() => void) | undefined;
  const reads: string[] = [];
  const now = new Date().toISOString();
  const session = () => owner ? {
    user: { ...profiles[owner], emailVerified: true, class: 'GUEST', role: staff ? 'MODERATOR' : 'LISTENER', createdAt: now, updatedAt: now },
    session: { id: `session-${owner}`, userId: owner, token: 'fixture', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), createdAt: now, updatedAt: now },
  } : null;
  await context.route('http://127.0.0.1:3220/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/get-session') return reply(session());
    if (path === '/api/auth/sign-out') { owner = null; return reply({ success: true }); }
    if (path === '/api/auth/sign-in/email') {
      owner = route.request().postDataJSON().email.startsWith('bob') ? 'bob' : 'alice';
      return reply({ ...session(), redirect: false, token: 'fixture' });
    }
    if (path === '/api/stream/manifest') return reply({ status: 'LIVE', reason: null, type: 'hls', url: 'http://127.0.0.1:3220/tone.wav', dj: ['Public DJ'], episodeId: null, showId: null, showName: 'Public show' });
    if (path === '/tone.wav') return route.fulfill({ contentType: 'audio/wav', body: toneWav() });
    if (path === '/api/me/data/export') {
      exportHeld = true;
      await new Promise<void>(resolve => { releaseExport = resolve; });
      return reply({ email: 'alice@example.test' });
    }
    if (path === '/api/mod/queue') {
      if (owner === 'bob' && failBob) return reply({}, 503);
      return reply({ reports: owner === 'alice' ? [{ id: 'private-report', reporterId: 'reporter', targetUserId: 'target', targetHandle: 'private_subject', targetClass: 'GUEST', reason: 'Alice private staff report', status: 'OPEN', resolvedById: null, resolvedAt: null, createdAt: now }] : [], watchFlags: [], appeals: [], reinstatements: [] });
    }
    if (path === '/api/users/me') {
      const requestedOwner = owner;
      reads.push(`${requestedOwner}:profile`);
      if (holdAlice && requestedOwner === 'alice') {
        held = true;
        await new Promise<void>(resolve => { releaseAlice = resolve; });
      }
      if (failBob && requestedOwner === 'bob') return reply({ message: 'Bob fixture unavailable' }, 503);
      return reply(requestedOwner ? { ...profiles[requestedOwner], class: 'GUEST', emailVerified: true, ageBucketContributed: false } : {}, requestedOwner ? 200 : 401);
    }
    if (path === '/api/users/me/standing') {
      reads.push(`${owner}:standing`);
      if (failBob && owner === 'bob') return reply({}, 503);
      return reply({ mutedUntil: null, bannedAt: null, strikes: owner === 'alice' ? [{ id: 'alice-strike', reason: 'Alice private strike', createdAt: now, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), appealedAt: null }] : [], reinstatementRequests: [] });
    }
    if (path === '/api/consent') {
      reads.push(`${owner}:consent`);
      if (failBob && owner === 'bob') return reply({}, 503);
      return reply(owner === 'alice' ? [{ id: 'alice-consent', scope: 'DEMOGRAPHICS', noticeVersion: 'Alice-private-notice', grantedAt: now, withdrawnAt: null }] : []);
    }
    if (path.startsWith('/api/')) return reply([]);
    return route.abort();
  });
  return {
    setOwner: (next: Owner | null) => { owner = next; },
    failBob: () => { failBob = true; },
    holdAlice: () => { holdAlice = true; },
    held: () => held,
    release: () => releaseAlice?.(),
    exportHeld: () => exportHeld,
    releaseExport: () => releaseExport?.(),
    reads,
  };
}

async function navigate(page: Page, path: string) {
  await expect(page.getByTestId('account-menu')).toBeHidden();
  await page.getByTestId('account-menu-trigger').click();
  await expect(page.getByTestId('account-menu')).toBeVisible();
  const id = path === '/profile' ? 'profile' : path === '/my-data' ? 'my-data' : 'standing';
  await page.getByTestId(`account-menu-${id}`).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByTestId('account-menu')).toBeHidden();
}

async function broadcast(tab: Page) {
  await tab.evaluate(() => localStorage.setItem('better-auth.message', JSON.stringify({ event: 'session', data: { trigger: 'getSession' }, clientId: String(Math.random()), timestamp: Date.now() })));
}

test('CACHE golden: same-tab logout/login discards fresh profile, form, consent and standing without replacing audio', async ({ page, context }) => {
  const api = await fixture(context);
  await forceNativeHls(page);
  await page.goto('/profile');
  await expect(page.locator('#profile-edit-handle')).toHaveValue('alice_private');
  await page.locator('#profile-edit-handle').fill('alice_unsaved');
  await page.getByTestId('player-play').click();
  await expect.poll(() => page.getByTestId('player-audio').evaluate((a: HTMLAudioElement) => !a.paused)).toBe(true);
  await page.getByTestId('player-audio').evaluate(a => { a.setAttribute('data-owner-test', 'original'); });
  await navigate(page, '/my-data');
  await expect(page.getByTestId('privacy-consent-history')).toContainText('Alice-private-notice');
  await navigate(page, '/profile/standing');
  await expect(page.getByText('Alice private strike', { exact: true })).toBeVisible();
  await navigate(page, '/profile');
  await page.getByTestId('profile-signout').click();
  await expect(page.getByTestId('auth-email')).toBeVisible();
  await page.getByTestId('auth-email').fill('bob@example.test');
  await page.getByTestId('auth-password').fill('Password123!');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('account-menu-trigger')).toBeVisible();
  await navigate(page, '/profile');
  await expect(page.locator('#profile-edit-handle')).toHaveValue('bob_listener');
  await expect(page.getByText('alice@example.test', { exact: false })).toHaveCount(0);
  await expect(page.getByTestId('profile-consent')).not.toBeChecked();
  await navigate(page, '/my-data');
  await expect(page.getByTestId('privacy-consent-history')).toHaveCount(0);
  await navigate(page, '/profile/standing');
  await expect(page.getByText('Alice private strike')).toHaveCount(0);
  expect(api.reads).toContain('bob:profile');
  expect(api.reads).toContain('bob:consent');
  expect(api.reads).toContain('bob:standing');
  await expect(page.getByTestId('player-audio')).toHaveAttribute('data-owner-test', 'original');
  await expect.poll(() => page.getByTestId('player-audio').evaluate((a: HTMLAudioElement) => !a.paused)).toBe(true);
});

for (const stale of [false, true]) test(`CACHE edge: cross-tab switch with ${stale ? 'stale' : 'fresh'} data and failed B loads reveals no A data`, async ({ page, context }) => {
  const api = await fixture(context);
  await page.clock.install();
  await page.goto('/profile');
  await expect(page.locator('#profile-edit-handle')).toHaveValue('alice_private');
  await navigate(page, '/my-data');
  await expect(page.getByTestId('privacy-consent-history')).toContainText('Alice-private-notice');
  await navigate(page, '/profile/standing');
  await expect(page.getByText('Alice private strike', { exact: true })).toBeVisible();
  const sibling = await context.newPage();
  await sibling.goto('/legal/privacy');
  if (stale) await page.clock.fastForward(31_000);
  api.failBob();
  api.setOwner('bob');
  await broadcast(sibling);
  await expect(page.getByTestId('account-menu-trigger')).toHaveAttribute('aria-label', /bob_listener/);
  await expect(page.getByText('Alice private strike')).toHaveCount(0);
  await navigate(page, '/my-data');
  await expect(page.getByTestId('privacy-consent-unknown')).toBeVisible();
  await expect(page.getByTestId('privacy-consent-history')).toHaveCount(0);
  await navigate(page, '/profile');
  await expect(page.locator('#profile-edit-handle')).toHaveCount(0);
  await expect(page.getByText('alice@example.test', { exact: false })).toHaveCount(0);
});

test('CACHE edge: delayed Alice response cannot hydrate Bob after a cross-tab switch', async ({ page, context }) => {
  const api = await fixture(context);
  api.holdAlice();
  await page.goto('/profile');
  await expect.poll(api.held).toBe(true);
  const sibling = await context.newPage();
  await sibling.goto('/legal/privacy');
  api.setOwner('bob');
  await broadcast(sibling);
  await expect(page.locator('#profile-edit-handle')).toHaveValue('bob_listener');
  api.release();
  await expect(page.locator('#profile-edit-handle')).toHaveValue('bob_listener');
  await expect(page.getByText('alice@example.test', { exact: false })).toHaveCount(0);
});

test('CACHE edge: real sibling-tab login and logout reset the open profile and its unsaved form', async ({ page, context }) => {
  await fixture(context);
  await page.goto('/profile');
  await expect(page.locator('#profile-edit-handle')).toHaveValue('alice_private');
  await page.locator('#profile-edit-handle').fill('alice_unsaved');
  const sibling = await context.newPage();
  await sibling.goto('/login');
  // Let the initial session resolve before typing into the owner-scoped form.
  await sibling.waitForLoadState('networkidle');
  await sibling.getByTestId('auth-email').fill('bob@example.test');
  await sibling.getByTestId('auth-password').fill('Password123!');
  await sibling.getByTestId('auth-submit').click();
  await expect(sibling.getByTestId('account-menu-trigger')).toHaveAttribute('aria-label', /bob_listener/);
  await expect(page.getByTestId('account-menu-trigger')).toHaveAttribute('aria-label', /bob_listener/);
  await expect(page.locator('#profile-edit-handle')).toHaveValue('bob_listener');
  await sibling.getByTestId('account-menu-trigger').click();
  await sibling.getByTestId('account-menu-signout').click();
  await expect(page.locator('#profile-edit-handle')).toHaveCount(0);
  await expect(page).toHaveURL(/\/login/);
});

test('CACHE edge: a delayed private export cannot download after its owner changes', async ({ page, context }) => {
  const api = await fixture(context);
  await page.goto('/my-data');
  await expect(page.getByTestId('privacy-consent-history')).toContainText('Alice-private-notice');
  await page.getByTestId('privacy-export').click();
  await expect.poll(api.exportHeld).toBe(true);
  const sibling = await context.newPage();
  await sibling.goto('/legal/privacy');
  api.setOwner('bob');
  await broadcast(sibling);
  await expect(page.getByTestId('account-menu-trigger')).toHaveAttribute('aria-label', /bob_listener/);
  const download = page.waitForEvent('download', { timeout: 1200 }).catch(() => null);
  api.releaseExport();
  expect(await download).toBeNull();
});

test('CACHE edge: staff data and an open moderation form clear even when the next staff read fails', async ({ page, context }) => {
  const api = await fixture(context, true);
  await page.goto('/mod/queue');
  await expect(page.getByText('Alice private staff report')).toBeVisible();
  await page.getByTestId('mod-queue-strike').click();
  await page.getByTestId('mod-strike-reason').fill('Alice unfinished moderation reason');
  const sibling = await context.newPage();
  await sibling.goto('/legal/privacy');
  api.setOwner('bob');
  api.failBob();
  await broadcast(sibling);
  await expect(page.getByText('Alice private staff report')).toHaveCount(0);
  await expect(page.getByTestId('mod-strike-reason')).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: /could not|couldn.t|failed/i })).toBeVisible();
});



