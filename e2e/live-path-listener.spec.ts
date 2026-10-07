import { expect, test, type Page } from '@playwright/test';
import { attachConsoleGuard } from './_console';
import {
  audioPlaying,
  audioTime,
  forceNativeHls,
  manifestBody,
  mockEngagement,
  mockManifest,
  mockSocket,
  mockVerifiedListener,
  toneWav,
} from './_live-path-mocks';

/**
 * live-path-hardening (#127) — listener resilience, W-E1..W-E4.
 * Catalog: .agent/test-suites/live-path-hardening/web/e2e.md
 *
 * BUTT↔harbor blips are normal: a blip must never flap the listener UI and
 * never cost a chat draft; the player must ride out a dead playlist on its own.
 */

const WAV = toneWav();
const EXPECTED_503 = /\/api\/stream\/manifest$/;

/** The desktop composer (the mobile one is mounted too, but `lg:hidden`). */
const chatInput = (page: Page) =>
  page.locator('form[aria-label="Desktop chat input"]').getByTestId('listen-chat-input');

/**
 * Advance the fake clock a second at a time until `check` holds — drives
 * retry/backoff timers deterministically instead of waiting on wall time
 * (keeps the specs stable on a loaded machine).
 */
async function tickUntil<T>(page: Page, check: () => Promise<T> | T, expected: T, timeout = 30_000) {
  await expect
    .poll(async () => {
      await page.clock.fastForward(1_000);
      return check();
    }, { timeout })
    .toBe(expected);
}

async function listener(page: Page) {
  await page.clock.install();
  await mockVerifiedListener(page);
  await mockEngagement(page);
  const socket = await mockSocket(page);
  return socket;
}

test.describe('live-path listener', () => {
  test('W-E1: one failed manifest poll keeps LIVE, play and the chat composer', async ({ page }) => {
    const guard = attachConsoleGuard(page);
    await listener(page);
    const manifest = await mockManifest(page, manifestBody());
    await page.goto('/listen');

    await expect(page.getByTestId('player-status')).toHaveText('LIVE');
    const input = chatInput(page);
    await expect(input).toBeEnabled();
    await input.fill('draft through a blip');

    manifest.set(503);
    await page.clock.fastForward(15_100);
    // The poll and both of its retries fail (1 s, 2 s backoff) …
    await tickUntil(page, () => manifest.failures(), 3);
    // … and nothing on screen moved.
    await expect(page.getByTestId('player-status')).toHaveText('LIVE');
    await expect(page.getByRole('heading', { name: 'Broadcast status unavailable' })).toHaveCount(0);
    await expect(page.getByTestId('player-play')).toBeEnabled();
    await expect(input).toHaveValue('draft through a blip');
    await expect(input).toBeEnabled();

    manifest.set(manifestBody());
    await page.clock.fastForward(15_100);
    await expect.poll(() => manifest.requests()).toBeGreaterThan(4);
    await expect(page.getByTestId('player-status')).toHaveText('LIVE');
    await expect(input).toHaveValue('draft through a blip');

    // The only console noise is the browser logging the three injected 503s.
    expect(guard.errors().filter((e) => !e.includes('503 (Service Unavailable)'))).toEqual([]);
    expect(guard.badResponses().filter((r) => !EXPECTED_503.test(r.url))).toEqual([]);
  });

  test('W-E1b: a sustained outage still reports unavailable (30 s without a good poll)', async ({ page }) => {
    await listener(page);
    const manifest = await mockManifest(page, manifestBody());
    await page.goto('/listen');
    await expect(page.getByTestId('player-status')).toHaveText('LIVE');

    manifest.set(503);
    await page.clock.fastForward(15_100);
    await tickUntil(page, () => manifest.failures(), 3);
    await expect(page.getByTestId('player-status')).toHaveText('LIVE');
    await page.clock.fastForward(15_100);
    await expect(page.getByTestId('player-status')).toHaveText('UNAVAILABLE', { timeout: 10_000 });
  });

  test('W-E2: a 20 s ROTATION blip keeps the draft, the open sheet, and says "Signal interrupted"', async ({ page }) => {
    const guard = attachConsoleGuard(page);
    await listener(page);
    const manifest = await mockManifest(page, manifestBody());
    await page.goto('/listen');

    const input = chatInput(page);
    await expect(input).toBeEnabled();
    await input.fill('please play the next one');
    await page.getByTestId('engagement-open-request').click();
    const sheet = page.getByTestId('engagement-sheet');
    await expect(sheet).toBeVisible();
    await page.getByTestId('engagement-request-song').fill('half-typed request');

    manifest.set(manifestBody({ status: 'STATION_ROTATION', reason: 'SOURCE_STALE', dj: [] }));
    await page.clock.fastForward(15_100);
    await expect(page.getByTestId('player-status')).toHaveText('STATION_ROTATION');
    const chip = page.getByTestId('listen-signal-interrupted');
    await expect(chip).toHaveText(/Signal interrupted/);
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId('engagement-request-song')).toHaveValue('half-typed request');
    await expect(page.getByText('Chat is available during a live episode')).toHaveCount(0);

    // Still inside the 60 s grace window 20 s later.
    await page.clock.fastForward(20_000);
    await expect(chip).toBeVisible();
    await expect(sheet).toBeVisible();
    await expect(page.getByText('Chat is available during a live episode')).toHaveCount(0);

    manifest.set(manifestBody());
    await page.clock.fastForward(15_100);
    await expect(page.getByTestId('player-status')).toHaveText('LIVE');
    await expect(chip).toHaveCount(0);
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId('engagement-request-song')).toHaveValue('half-typed request');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(input).toHaveValue('please play the next one');
    guard.assertClean();
  });

  test('W-E2b: non-LIVE for over 60 s closes chat; OFF_AIR closes it at once', async ({ page }) => {
    await listener(page);
    const manifest = await mockManifest(page, manifestBody());
    await page.goto('/listen');
    await expect(chatInput(page)).toBeEnabled();

    manifest.set(manifestBody({ status: 'STATION_ROTATION', reason: 'SOURCE_STALE', dj: [] }));
    await page.clock.fastForward(15_100);
    await expect(page.getByTestId('listen-signal-interrupted')).toBeVisible();
    await page.clock.fastForward(61_000);
    await expect(chatInput(page)).toHaveCount(0);
    await expect(page.getByTestId('listen-signal-interrupted')).toHaveCount(0);
    await expect(page.getByText('Chat is available during a live episode')).toBeVisible();

    manifest.set(manifestBody());
    await page.clock.fastForward(15_100);
    await expect(chatInput(page)).toBeEnabled();
    manifest.set(manifestBody({ status: 'OFF_AIR', reason: 'PUBLICATION_STALE', url: null, dj: [], episodeId: null }));
    await page.clock.fastForward(15_100);
    await expect(page.getByTestId('player-status')).toHaveText('OFF_AIR');
    await expect(chatInput(page)).toHaveCount(0);
    await expect(page.getByTestId('listen-signal-interrupted')).toHaveCount(0);
  });

  test('W-E3: the stream URL failing 3× resumes on its own (native pipeline, real decoder)', async ({ page }) => {
    await listener(page);
    await forceNativeHls(page);
    let streamRequests = 0;
    await page.route('**/live-path-stream.wav', (route) => {
      streamRequests += 1;
      return streamRequests <= 3
        ? route.fulfill({ status: 503, body: 'harbor reconnecting' })
        : route.fulfill({ contentType: 'audio/wav', body: WAV });
    });
    await mockManifest(page, manifestBody({ status: 'STATION_ROTATION', reason: 'NO_ATTENDANCE', url: '/live-path-stream.wav', episodeId: null, dj: [] }));
    await page.goto('/listen');
    await expect(page.getByTestId('player-status')).toHaveText('STATION_ROTATION');

    await page.getByTestId('player-play').click();
    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', /Reconnecting/, { timeout: 10_000 });
    // Backoff 1 s → 2 s → 4 s; the fourth request succeeds. No second click.
    await tickUntil(page, () => audioPlaying(page), true);
    expect(streamRequests).toBeGreaterThanOrEqual(4);
    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', 'Pause');
  });

  test('W-E3b: hls.js — the playlist failing 3× resumes on its own', async ({ page }) => {
    await listener(page);
    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = async function () {};
    });
    let playlistRequests = 0;
    await page.route('**/live-path.m3u8', (route) => {
      playlistRequests += 1;
      return playlistRequests <= 3
        ? route.fulfill({ status: 503, body: 'harbor reconnecting' })
        : route.fulfill({
            contentType: 'application/vnd.apple.mpegurl',
            body: ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:6', '#EXT-X-MEDIA-SEQUENCE:1', '#EXTINF:6.0,', 'seg_1.ts'].join('\n'),
          });
    });
    await page.route('**/seg_1.ts', (route) => route.fulfill({ status: 404, body: '' }));
    await mockManifest(page, manifestBody({ status: 'STATION_ROTATION', reason: 'NO_ATTENDANCE', url: '/live-path.m3u8', episodeId: null, dj: [] }));
    await page.goto('/listen');
    await expect(page.getByTestId('player-status')).toHaveText('STATION_ROTATION');

    await page.getByTestId('player-play').click();
    await tickUntil(page, () => playlistRequests >= 4, true);
    // Recovered playlist → MANIFEST_PARSED → play(): the session is back without a click.
    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', /Pause|Reconnecting/);
    await expect(page.getByTestId('player-play')).not.toHaveAttribute('aria-label', 'Play live stream');
  });

  test('W-E4: a stream URL swap keeps playing without going idle', async ({ page }) => {
    await listener(page);
    await forceNativeHls(page);
    const requested: string[] = [];
    await page.route('**/live-path-*.wav', (route) => {
      requested.push(new URL(route.request().url()).pathname);
      return route.fulfill({ contentType: 'audio/wav', body: WAV });
    });
    const manifest = await mockManifest(page, manifestBody({ status: 'STATION_ROTATION', reason: 'NO_ATTENDANCE', url: '/live-path-a.wav', episodeId: null, dj: [] }));
    await page.goto('/listen');
    await expect(page.getByTestId('player-status')).toHaveText('STATION_ROTATION');
    await page.getByTestId('player-play').click();
    await expect.poll(() => audioPlaying(page), { timeout: 20_000 }).toBe(true);
    // Record every label the play button shows from here on.
    await page.getByTestId('player-play').evaluate((button) => {
      const seen: string[] = [];
      (window as unknown as { __labels: string[] }).__labels = seen;
      new MutationObserver(() => seen.push(button.getAttribute('aria-label') ?? '')).observe(button, { attributes: true, attributeFilter: ['aria-label'] });
    });

    manifest.set(manifestBody({ status: 'STATION_ROTATION', reason: 'NO_ATTENDANCE', url: '/live-path-b.wav', episodeId: null, dj: [] }));
    await page.clock.fastForward(15_100);
    await expect.poll(() => requested.includes('/live-path-b.wav'), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => page.getByTestId('player-audio').evaluate((node: HTMLAudioElement) => node.currentSrc), { timeout: 10_000 }).toContain('/live-path-b.wav');
    const before = await audioTime(page);
    await expect.poll(() => audioTime(page), { timeout: 20_000 }).toBeGreaterThan(before);
    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', 'Pause');
    const labels = await page.evaluate(() => (window as unknown as { __labels: string[] }).__labels);
    expect(labels).not.toContain('Play live stream');
  });
});
