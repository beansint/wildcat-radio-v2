import { test, type Page } from '@playwright/test';

/** Focused probes for the two static-audit predictions the first pass contradicted. */

const WEB = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3011';
const MOD = { email: 'mod@example.com', password: 'Password123!' };

function say(id: string, detail: string) {
  console.log(`PROBE: [${id}] ${detail}`);
}

async function loginAsMod(page: Page) {
  await page.goto(`${WEB}/login`);
  await page.getByLabel(/email/i).fill(MOD.email);
  await page.locator('input[type="password"]').first().fill(MOD.password);
  await page.getByTestId('auth-submit').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });
}

// ── Does socket.io actually connect, and where? ──────────────────────────
test('PROBE-SOCKET: where does socket.io actually connect', async ({ page }) => {
  const io: string[] = [];
  const ws: string[] = [];
  page.on('websocket', (w) => {
    ws.push(w.url());
    if (/socket\.io|EIO=/.test(w.url())) io.push(w.url());
  });
  page.on('request', (r) => {
    if (/socket\.io|EIO=/.test(r.url())) io.push(`XHR ${r.url()}`);
  });

  for (const route of ['/', '/shows', '/listen']) {
    io.length = 0; ws.length = 0;
    await page.goto(`${WEB}${route}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(4000);
    say('SOCKET', `${route}: socket.io=${io.length} allWebsockets=${ws.length} [${ws.map((u) => u.replace(WEB, '').slice(0, 60)).join(', ')}]`);
  }

  // now press play on /listen and see if a socket appears
  await page.goto(`${WEB}/listen`);
  await page.waitForLoadState('networkidle');
  io.length = 0; ws.length = 0;
  const play = page.locator('.wc-play').first();
  if (await play.count()) {
    await play.click().catch(() => {});
    await page.waitForTimeout(4000);
  }
  say('SOCKET', `after pressing play on /listen: socket.io=${io.length} allWebsockets=${ws.length} [${ws.map((u) => u.replace(WEB, '').slice(0, 60)).join(', ')}]`);
});

// ── Is StreamProvider mounted everywhere, and does presence run? ─────────
test('PROBE-STREAMPROVIDER: is the provider mounted on non-listen routes', async ({ page }) => {
  for (const route of ['/', '/shows']) {
    await page.goto(`${WEB}${route}`);
    await page.waitForLoadState('networkidle');
    const player = await page.locator('.wc-player').count();
    // the manifest poll is the provider's other side effect
    const polls: string[] = [];
    page.on('request', (r) => {
      if (/manifest|stream|status/i.test(r.url()) && !r.url().includes('_next')) polls.push(r.url());
    });
    await page.waitForTimeout(4000);
    say('STREAMPROVIDER', `${route}: .wc-player=${player} stream-ish requests in 4s=${polls.length} [${[...new Set(polls)].slice(0, 3).map((u) => u.replace(WEB, '')).join(', ')}]`);
  }
});

// ── What buttons actually exist in the staff sidebar? ────────────────────
test('PROBE-THEMETOGGLE: enumerate staff sidebar controls', async ({ page }) => {
  await loginAsMod(page);
  await page.goto(`${WEB}/mod/users`);
  await page.waitForLoadState('networkidle');

  const buttons = await page.locator('button').evaluateAll((els) =>
    els.map((e) => ({
      text: (e.textContent ?? '').trim().slice(0, 30),
      aria: e.getAttribute('aria-label'),
      testid: e.getAttribute('data-testid'),
      cls: (e.className || '').toString().slice(0, 40),
      visible: (e as HTMLElement).offsetParent !== null,
    })));
  say('THEMETOGGLE', `all buttons on /mod/users:\n    ` +
    buttons.map((b) => `"${b.text}" aria=${b.aria} testid=${b.testid} vis=${b.visible}`).join('\n    '));

  const stored = await page.evaluate(() => localStorage.getItem('wc-staff-theme'));
  const htmlDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  say('THEMETOGGLE', `localStorage wc-staff-theme=${stored} html.dark=${htmlDark}`);

  // sidebar may be collapsed at desktop width — check a wide viewport too
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.waitForLoadState('networkidle');
  const sidebarBtns = await page.locator('.wc-sidebar button, aside button').evaluateAll((els) =>
    els.map((e) => `"${(e.textContent ?? '').trim().slice(0, 24)}" aria=${e.getAttribute('aria-label')}`));
  say('THEMETOGGLE', `sidebar buttons @1440px: ${sidebarBtns.join(' | ') || '(none)'}`);
});

// ── Staff theme: what does the server actually send, and is there a flash? ──
test('PROBE-THEMEFLASH: server markup vs client theme', async ({ page }) => {
  await loginAsMod(page);

  const res = await page.request.get(`${WEB}/mod/users`);
  const html = await res.text();
  const htmlTag = html.match(/<html[^>]*>/)?.[0] ?? '(no html tag)';
  const bodyTag = html.match(/<body[^>]*>/)?.[0]?.slice(0, 160) ?? '(no body tag)';
  say('THEMEFLASH', `server <html>: ${htmlTag}`);
  say('THEMEFLASH', `server <body>: ${bodyTag}`);
  say('THEMEFLASH', `server HTML mentions wc-staff-theme=${/wc-staff-theme/.test(html)}, mentions "dark"=${/\bdark\b/.test(html)}`);

  // observe the class over the first moments after navigation
  await page.goto(`${WEB}/mod/users`, { waitUntil: 'commit' });
  const samples: string[] = [];
  for (let i = 0; i < 8; i++) {
    samples.push(await page.evaluate(() => document.documentElement.className || '(empty)').catch(() => 'err'));
    await page.waitForTimeout(60);
  }
  say('THEMEFLASH', `<html class> sampled every 60ms after commit: ${samples.join(' → ')}`);
});
