import { test, expect } from '@playwright/test';
import { API_BASE, WEB_BASE } from './_fixtures';

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
  // Precondition: presence only joins a room when there IS a room — the socket
  // is gated on a live `episodeId`. With nothing on air the correct behaviour
  // is to open no socket at all, so this test cannot distinguish "gated
  // properly" from "broken". Skip loudly rather than pass vacuously; the six
  // negative tests above still prove the gating on every marketing route.
  // The guard itself must survive an unhealthy API. When the backend cannot
  // reach its database this endpoint does not 500 quickly — it HANGS on the
  // Prisma timeout (measured: >60s), which disposes the request context and
  // surfaced as an opaque "Request context disposed" failure rather than the
  // skip this test is designed to take. Bound it and treat any failure as
  // "nothing on air", so an unreachable backend skips loudly instead of
  // masquerading as a socket-gating regression.
  let manifest: { episodeId?: string; status?: string } | null = null;
  try {
    const res = await request.get(`${API_BASE}/api/stream/manifest`, { timeout: 10_000 });
    if (res.ok()) manifest = await res.json();
  } catch {
    manifest = null;
  }
  test.skip(
    !manifest?.episodeId,
    `no live episode on air (status=${manifest?.status ?? 'API unreachable'}) — cannot assert the post-play connection`,
  );

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
});
