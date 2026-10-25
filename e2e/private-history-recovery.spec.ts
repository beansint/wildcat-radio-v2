import {expect, test} from '@playwright/test';
import {json, manifestBody, mockEngagement, mockManifest, mockSocket, mockVerifiedListener} from './_live-path-mocks';

function history(text: string, status = 'PENDING') {
  return {episodeId: 'live-path-episode', items: [{id: 'private-item', type: 'REQUEST', text, status, recipient: null,
    createdAt: '2026-10-25T00:00:00.000Z', actedAt: null}], budget: {limit: 2, used: 1, remaining: 1}, historyTruncated: false};
}

test('private history stays quiet while healthy and recovers CLOSED from a quiet invalidation', async ({page}) => {
  await page.clock.install();
  await mockVerifiedListener(page);
  await mockEngagement(page);
  const socket = await mockSocket(page);
  await mockManifest(page, manifestBody());
  let status = 'PENDING';
  let reads = 0;
  await page.route('**/api/episodes/*/queue/mine', route => {reads++; return json(route,
    {...history('Quiet private request', status), episodeId:new URL(route.request().url()).pathname.split('/')[3]});});
  await page.goto('/listen');
  await expect(page.getByTestId('submission-budget')).toBeVisible();
  await page.getByTestId('my-submissions').locator('summary').click();
  await expect(page.getByTestId('submission-status')).toHaveText('Pending');
  await expect.poll(() => socket.connections()).toBeGreaterThan(0);
  const beforeAdmission = reads;
  socket.emit('queue:mine-changed', {episodeId:'live-path-episode'});
  await expect.poll(() => reads).toBeGreaterThan(beforeAdmission);
  await page.waitForTimeout(100);
  const baseline = reads;
  for (let i = 0; i < 4; i++) {
    await page.clock.fastForward(15_000);
    socket.emit('stream:manifest', manifestBody());
    await page.waitForTimeout(20);
  }
  expect(reads).toBe(baseline);
  status = 'CLOSED';
  socket.emit('queue:mine-changed', {episodeId:'live-path-episode'});
  await expect(page.getByTestId('submission-status')).toHaveText('Closed');
  await expect(page.getByText('Your request is up next.')).toHaveCount(0);
  await expect(page.getByText('The booth read your message.')).toHaveCount(0);
  status = 'PENDING';
  socket.emit('stream:manifest', manifestBody({episodeId:'next-private-episode'}));
  await expect(page.getByTestId('submission-status')).toHaveText('Pending');
  await page.waitForTimeout(100);
  const nextEpisode = reads;
  for (let i=0; i<4; i++) {
    await page.clock.fastForward(15_000);
    socket.emit('stream:manifest', manifestBody({episodeId:'next-private-episode'}));
    await page.waitForTimeout(20);
  }
  expect(reads).toBe(nextEpisode);
});

test('private history keeps bounded recovery until private channel admission is proven', async ({page}) => {
  await page.clock.install();
  await mockVerifiedListener(page);
  await mockEngagement(page);
  const socket = await mockSocket(page);
  await mockManifest(page, manifestBody());
  let reads = 0;
  await page.route('**/api/episodes/*/queue/mine', route => {reads++; return json(route, history('Admission recovery'));});
  await page.goto('/listen');
  await expect(page.getByTestId('submission-budget')).toBeVisible();
  await expect.poll(() => socket.connections()).toBeGreaterThan(0);
  await page.waitForTimeout(100);
  const initial = reads;
  for (let i=0; i<4; i++) {
    await page.clock.fastForward(15_000);
    socket.emit('stream:manifest', manifestBody());
    await page.waitForTimeout(20);
  }
  expect(reads).toBeGreaterThan(initial);
  expect(reads - initial).toBeLessThanOrEqual(3);
  const unproven = reads;
  socket.emit('queue:mine-changed', {episodeId:'live-path-episode'});
  await expect.poll(() => reads).toBeGreaterThan(unproven);
  await page.waitForTimeout(100);
  const admitted = reads;
  for (let i=0; i<4; i++) {
    await page.clock.fastForward(15_000);
    socket.emit('stream:manifest', manifestBody());
    await page.waitForTimeout(20);
  }
  expect(reads).toBe(admitted);
  const connections = socket.connections();
  socket.drop();
  await page.clock.fastForward(3_000);
  await expect.poll(() => socket.connections()).toBeGreaterThan(connections);
  await page.waitForTimeout(100);
  const reconnected = reads;
  for (let i=0; i<4; i++) {
    await page.clock.fastForward(15_000);
    socket.emit('stream:manifest', manifestBody());
    await page.waitForTimeout(20);
  }
  expect(reads).toBeGreaterThan(reconnected);
});

test('private history remembers OFF_AIR admission before its owner loads and the show starts', async ({page}) => {
  await page.clock.install();
  await mockEngagement(page);
  const socket = await mockSocket(page);
  await mockManifest(page, manifestBody({status:'OFF_AIR', episodeId:null}));
  let release: (() => void) | undefined;
  await page.route('**/api/auth/get-session', async route => {
    await new Promise<void>(resolve => {release=resolve;});
    await json(route, {session:{id:'late-session', userId:'late-user', token:'late', expiresAt:'2027-10-25T00:00:00Z'},
      user:{id:'late-user', email:'late@example.test', name:'Late user', handle:'late', emailVerified:true}});
  });
  let reads=0;
  await page.route('**/api/episodes/*/queue/mine', route => {reads++; return json(route, history('Admitted before mount'));});
  await page.goto('/listen');
  await expect.poll(() => socket.connections()).toBeGreaterThan(0);
  await expect.poll(() => !!release).toBe(true);
  socket.emit('queue:mine-changed', {episodeId:null});
  await page.waitForTimeout(50);
  release?.();
  await expect(page.getByRole('button', {name:'Account menu (@late)'})).toBeVisible();
  socket.emit('stream:manifest', manifestBody());
  await expect(page.getByTestId('submission-budget')).toBeVisible();
  await page.waitForTimeout(100);
  const admitted=reads;
  for (let i=0; i<4; i++) {
    await page.clock.fastForward(15_000);
    socket.emit('stream:manifest', manifestBody());
    await page.waitForTimeout(20);
  }
  expect(reads).toBe(admitted);
});

test('private history retries a failed read on a connected transport', async ({page}) => {
  await page.clock.install();
  await mockVerifiedListener(page);
  await mockEngagement(page);
  const socket = await mockSocket(page);
  await mockManifest(page, manifestBody());
  let failing = true;
  let failures = 0;
  await page.route('**/api/episodes/*/queue/mine', route => {
    if (failing) {failures++; return json(route, {message:'temporary history outage'}, 503);}
    return json(route, history('Recovered history'));
  });
  await page.goto('/listen');
  await expect.poll(() => failures).toBeGreaterThan(0);
  await expect.poll(() => socket.connections()).toBeGreaterThan(0);
  await page.waitForTimeout(100);
  const connections = socket.connections();
  failing = false;
  for (let i = 0; i < 4; i++) {
    await page.clock.fastForward(15_000);
    socket.emit('stream:manifest', manifestBody());
    await page.waitForTimeout(20);
  }
  await expect(page.getByTestId('submission-budget')).toBeVisible();
  expect(socket.connections()).toBe(connections);
});

test('private history ignores an older owner response after sign-out and another account signs in', async ({page}) => {
  await mockEngagement(page);
  await mockSocket(page);
  await mockManifest(page, manifestBody());
  const makeSession = (id: string) => ({session:{id:`session-${id}`, userId:id, token:id, expiresAt:'2027-10-25T00:00:00Z'},
    user:{id, email:`${id}@example.test`, name:id, handle:id, emailVerified:true, class:'CAMPUS', role:'LISTENER'}});
  let owner: string | null = 'owner-a';
  await page.route('**/api/auth/get-session', route => json(route, owner ? makeSession(owner) : null));
  await page.route('**/api/auth/sign-out', route => {owner=null; return json(route, {success:true});});
  await page.route('**/api/auth/sign-in/email', route => {owner='owner-b'; return json(route, {redirect:false, token:'owner-b', user:makeSession('owner-b').user});});
  let release: (() => void) | undefined;
  await page.route('**/api/episodes/*/queue/mine', async route => {
    if (owner === 'owner-a') {
      await new Promise<void>(resolve => {release=resolve;});
      await json(route, history('OWNER A PRIVATE RESPONSE')).catch(() => {});
    } else await json(route, history('Owner B private history'));
  });
  await page.goto('/listen');
  await expect.poll(() => !!release).toBe(true);
  await page.getByRole('button', {name:'Account menu (@owner-a)'}).click();
  await page.getByRole('menuitem', {name:'Sign out'}).click();
  await page.goto('/login');
  await page.getByTestId('auth-email').fill('owner-b@example.test');
  await page.getByTestId('auth-password').fill('Password123!');
  await page.getByTestId('auth-submit').click();
  await page.waitForURL(url => url.pathname === '/');
  await page.goto('/listen');
  await expect(page.getByTestId('submission-budget')).toBeVisible();
  release?.();
  await page.getByTestId('my-submissions').locator('summary').click();
  await expect(page.getByText('Owner B private history', {exact:true})).toBeVisible();
  await expect(page.getByText('OWNER A PRIVATE RESPONSE')).toHaveCount(0);
});
