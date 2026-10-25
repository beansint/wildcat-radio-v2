import { expect, test } from '@playwright/test';
import { forceNativeHls, manifestBody, toneWav } from './_live-path-mocks';

// Paired contract tier: real compiled backend controllers, gateways and 15s
// scheduler; backend manifest/auth reads and decoded PCM media are fixtures.
// This is deliberately separate from PG-backed lifecycle and proxy evidence.
test.skip(process.env.WILDCAT_REALTIME_HARNESS !== '1', 'Requires the isolated #210 realtime browser harness');
test('paired #148/#210: real pushes turn episodes, idle status never counts listeners, heartbeat avoids polling', async ({page, request}) => {
  const api = process.env.PLAYWRIGHT_API_URL!;
  const off = manifestBody({status: 'OFF_AIR', episodeId: null, dj: [], showId: null, showName: null});
  await request.post(`${api}/__fixture/manifest`, {data: off});
  await forceNativeHls(page);
  await page.route('**/paired-tone.wav', route => route.fulfill({contentType: 'audio/wav', body: toneWav()}));
  const live = manifestBody({episodeId: 'paired-210-live', url: `${process.env.PLAYWRIGHT_BASE_URL}/paired-tone.wav`, showName: 'Paired Recovery Hour'});
  const reads: string[] = [];
  page.on('request', req => {
    if (req.url().endsWith('/api/stream/manifest') || req.url().endsWith('/controls')) reads.push(req.url());
  });
  await page.goto('/listen');
  await expect(page.getByTestId('player-status')).toHaveText('OFF_AIR');
  await request.post(`${api}/__fixture/manifest`, {data: live});
  await expect(page.getByTestId('player-status')).toHaveText('LIVE');
  let stats = await (await request.get(`${api}/__fixture/stats`)).json();
  expect(stats.listeners).toBe(0);
  await page.getByTestId('player-play').click();
  await expect.poll(async () => (await (await request.get(`${api}/__fixture/stats`)).json()).listeners).toBe(1);
  await page.getByTestId('player-play').click();
  await expect.poll(async () => (await (await request.get(`${api}/__fixture/stats`)).json()).listeners).toBe(0);
  await request.post(`${api}/__fixture/manifest`, {data: {...live, episodeId: 'paired-210-next', showName: 'Paired Next Hour'}});
  await expect(page.getByRole('heading', {name: 'Paired Next Hour'})).toBeVisible();
  await page.waitForTimeout(500);
  const baseline = reads.length;
  await page.waitForTimeout(35_000);
  expect(reads).toHaveLength(baseline);
  stats = await (await request.get(`${api}/__fixture/stats`)).json();
  expect(stats.listeners).toBe(0);
  await page.screenshot({path: 'test-results/realtime-paired-golden.png', fullPage: true});
  await request.post(`${api}/__fixture/manifest`, {data: off});
  await expect(page.getByTestId('player-status')).toHaveText('OFF_AIR');
});
