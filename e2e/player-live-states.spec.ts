import { expect, test } from '@playwright/test';
import { WEB_BASE } from './_fixtures';

/**
 * Player behaviour that only exists while the station is LIVE.
 *
 * WHY THIS STUBS THE MANIFEST
 * ---------------------------
 * The reaction button, the live badge and the connecting/reconnecting phases
 * all require `status === 'LIVE'` plus an episode id. Producing that for real
 * needs the backend, and the backend cannot reach its database from this
 * network at all: outbound TCP to the Neon compute on :5432 is blocked (the
 * Neon HTTPS API still answers, which is why schema queries work while the app
 * times out). Every attempt therefore yields OFF_AIR.
 *
 * So the ONE non-reachable boundary — the manifest HTTP response — is stubbed,
 * and everything downstream of it is the real thing: the real StreamContext,
 * the real phase machine, the real component. That is the house rule for a
 * dependency that cannot be made deterministic here ("stub at the boundary,
 * assert on the seam"), not a licence to mock the component under test.
 *
 * What this genuinely proves: given a LIVE manifest, the bar renders the live
 * affordances and the reaction posts the right request.
 * What it does NOT prove: that the backend ever emits such a manifest, or that
 * `queue:up-next` arrives over the socket. Both still need a real broadcast.
 */

const LIVE_MANIFEST = {
  status: 'LIVE',
  url: 'https://example.invalid/stream/index.m3u8',
  dj: ['DJ Mara', 'DJ Cha'],
  episodeId: 'e2e-live-episode',
};

async function stubLiveManifest(page: import('@playwright/test').Page) {
  await page.route('**/api/stream/manifest', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(LIVE_MANIFEST),
    }),
  );
}

test.describe('player — live-only affordances', () => {
  test('renders the live badge and DJ line when the station is on air', async ({ page }) => {
    await stubLiveManifest(page);
    await page.goto(WEB_BASE);

    const player = page.locator('.wc-player');
    await expect(player.locator('.wc-badge-live')).toBeVisible({ timeout: 10_000 });
    // ⚠ Scope to the player. `now-playing` is ALSO used by the landing page's
    // live-status card, so a page-wide locator is a strict-mode violation —
    // the same "scope your selectors" trap that cost the original audit an
    // iteration on the show-detail CTAs.
    await expect(player.getByTestId('now-playing')).toHaveText('DJ Mara');
    // Second DJ becomes the sub-line rather than being dropped.
    await expect(player.locator('.sub')).toHaveText('DJ Cha');
    await expect(player.getByTestId('player-status')).toHaveText('LIVE');
  });

  test('reaction button appears only when live, and posts the right request', async ({ page }) => {
    await stubLiveManifest(page);

    let reactionBody: unknown = null;
    let reactionUrl = '';
    await page.route('**/api/episodes/*/react*', (route) => {
      reactionUrl = route.request().url();
      reactionBody = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto(WEB_BASE);

    const button = page.locator('.wc-player').getByTestId('player-react');
    await expect(button).toBeVisible({ timeout: 10_000 });
    await button.click();

    await expect.poll(() => reactionBody).not.toBeNull();
    // The emoji must be one of the API's enum values, not a free string —
    // the DTO rejects anything else.
    expect(reactionBody).toEqual({ emoji: '🔥' });
    expect(reactionUrl).toContain(LIVE_MANIFEST.episodeId);
  });

  test('reaction button is absent when the station is off air', async ({ page }) => {
    await page.route('**/api/stream/manifest', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'OFF_AIR', url: null, dj: [], episodeId: null }),
      }),
    );
    await page.goto(WEB_BASE);
    const player = page.locator('.wc-player');
    await expect(player.getByTestId('player-status')).toHaveText('OFF_AIR');
    await expect(player.getByTestId('player-react')).toHaveCount(0);
    // Up next is socket-only, so it must never appear without a live listen.
    await expect(player.getByTestId('player-upnext')).toHaveCount(0);
  });

  test('pressing play surfaces the connecting state instead of dead silence', async ({ page }) => {
    await stubLiveManifest(page);

    // Hold the HLS playlist open so the player is observably mid-connect —
    // this is the 1-3s window that previously showed nothing at all.
    await page.route('**/*.m3u8', async (route) => {
      await new Promise((r) => setTimeout(r, 4000));
      return route.abort();
    });

    await page.goto(WEB_BASE);
    const playButton = page.locator('.wc-player').getByTestId('player-play');
    await expect(playButton).toBeEnabled({ timeout: 10_000 });
    await playButton.click();

    // The sub-line reports the phase and the button shows a spinner.
    await expect(page.locator('.wc-player .sub')).toHaveText('Connecting…', { timeout: 5_000 });
    await expect(playButton.locator('.animate-spin')).toBeVisible();
    // And the control stays live so a slow connection can be cancelled.
    await expect(playButton).toBeEnabled();
    await expect(playButton).toHaveAttribute('aria-label', /Connecting/);
  });
});
