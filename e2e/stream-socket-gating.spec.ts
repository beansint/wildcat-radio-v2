import { test, expect, type Page } from '@playwright/test';
import { WEB_BASE } from './_fixtures';
import { startLocalBroadcast } from './_live-broadcast';

// #148: one shared status socket keeps every route current. Only audible
// playback may enter listening presence or contribute to audience counts.
function trackPresence(page: Page) {
  const joins: string[] = [];
  const sockets: string[] = [];
  const leaves: string[] = [];
  page.on('websocket', socket => {
    if (!socket.url().includes('/socket.io/')) return;
    sockets.push(socket.url());
    socket.on('framesent', frame => {
      const payload = String(frame.payload);
      if (payload.includes('"listening:join"')) joins.push(payload);
      if (payload.includes('"listening:leave"')) leaves.push(payload);
    });
  });
  return {joins, sockets, leaves};
}

for (const route of ['/', '/shows', '/djs', '/schedule', '/charts', '/announcements']) {
  test(`#148: ${route} receives status without audience membership before play`, async ({page}) => {
    const activity = trackPresence(page);
    await page.goto(`${WEB_BASE}${route}`);
    await expect.poll(() => activity.sockets.length).toBe(1);
    await page.waitForTimeout(500);
    expect(activity.joins).toEqual([]);
  });
}

test('#148: only audible playback joins presence and pause leaves it', async ({page, request}) => {
  const broadcast = await startLocalBroadcast(request);
  try {
    const activity = trackPresence(page);
    await page.goto(`${WEB_BASE}/`);
    await expect(page.getByTestId('player-status')).toHaveText('LIVE');
    await expect.poll(() => activity.sockets.length).toBe(1);
    expect(activity.joins).toEqual([]);
    await page.getByTestId('player-play').click();
    await page.waitForFunction(() => {
      const audio = document.querySelector('[data-testid="player-audio"]') as HTMLAudioElement | null;
      return !!audio && !audio.paused && audio.currentTime > 0;
    });
    await expect.poll(() => activity.joins.length).toBeGreaterThan(0);
    await page.getByTestId('player-play').click();
    await expect.poll(() => activity.leaves.length).toBeGreaterThan(0);
  } finally {
    await page.goto('about:blank');
    await broadcast.cleanup();
  }
});
