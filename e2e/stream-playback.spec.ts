import { test, expect } from '@playwright/test';

// Issue #4 (Gate A local feasibility): the global player plays the live HLS stream.
test('AC-3/AC-4: clicking play streams live audio and currentTime advances', async ({ page }) => {
  await page.goto('/');

  // manifest polled → LIVE
  await expect(page.getByTestId('player-status')).toHaveText('LIVE', { timeout: 20_000 });

  await page.getByTestId('player-play').click();

  // playback starts
  await page.waitForFunction(
    () => {
      const a = document.querySelector('[data-testid="player-audio"]') as HTMLAudioElement | null;
      return !!a && !a.paused && a.currentTime > 0;
    },
    { timeout: 15_000 },
  );

  const read = () =>
    page.evaluate(
      () => (document.querySelector('[data-testid="player-audio"]') as HTMLAudioElement).currentTime,
    );
  const t0 = await read();
  await page.waitForTimeout(3000);
  const t1 = await read();

  expect(t1).toBeGreaterThan(t0 + 1.5); // ~3s of real-time playback
});
