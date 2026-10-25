import { expect, test } from '@playwright/test';
import { json, manifestBody, mockEngagement, mockManifest, mockSocket, mockVerifiedListener } from './_live-path-mocks';

test('RT-2: push wakes off-air and turns episodes without HTTP polling or listener membership', async ({ page }) => {
  await page.clock.install();
  await mockVerifiedListener(page);
  await mockEngagement(page);
  const socket = await mockSocket(page);
  const manifest = await mockManifest(page, manifestBody({status: 'OFF_AIR', episodeId: null}));
  await page.goto('/listen');
  await expect(page.getByTestId('player-status')).toHaveText('OFF_AIR');
  await expect.poll(() => socket.connections()).toBeGreaterThan(0);
  await page.waitForTimeout(100);
  socket.emit('stream:manifest', manifestBody({showName: 'Recovered Hour', url: 'http://localhost:3230/test.m3u8'}));
  await expect(page.getByTestId('player-status')).toHaveText('LIVE');
  await expect(page.getByTestId('player-play')).toBeEnabled();
  const baseline = manifest.requests();
  for (let i = 0; i < 4; i++) {
    await page.clock.fastForward(15_000);
    socket.emit('stream:manifest', manifestBody({episodeId: 'next-episode', showName: 'Next Hour'}));
    await expect(page.getByTestId('player-status')).toHaveText('LIVE');
  }
  await expect.poll(() => socket.received().filter(e => e.event === 'episode:join').some(e => (e.payload as {episodeId: string}).episodeId === 'next-episode')).toBe(true);
  expect(manifest.requests()).toBe(baseline);
  expect(socket.received().filter(e => e.event === 'listening:join')).toEqual([]);
  await page.screenshot({path: 'test-results/realtime-golden.png', fullPage: true});
});

test('RT-3: a silent socket falls back and an older HTTP read cannot undo a newer push', async ({ page }) => {
  await page.clock.install();
  await mockVerifiedListener(page);
  await mockEngagement(page);
  const socket = await mockSocket(page);
  const manifest = await mockManifest(page, manifestBody());
  await page.goto('/listen');
  await expect(page.getByTestId('player-status')).toHaveText('LIVE');
  await expect.poll(() => socket.connections()).toBeGreaterThan(0);
  await page.waitForTimeout(100);
  const baseline = manifest.requests();
  let release: (() => void) | undefined;
  await page.route('**/api/stream/manifest', async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await json(route, manifestBody({status: 'OFF_AIR', episodeId: null})).catch(() => {});
  });
  await page.clock.fastForward(40_000);
  await expect.poll(() => !!release).toBe(true);
  socket.emit('stream:manifest', manifestBody({episodeId: 'newer', showName: 'Newer Show'}));
  await expect.poll(() => socket.received().some(e => e.event === 'episode:join' && (e.payload as {episodeId: string}).episodeId === 'newer')).toBe(true);
  release?.();
  await page.waitForTimeout(100);
  await expect(page.getByTestId('player-status')).toHaveText('LIVE');
  expect(baseline).toBeGreaterThan(0);
  await page.screenshot({path: 'test-results/realtime-edge.png', fullPage: true});
});

test('RT-2 controls: connected delivery stops routine reads and invalidation recovers persisted controls', async ({ page }) => {
  await page.clock.install();
  await mockVerifiedListener(page);
  await mockEngagement(page);
  const socket = await mockSocket(page);
  await mockManifest(page, manifestBody());
  let reads = 0;
  let paused = false;
  await page.route('**/api/episodes/*/controls', route => {
    reads++;
    return json(route, {episodeId: 'live-path-episode', chatPaused: paused, submissionsPaused: false, staffChatFrozen: false, staffGuestsDisabled: false});
  });
  await page.goto('/listen');
  const input = page.locator('form[aria-label="Desktop chat input"]').getByTestId('listen-chat-input');
  await expect(input).toBeEnabled();
  await expect.poll(() => socket.connections()).toBeGreaterThan(0);
  await page.waitForTimeout(100);
  const baseline = reads;
  for (let i = 0; i < 3; i++) {
    await page.clock.fastForward(15_000);
    socket.emit('stream:manifest', manifestBody());
    await expect(page.getByTestId('player-status')).toHaveText('LIVE');
  }
  expect(reads).toBe(baseline);
  paused = true;
  socket.emit('engagement:controls', {episodeId: 'live-path-episode'});
  await expect(input).toHaveCount(0);
  await expect(page.getByText("Listener chat is paused by the booth for this episode.").first()).toBeVisible();
});

test('RT-2 lifecycle: authoritative push reopens a resumed episode without terminal-marker polling', async ({page}) => {
  await page.clock.install();
  await mockVerifiedListener(page);
  await mockEngagement(page);
  const socket = await mockSocket(page);
  const manifest = await mockManifest(page, manifestBody());
  await page.goto('/listen');
  const input = page.locator('form[aria-label="Desktop chat input"]').getByTestId('listen-chat-input');
  await expect(input).toBeEnabled();
  await expect.poll(() => socket.connections()).toBeGreaterThan(0);
  await page.waitForTimeout(100);
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
  socket.emit('stream:manifest', manifestBody());
  await page.waitForTimeout(50);
  manifest.set(manifestBody({status: 'STATION_ROTATION'}));
  socket.emit('episode:ended', {episodeId: 'live-path-episode'});
  await expect(input).toHaveCount(0);
  socket.emit('stream:manifest', manifestBody());
  await page.waitForTimeout(50);
  await page.clock.runFor(1);
  await expect(input).toBeEnabled();
});

test('RT-3: a rejected room admission retries on the same socket before snapshot recovery', async ({page}) => {
  await page.clock.install();
  await mockVerifiedListener(page);
  const messages: unknown[] = [];
  await mockEngagement(page, messages);
  const socket = await mockSocket(page, {rejectEpisodeJoins: 1});
  await mockManifest(page, manifestBody());
  await page.goto('/listen');
  await expect.poll(() => socket.received().filter(e => e.event === 'episode:join').length).toBe(1);
  const connections = socket.connections();
  messages.push({id: 'missed', content: 'Recovered after admission', createdAt: new Date().toISOString(), author: {handle: 'listener'}});
  await page.clock.fastForward(1_500);
  await expect(page.getByText('Recovered after admission').first()).toBeVisible();
  expect(socket.connections()).toBe(connections);
  expect(socket.received().filter(e => e.event === 'episode:join')).toHaveLength(2);
});

test('RT-3 controls: a failed read recovers while the transport stays connected', async ({page}) => {
  await page.clock.install();
  await mockVerifiedListener(page);
  await mockEngagement(page);
  const socket = await mockSocket(page);
  await mockManifest(page, manifestBody());
  let failing = true;
  let failures = 0;
  await page.route('**/api/episodes/*/controls', route => {
    if (failing) { failures++; return json(route, {message:'temporary outage'}, 503); }
    return json(route, {episodeId:'live-path-episode', chatPaused:true, submissionsPaused:false, staffChatFrozen:false, staffGuestsDisabled:false});
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
  await expect(page.getByText('Listener chat is paused by the booth for this episode.').first()).toBeVisible();
  expect(socket.connections()).toBe(connections);
});
