import { test, expect } from '@playwright/test';
import { WEB_BASE } from './_fixtures';
import { startLocalBroadcast } from './_live-broadcast';

// FE#40 (BEA-167): socket.io must NOT open on anonymous/marketing routes
// before the user presses play, and must open once real listen intent
// (pressing play) happens. See src/lib/realtime/socket.ts (lazy dynamic
// import, gated by `active` in useStreamPresence) and
// src/lib/realtime/presence-actions.ts (the pure gating logic, unit-tested
// separately in presence-actions.spec.ts).

/**
 * Only socket.io traffic counts. Next's dev server always opens its own
 * hot-reload WebSocket (`ws://<web-origin>/_next/webpack-hmr`) on every page,
 * so a bare `page.on('websocket')` counter reports a "leak" on every route in
 * dev and would fail even against a perfectly gated build. Match the realtime
 * transport specifically: socket.io's own path, or any socket pointed at an
 * origin other than the web app.
 */
function isRealtimeSocket(url: string): boolean {
  if (url.includes('/_next/')) return false;
  return url.includes('/socket.io/') || !url.includes(new URL(WEB_BASE).host);
}

const ROUTES_WITHOUT_LISTEN_INTENT = [
  '/',
  '/shows',
  '/djs',
  '/schedule',
  '/charts',
  '/announcements',
];

for (const route of ROUTES_WITHOUT_LISTEN_INTENT) {
  test(`FE#40: no websocket / socket.io traffic on ${route} before play is pressed`, async ({ page }) => {
    const socketIoRequests: string[] = [];
    let websocketOpened = false;

    page.on('websocket', (ws) => {
      if (isRealtimeSocket(ws.url())) websocketOpened = true;
    });

    page.on('request', (req) => {
      if (req.url().includes('/socket.io/')) {
        socketIoRequests.push(req.url());
      }
    });

    await page.goto(`${WEB_BASE}${route}`);

    // Give the page a beat to finish its initial mount work (manifest poll,
    // any lazy imports, etc.) without ever pressing play.
    await page.waitForTimeout(3000);

    expect(websocketOpened, 'a socket.io connection opened without listen intent').toBe(false);
    expect(socketIoRequests, 'a socket.io HTTP(polling) request fired without listen intent').toEqual([]);
  });
}

test('FE#40: a socket connection opens after pressing play on /listen', async ({ page, request }) => {
  const broadcast = await startLocalBroadcast(request);
  try {
    let websocketOpened = false;
    const socketIoRequests: string[] = [];

    page.on('websocket', (ws) => {
      if (isRealtimeSocket(ws.url())) websocketOpened = true;
    });
    page.on('request', (req) => {
      if (req.url().includes('/socket.io/')) {
        socketIoRequests.push(req.url());
      }
    });

    await page.goto(`${WEB_BASE}/listen`);

    // NOTE: deliberately NOT asserting "no socket before play" here.
    // `/listen` is the listen-intent page: it also mounts the engagement room
    // (chat / polls / hype), which is expected to be live whether or not audio
    // is playing — you can read the room without listening. FE#40's requirement
    // is specifically about the six anonymous marketing routes above, and those
    // are asserted individually. Asserting it here would be testing a rule the
    // product does not have.
    await page.waitForTimeout(1500);

    await page.getByTestId('player-play').click();

    await expect
      .poll(() => websocketOpened || socketIoRequests.length > 0, {
        message: 'expected a socket.io connection to open after pressing play',
        timeout: 15_000,
      })
      .toBe(true);
    // Also prove intent opens a socket on a marketing page, where it is genuinely
    // closed before play. /listen's engagement room may connect immediately.
    await page.goto('about:blank');
    const marketing = await page.context().newPage();
    try {
      const sockets: string[] = [];
      marketing.on('websocket', (ws) => { if (isRealtimeSocket(ws.url())) sockets.push(ws.url()); });
      await marketing.goto('/');
      await expect(marketing.getByTestId('player-status')).toHaveText('LIVE');
      await marketing.waitForTimeout(1500);
      expect(sockets).toHaveLength(0);
      await marketing.getByTestId('player-play').click();
      await expect.poll(() => sockets.length, { timeout: 15000 }).toBeGreaterThan(0);
      await marketing.waitForFunction(() => { const audio=document.querySelector('[data-testid="player-audio"]') as HTMLAudioElement | null; return !!audio && !audio.paused && audio.currentTime > 0; });
    } finally {
      await marketing.close();
    }
  } finally {
    try {
      await page.goto('about:blank');
    } finally {
      await broadcast.cleanup();
    }
  }
});
