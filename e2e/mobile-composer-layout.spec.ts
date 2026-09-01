import { expect, test } from '@playwright/test';
import { WEB_BASE } from './_fixtures';

/**
 * FE#66 — mobile composer vs. fixed player geometry.
 *
 * The GlobalPlayer is `position:fixed; bottom:0; z-60` and always mounted on
 * public routes. The /listen mobile chat bar used to be `sticky bottom-0
 * z-30`, which put it UNDERNEATH the player on phones — the primary input of
 * the page was covered by chrome. It now sticks above the player's reserved
 * height. This test pins that geometry at 375×812.
 *
 * Same boundary-stub pattern as player-live-states.spec.ts: the manifest is
 * the one non-deterministic dependency, everything downstream is real.
 */

const LIVE_MANIFEST = {
  status: 'LIVE',
  url: 'https://example.invalid/stream/index.m3u8',
  dj: ['DJ Mara'],
  episodeId: 'e2e-live-episode',
};

test.use({ viewport: { width: 375, height: 812 } });

test.describe('mobile composer layout', () => {
  test('the chat bar sits fully above the fixed player', async ({ page }) => {
    await page.route('**/api/stream/manifest', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(LIVE_MANIFEST),
      }),
    );
    await page.goto(`${WEB_BASE}/listen`);

    const player = page.locator('.wc-player');
    await expect(player).toBeVisible();

    // The composer container (gate notice or form) — anchored by its testid
    // when signed in, or the gate notice wrapper otherwise; target the shared
    // sticky wrapper via the chat-input's section.
    const composer = page.locator('div.sticky.lg\\:hidden').first();
    await expect(composer).toBeVisible();

    const playerBox = await player.boundingBox();
    const composerBox = await composer.boundingBox();
    expect(playerBox).not.toBeNull();
    expect(composerBox).not.toBeNull();

    // Entirely above the player: composer bottom must not intrude into the
    // player's vertical span.
    expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(playerBox!.y + 1);
  });
});
