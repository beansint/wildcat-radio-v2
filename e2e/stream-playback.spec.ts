import { test, expect } from '@playwright/test';

// Issue #4 (Gate A local feasibility): the global player plays the live HLS stream.
test('AC-3/AC-4: clicking play streams live audio and currentTime advances', async ({ page }) => {
  // This spec drives a REAL live broadcast — it cannot pass against a bare
  // backend with nothing on air (CI, a quiet studio). Same guard as
  // stream-socket-gating.spec.ts; the mocked-manifest specs cover the player
  // states, this one only adds value when something is actually streaming.
  const res = await page.request.get('/api/stream/manifest');
  const manifest = res.ok() ? await res.json().catch(() => null) : null;
  test.skip(
    !manifest?.episodeId,
    `no live episode on air (status=${manifest?.status ?? 'API unreachable'}) — real-stream playback needs a broadcast`,
  );

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
