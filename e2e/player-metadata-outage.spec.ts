import { expect, test, type Page } from '@playwright/test';

const sampleRate = 8000;
const sampleCount = sampleRate * 180;
const wave = Buffer.alloc(44 + sampleCount * 2);
wave.write('RIFF', 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(sampleRate, 24); wave.writeUInt32LE(sampleRate * 2, 28);
wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36);
wave.writeUInt32LE(sampleCount * 2, 40);
for (let i = 0; i < sampleCount; i++) wave.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / sampleRate) * 1000), 44 + i * 2);

async function fixture(page: Page, initial: 'ready' | 'error' = 'ready', live = false) {
  let response: 'ready' | 'error' | 'off-air' = initial;
  await page.clock.install();
  await page.addInitScript(() => {
    // Exercise the native-media branch with a real Chromium PCM decoder,
    // not a play()/paused/currentTime stub. This is not live HLS proof.
    MediaSource.isTypeSupported = () => false;
    const original = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function(type) {
      return type === 'application/vnd.apple.mpegurl' ? 'probably' : original.call(this, type);
    };
  });
  await page.routeWebSocket('**/socket.io/**', socket => socket.close());
  await page.route('**/metadata-fixture.wav', route => route.fulfill({ contentType: 'audio/wav', body: wave }));
  await page.route('**/api/stream/manifest', route => response === 'error'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Controlled metadata outage' }) })
    : route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: response === 'off-air' ? 'OFF_AIR' : (live ? 'LIVE' : 'STATION_ROTATION'), reason: response === 'off-air' ? 'SOURCE_STALE' : null, type: 'hls', url: response === 'off-air' ? null : `${process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3311'}/metadata-fixture.wav`, dj: [], episodeId: live ? 'metadata-live-fixture' : null, showId: null, showName: null }) }));
  await page.goto('/');
  return (next: typeof response) => { response = next; };
}
async function start(page: Page) {
  await expect(page.getByTestId('player-status')).toHaveText('STATION_ROTATION');
  await page.getByTestId('player-play').click();
  await expect.poll(() => page.getByTestId('player-audio').evaluate((node: HTMLAudioElement) => !node.paused && node.currentTime > 0.05)).toBe(true);
}
const paused = (page: Page) => page.getByTestId('player-audio').evaluate((node: HTMLAudioElement) => node.paused);
const time = (page: Page) => page.getByTestId('player-audio').evaluate((node: HTMLAudioElement) => node.currentTime);

// #127: one failed poll (plus its two retries) keeps the last good status —
// it must not flip to UNAVAILABLE, and the sounding audio is untouched.
test('AC-1: brief status outage keeps the last good status and sounding audio', async ({ page }) => {
  const respond = await fixture(page); await start(page); const before = await time(page);
  respond('error'); await page.clock.fastForward(15_100);
  for (let i = 0; i < 4; i++) await page.clock.fastForward(1_000); // poll + 1 s + 2 s retries all fail
  await expect(page.getByTestId('player-status')).toHaveText('STATION_ROTATION');
  await expect.poll(() => paused(page)).toBe(false);
  await expect.poll(() => time(page)).toBeGreaterThan(before);
  respond('ready'); await page.clock.fastForward(15_100);
  await expect(page.getByTestId('player-status')).toHaveText('STATION_ROTATION');
  await expect.poll(() => paused(page)).toBe(false);
  await expect.poll(() => time(page)).toBeGreaterThan(before);
});

test('AC-2: repeated failures do not extend last-good grace forever', async ({ page }) => {
  const respond = await fixture(page); await start(page);
  respond('error'); await page.clock.fastForward(15_100);
  await page.clock.fastForward(15_100); // 30 s without a good poll → unavailable
  await expect(page.getByTestId('player-status')).toHaveText('UNAVAILABLE', { timeout: 10_000 });
  await expect.poll(() => paused(page)).toBe(false);
  await page.clock.fastForward(20_000);
  await expect.poll(() => paused(page)).toBe(false);
  await page.clock.fastForward(15_000); // past 60 s since the last good poll
  await expect.poll(() => paused(page)).toBe(true);
  await expect(page.getByTestId('player-play')).toBeDisabled();
});

test('AC-3: initial failure does not invent a playable source and recovery requires intent', async ({ page }) => {
  const respond = await fixture(page, 'error');
  // No last good status to keep: unavailable once the first poll's retries
  // (1 s, 2 s backoff, driven on the fake clock) fail.
  await expect.poll(async () => { await page.clock.fastForward(1_000); return page.getByTestId('player-status').textContent(); }, { timeout: 30_000 }).toBe('UNAVAILABLE');
  await expect(page.getByTestId('player-play')).toBeDisabled();
  await expect.poll(() => paused(page)).toBe(true);
  respond('ready'); await page.clock.fastForward(15_100);
  await expect(page.getByTestId('player-play')).toBeEnabled(); await expect.poll(() => paused(page)).toBe(true);
  await page.getByTestId('player-play').focus(); await page.keyboard.press('Enter');
  await expect.poll(() => paused(page)).toBe(false);
});

test('AC-4: fresh off-air evidence stops playback immediately', async ({ page }) => {
  const respond = await fixture(page); await start(page);
  respond('off-air'); await page.clock.fastForward(15_100);
  await expect(page.getByTestId('player-status')).toHaveText('OFF_AIR');
  await expect.poll(() => paused(page)).toBe(true);
  await expect(page.getByTestId('player-play')).toBeDisabled();
});


test('AC-5: retained LIVE audio cannot authorize reactions or claim fresh Live during outage', async ({ page }) => {
  let writes = 0;
  await page.route('**/api/episodes/*/reactions', route => { writes++; return route.fulfill({ json: {} }); });
  const respond = await fixture(page, 'ready', true);
  await expect(page.getByTestId('player-status')).toHaveText('LIVE');
  await page.getByTestId('player-play').click();
  await expect.poll(() => paused(page)).toBe(false);
  await expect(page.getByTestId('player-react')).toBeVisible();
  respond('error'); await page.clock.fastForward(15_100); await page.clock.fastForward(15_100);
  await expect(page.getByTestId('player-status')).toHaveText('UNAVAILABLE', { timeout: 10_000 });
  await expect.poll(() => paused(page)).toBe(false);
  await expect(page.getByTestId('player-react')).toHaveCount(0);
  await expect(page.locator('.wc-badge-live, .wc-player-mini-live')).toHaveCount(0);
  expect(writes).toBe(0);
  respond('ready'); await page.clock.fastForward(15_100);
  await expect(page.getByTestId('player-react')).toBeVisible();
});
