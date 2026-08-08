import { test, type Page } from '@playwright/test';

/**
 * AUDIT VERIFICATION SPEC — temporary, not part of the product suite.
 *
 * Every test here confirms-or-refutes ONE prediction made by the static
 * source-reading audit (docs/frontend-parity-launch+react-audit). The point is
 * to find out which predictions survive contact with a real browser, so each
 * assertion reports the observed value rather than just passing/failing.
 *
 * Findings are printed with a `VERDICT:` prefix so the run log can be read as
 * a results table.
 */

const WEB = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3011';
const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3010';
const MOD = { email: 'mod@example.com', password: 'Password123!' };

function say(id: string, verdict: string, detail: string) {
  console.log(`VERDICT: [${id}] ${verdict} — ${detail}`);
}

/** Relative luminance + WCAG contrast ratio from two rgb() strings. */
function contrast(fg: string, bg: string): number {
  const parse = (s: string) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return [0, 0, 0];
    return m[1].split(',').slice(0, 3).map((v) => parseFloat(v.trim()));
  };
  const lum = (rgb: number[]) => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l1 = lum(parse(fg));
  const l2 = lum(parse(bg));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

async function loginAsMod(page: Page) {
  await page.goto(`${WEB}/login`);
  await page.getByLabel(/email/i).fill(MOD.email);
  await page.locator('input[type="password"]').first().fill(MOD.password);
  // NOTE: two buttons match /sign in/i (the disabled Entra button and the real
  // submit) — target the submit by testid to avoid a strict-mode violation.
  await page.getByTestId('auth-submit').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });
}

// ─────────────────────────────────────────────────────────────────────────
// P0-1 — SEO: no metadata / OG on public content routes
// ─────────────────────────────────────────────────────────────────────────
test('P0-SEO: public routes ship no per-page metadata or OG tags', async ({ page }) => {
  const routes = ['/', '/shows', '/djs', '/schedule', '/charts', '/announcements', '/listen'];
  const rows: string[] = [];

  for (const r of routes) {
    const res = await page.request.get(`${WEB}${r}`);
    const html = await res.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '(none)';
    const ogCount = (html.match(/property="og:/g) ?? []).length;
    const twCount = (html.match(/name="twitter:/g) ?? []).length;
    const desc = /name="description"/.test(html);
    rows.push(`${r} title="${title}" og=${ogCount} twitter=${twCount} desc=${desc}`);
  }
  console.log('VERDICT: [P0-SEO] observed per-route <head>:\n  ' + rows.join('\n  '));

  // robots + sitemap
  const robots = await page.request.get(`${WEB}/robots.txt`);
  const sitemap = await page.request.get(`${WEB}/sitemap.xml`);
  const manifest = await page.request.get(`${WEB}/manifest.webmanifest`);
  say('P0-SEO', 'OBSERVED',
    `robots.txt=${robots.status()} sitemap.xml=${sitemap.status()} manifest=${manifest.status()}`);
});

// ─────────────────────────────────────────────────────────────────────────
// P0-2 — public content is client-rendered (empty shell to a crawler)
// ─────────────────────────────────────────────────────────────────────────
test('P0-CSR: server HTML for public content contains no real content', async ({ page }) => {
  const res = await page.request.get(`${WEB}/shows`);
  const html = await res.text();
  const bodyText = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  const hasSkeleton = /loading|skeleton/i.test(html);
  say('P0-CSR', 'OBSERVED',
    `/shows server HTML length=${html.length}, visible-ish text chars=${bodyText.replace(/\s+/g, ' ').trim().length}, mentions loading/skeleton=${hasSkeleton}`);

  // now render it in the browser and compare
  await page.goto(`${WEB}/shows`);
  await page.waitForLoadState('networkidle');
  const renderedCards = await page.locator('a[href^="/shows/"]').count();
  say('P0-CSR', 'OBSERVED', `after hydration /shows renders ${renderedCards} show links`);
});

// ─────────────────────────────────────────────────────────────────────────
// P0-3 — socket.io connects on a public page with no play intent
// ─────────────────────────────────────────────────────────────────────────
test('P0-SOCKET: websocket opens on the landing page before any play', async ({ page }) => {
  const ws: string[] = [];
  const sockPolls: string[] = [];
  page.on('websocket', (w) => ws.push(w.url()));
  page.on('request', (r) => {
    if (/socket\.io/.test(r.url())) sockPolls.push(r.url());
  });

  await page.goto(`${WEB}/`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  say('P0-SOCKET', ws.length > 0 || sockPolls.length > 0 ? 'CONFIRMED' : 'REFUTED',
    `landing page, no play pressed: ${ws.length} websocket(s), ${sockPolls.length} socket.io HTTP request(s). first=${ws[0] ?? sockPolls[0] ?? 'none'}`);
});

// ─────────────────────────────────────────────────────────────────────────
// P0-4 — /schedule has no mobile layout (horizontal scroll at 375px)
// ─────────────────────────────────────────────────────────────────────────
test('P0-SCHED: schedule overflows horizontally on a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${WEB}/schedule`);
  await page.waitForLoadState('networkidle');

  const table = page.locator('table').first();
  const tableExists = await table.count();
  let scrollW = 0, clientW = 0;
  if (tableExists) {
    const box = await table.evaluate((el) => {
      const scroller = el.closest('[class*="overflow-x"]') as HTMLElement ?? el.parentElement!;
      return { s: scroller.scrollWidth, c: scroller.clientWidth };
    });
    scrollW = box.s; clientW = box.c;
  }
  const bodyOverflow = await page.evaluate(() => ({
    s: document.documentElement.scrollWidth,
    c: document.documentElement.clientWidth,
  }));
  // does a mobile-only card view exist?
  const mobileCards = await page.locator('.md\\:hidden').count();
  const clickableCells = await page.locator('table a').count();

  say('P0-SCHED', scrollW > clientW ? 'CONFIRMED' : 'REFUTED',
    `at 375px: table scroller ${scrollW}px inside ${clientW}px (overflow=${scrollW > clientW}); page ${bodyOverflow.s}/${bodyOverflow.c}; md:hidden blocks=${mobileCards}; clickable cells=${clickableCells}`);
});

// ─────────────────────────────────────────────────────────────────────────
// P0-5 — BottomNav absent on public pages, present on (app) pages
// ─────────────────────────────────────────────────────────────────────────
test('P0-BOTTOMNAV: bottom nav missing on public routes at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const results: string[] = [];
  for (const r of ['/', '/shows', '/schedule', '/charts', '/announcements', '/djs']) {
    await page.goto(`${WEB}${r}`);
    await page.waitForLoadState('domcontentloaded');
    const n = await page.locator('.wc-bottomnav').count();
    results.push(`${r}=${n}`);
  }
  say('P0-BOTTOMNAV', 'OBSERVED', `.wc-bottomnav count per public route: ${results.join(' ')}`);
});

// ─────────────────────────────────────────────────────────────────────────
// P0-6 — no error boundaries: force a client error, see what renders
// ─────────────────────────────────────────────────────────────────────────
test('P0-ERRBOUNDARY: no error.tsx / not-found.tsx in the route tree', async ({ page }) => {
  const res = await page.request.get(`${WEB}/this-route-does-not-exist-audit`);
  const html = await res.text();
  const isDefaultNext = /This page could not be found/i.test(html);
  const hasBrand = /Wildcat/i.test(html);
  say('P0-ERRBOUNDARY', 'OBSERVED',
    `404 status=${res.status()}, default-Next-404=${isDefaultNext}, branded=${hasBrand}`);

  // a dynamic route with a bogus param — does it degrade gracefully?
  await page.goto(`${WEB}/shows/definitely-not-a-real-show-audit`);
  await page.waitForLoadState('networkidle');
  const bodyText = (await page.locator('body').innerText()).slice(0, 220).replace(/\n/g, ' | ');
  say('P0-ERRBOUNDARY', 'OBSERVED', `/shows/<bogus> renders: "${bodyText}"`);
});

// ─────────────────────────────────────────────────────────────────────────
// P0-7 — staff dark mode: .wc-pill-warn contrast
// ─────────────────────────────────────────────────────────────────────────
test('P0-PILL: staff dark-mode pill contrast on /mod/users and /mod/logs', async ({ page }) => {
  await loginAsMod(page);

  for (const route of ['/mod/users', '/mod/logs']) {
    await page.goto(`${WEB}${route}`);
    await page.waitForLoadState('networkidle');

    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    const pills = page.locator('.wc-pill-warn, .wc-pill-ok, .wc-pill-bad, .wc-pill-neutral');
    const count = await pills.count();

    const rows: string[] = [];
    for (let i = 0; i < Math.min(count, 6); i++) {
      const p = pills.nth(i);
      const cls = (await p.getAttribute('class')) ?? '';
      const styles = await p.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { color: cs.color, bg: cs.backgroundColor };
      });
      let bg = styles.bg;
      if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
        bg = await p.evaluate((el) => {
          let n = el.parentElement;
          while (n) {
            const c = getComputedStyle(n).backgroundColor;
            if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
            n = n.parentElement;
          }
          return 'rgb(0,0,0)';
        });
      }
      const ratio = contrast(styles.color, bg);
      const variant = cls.match(/wc-pill-(\w+)/)?.[1] ?? '?';
      rows.push(`${variant}: fg=${styles.color} bg=${bg} ratio=${ratio.toFixed(2)}${ratio < 4.5 ? ' ⚠BELOW-AA' : ''}`);
    }
    say('P0-PILL', 'OBSERVED', `${route} dark=${isDark} pills=${count}\n    ` + rows.join('\n    '));
  }
});

// ─────────────────────────────────────────────────────────────────────────
// P0-8 — staff LIGHT mode: gold text on white
// ─────────────────────────────────────────────────────────────────────────
test('P0-GOLD: staff light mode renders gold text on a white surface', async ({ page }) => {
  await loginAsMod(page);
  await page.goto(`${WEB}/mod/users`);
  await page.waitForLoadState('networkidle');

  const beforeDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));

  // The toggle's accessible name is "Toggle light or dark" (aria-label), NOT
  // its visible text ("Dark mode") — target it by testid.
  const toggle = page.getByTestId('mod-nav-theme-toggle').first();
  const toggleCount = await toggle.count();
  say('P0-GOLD', toggleCount ? 'OBSERVED' : 'NO-TOGGLE',
    `/mod/users default dark=${beforeDark}, theme toggle found=${toggleCount > 0}`);

  if (toggleCount) {
    await toggle.click();
    await page.waitForTimeout(400);
    const afterDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));

    const golds = page.locator('.text-gold');
    const n = await golds.count();
    const rows: string[] = [];
    for (let i = 0; i < Math.min(n, 5); i++) {
      const el = golds.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const styles = await el.evaluate((e) => {
        const cs = getComputedStyle(e);
        let node: HTMLElement | null = e as HTMLElement;
        let bg = 'rgb(255,255,255)';
        while (node) {
          const c = getComputedStyle(node).backgroundColor;
          if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { bg = c; break; }
          node = node.parentElement;
        }
        return { color: cs.color, bg, text: (e.textContent ?? '').trim().slice(0, 24) };
      });
      const ratio = contrast(styles.color, styles.bg);
      rows.push(`"${styles.text}" fg=${styles.color} bg=${styles.bg} ratio=${ratio.toFixed(2)}${ratio < 4.5 ? ' ⚠BELOW-AA' : ''}`);
    }
    say('P0-GOLD', 'OBSERVED',
      `after toggle dark=${afterDark}; .text-gold elements=${n}\n    ` + (rows.join('\n    ') || '(none visible)'));
  }
});

// ─────────────────────────────────────────────────────────────────────────
// P1 — staff theme toggle: does it exist on /studio?
// ─────────────────────────────────────────────────────────────────────────
test('P1-STUDIO-THEME: /studio has no light/dark toggle', async ({ page }) => {
  await page.goto(`${WEB}/studio`);
  await page.waitForLoadState('networkidle');
  const isDark = await page.evaluate(() => {
    const main = document.querySelector('main');
    return {
      html: document.documentElement.classList.contains('dark'),
      main: main?.className.includes('dark') ?? false,
    };
  });
  // check by the same testid the /mod sidebar toggle uses, plus a label sweep
  const byTestId = await page.getByTestId('mod-nav-theme-toggle').count();
  const byLabel = await page.getByRole('button', { name: /toggle light|light or dark|light mode|dark mode/i }).count();
  say('P1-STUDIO-THEME', byTestId + byLabel === 0 ? 'CONFIRMED' : 'REFUTED',
    `/studio html.dark=${isDark.html} main.dark=${isDark.main} toggle-by-testid=${byTestId} toggle-by-label=${byLabel}`);
});

// ─────────────────────────────────────────────────────────────────────────
// P0-9 — footer missing on (app) listener pages
// ─────────────────────────────────────────────────────────────────────────
test('P0-FOOTER: footer present on public routes, absent on (app) routes', async ({ page }) => {
  const rows: string[] = [];
  for (const r of ['/', '/shows']) {
    await page.goto(`${WEB}${r}`);
    await page.waitForLoadState('domcontentloaded');
    rows.push(`${r} footers=${await page.locator('footer').count()}`);
  }
  await loginAsMod(page);
  for (const r of ['/profile', '/notifications', '/profile/standing']) {
    await page.goto(`${WEB}${r}`);
    await page.waitForLoadState('networkidle');
    rows.push(`${r} footers=${await page.locator('footer').count()}`);
  }
  say('P0-FOOTER', 'OBSERVED', rows.join(' | '));
});

// ─────────────────────────────────────────────────────────────────────────
// P1 — player progress strip missing
// ─────────────────────────────────────────────────────────────────────────
test('P1-PLAYERPROGRESS: .wc-player-progress never renders', async ({ page }) => {
  await page.goto(`${WEB}/`);
  await page.waitForLoadState('networkidle');
  const player = await page.locator('.wc-player').count();
  const progress = await page.locator('.wc-player-progress').count();
  const cssDefined = await page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules ?? [])) {
          if (rule.cssText.includes('wc-player-progress')) return true;
        }
      } catch { /* cross-origin */ }
    }
    return false;
  });
  say('P1-PLAYERPROGRESS', progress === 0 ? 'CONFIRMED' : 'REFUTED',
    `.wc-player=${player} .wc-player-progress elements=${progress} css-rule-defined=${cssDefined}`);
});

// ─────────────────────────────────────────────────────────────────────────
// P0-10 — show detail missing CTAs / live badge / hosted-by
// ─────────────────────────────────────────────────────────────────────────
test('P0-SHOWDETAIL: show detail page lacks Listen live / Join the chat CTAs', async ({ page }) => {
  await page.goto(`${WEB}/shows`);
  await page.waitForLoadState('networkidle');
  const first = page.locator('a[href^="/shows/"]').first();
  if (!(await first.count())) {
    say('P0-SHOWDETAIL', 'SKIPPED', 'no shows seeded to click into');
    return;
  }
  const href = await first.getAttribute('href');
  await page.goto(`${WEB}${href}`);
  await page.waitForLoadState('networkidle');

  // IMPORTANT: scope to <main>. The top-nav and the global player both carry
  // their own "Listen live" CTA, so a page-wide count would falsely report the
  // hero CTA as present.
  const main = page.locator('main');
  const inMain = {
    listenLive: await main.getByRole('link', { name: /listen live/i }).count(),
    joinChat: await main.getByRole('link', { name: /join the chat/i }).count(),
    liveBadge: await main.locator('.wc-badge-live').count(),
    hostedBy: await main.getByText(/hosted by/i).count(),
    listenLinks: await main.locator('a[href="/listen"]').count(),
  };
  const pageWide = {
    listenLive: await page.getByRole('link', { name: /listen live/i }).count(),
    listenLinks: await page.locator('a[href="/listen"]').count(),
  };

  say('P0-SHOWDETAIL', 'OBSERVED',
    `${href}\n    IN <main>: "Listen live"=${inMain.listenLive} "Join the chat"=${inMain.joinChat} .wc-badge-live=${inMain.liveBadge} "Hosted by"=${inMain.hostedBy} /listen links=${inMain.listenLinks}` +
    `\n    PAGE-WIDE (incl. nav+player chrome): "Listen live"=${pageWide.listenLive} /listen links=${pageWide.listenLinks}`);
});

// ─────────────────────────────────────────────────────────────────────────
// P0-11 — dj profile missing the All DJs sidebar
// ─────────────────────────────────────────────────────────────────────────
test('P0-DJPROFILE: dj profile has no All-DJs sidebar rail', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${WEB}/djs`);
  await page.waitForLoadState('networkidle');
  const first = page.locator('a[href^="/djs/"]').first();
  if (!(await first.count())) {
    say('P0-DJPROFILE', 'SKIPPED', 'no DJs seeded');
    return;
  }
  const href = await first.getAttribute('href');
  await page.goto(`${WEB}${href}`);
  await page.waitForLoadState('networkidle');
  const sidebarLinks = await page.locator('a[href^="/djs/"]').count();
  const grid = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'));
    return els.some((e) => getComputedStyle(e).gridTemplateColumns.includes('240px'));
  });
  say('P0-DJPROFILE', 'OBSERVED',
    `${href}: sibling /djs/ links on page=${sidebarLinks} (a rail would be many), 240px grid rail present=${grid}`);
});

// ─────────────────────────────────────────────────────────────────────────
// P1 — /my-data orphan: no link anywhere in the authed UI
// ─────────────────────────────────────────────────────────────────────────
test('P1-MYDATA: /my-data reachable by URL but linked from nowhere', async ({ page }) => {
  await loginAsMod(page);
  const seen: string[] = [];
  for (const r of ['/profile', '/notifications', '/profile/standing', '/', '/legal/privacy']) {
    await page.goto(`${WEB}${r}`);
    await page.waitForLoadState('networkidle');
    const n = await page.locator('a[href="/my-data"]').count();
    seen.push(`${r}=${n}`);
  }
  const direct = await page.request.get(`${WEB}/my-data`);
  say('P1-MYDATA', 'OBSERVED',
    `links to /my-data per page: ${seen.join(' ')} | direct GET /my-data=${direct.status()}`);
});

// ─────────────────────────────────────────────────────────────────────────
// P1 — register Terms / Community Guidelines dead links
// ─────────────────────────────────────────────────────────────────────────
test('P1-REGISTER-LINKS: terms links are href="#"', async ({ page }) => {
  await page.goto(`${WEB}/register`);
  await page.waitForLoadState('networkidle');
  const hrefs = await page.locator('a').evaluateAll((els) =>
    els.map((e) => `${(e.textContent ?? '').trim().slice(0, 28)}->${e.getAttribute('href')}`)
       .filter((s) => /terms|guideline/i.test(s)));
  say('P1-REGISTER-LINKS', 'OBSERVED', hrefs.join(' | ') || '(no terms links found)');
});

// ─────────────────────────────────────────────────────────────────────────
// P1 — staff theme flash / hydration mismatch
// ─────────────────────────────────────────────────────────────────────────
test('P1-THEMEFLASH: staff theme applied after paint, and localStorage mismatch', async ({ page }) => {
  await loginAsMod(page);
  // server HTML: is .dark on <html> before hydration?
  const res = await page.request.get(`${WEB}/mod/users`);
  const html = await res.text();
  const htmlTagDark = /<html[^>]*class="[^"]*dark/.test(html);
  const inlineThemeScript = /wc-staff-theme/.test(html);
  say('P1-THEMEFLASH', 'OBSERVED',
    `server HTML <html class> contains dark=${htmlTagDark}; pre-hydration theme script present=${inlineThemeScript}`);

  // set light and reload — does the server markup still say dark?
  await page.goto(`${WEB}/mod/users`);
  await page.evaluate(() => localStorage.setItem('wc-staff-theme', 'light'));
  await page.reload();
  await page.waitForLoadState('networkidle');
  const afterReload = await page.evaluate(() => ({
    stored: localStorage.getItem('wc-staff-theme'),
    dark: document.documentElement.classList.contains('dark'),
  }));
  say('P1-THEMEFLASH', 'OBSERVED',
    `with localStorage=light after reload: stored=${afterReload.stored} html.dark=${afterReload.dark} (server rendered dark=${htmlTagDark} → mismatch=${htmlTagDark && !afterReload.dark})`);
});

// ─────────────────────────────────────────────────────────────────────────
// Console + network health sweep across every public route
// ─────────────────────────────────────────────────────────────────────────
test('HEALTH: console errors and failed requests across public routes', async ({ page }) => {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${page.url().replace(WEB, '')}: ${m.text().slice(0, 160)}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace(WEB, '').replace(API, 'API')}`);
  });

  for (const r of ['/', '/listen', '/shows', '/djs', '/schedule', '/charts', '/announcements', '/login', '/register']) {
    await page.goto(`${WEB}${r}`);
    await page.waitForLoadState('networkidle');
  }
  say('HEALTH', 'OBSERVED', `console errors=${errors.length}, failed requests=${failed.length}`);
  if (errors.length) console.log('  CONSOLE:\n    ' + [...new Set(errors)].slice(0, 15).join('\n    '));
  if (failed.length) console.log('  FAILED:\n    ' + [...new Set(failed)].slice(0, 15).join('\n    '));
});

// ─────────────────────────────────────────────────────────────────────────
// A11y — keyboard reachability of the player + skip link
// ─────────────────────────────────────────────────────────────────────────
test('A11Y: skip link and player keyboard operability', async ({ page }) => {
  await page.goto(`${WEB}/`);
  await page.waitForLoadState('networkidle');

  await page.keyboard.press('Tab');
  const firstFocus = await page.evaluate(() => {
    const a = document.activeElement as HTMLElement;
    return { tag: a?.tagName, text: (a?.textContent ?? '').trim().slice(0, 40), href: a?.getAttribute('href') };
  });
  const isSkip = /skip/i.test(firstFocus.text);
  say('A11Y-SKIP', isSkip ? 'REFUTED (skip link exists)' : 'CONFIRMED (no skip link)',
    `first Tab target: <${firstFocus.tag}> "${firstFocus.text}" href=${firstFocus.href}`);

  const playBtn = page.locator('.wc-play').first();
  if (await playBtn.count()) {
    const label = await playBtn.getAttribute('aria-label');
    say('A11Y-PLAYER', 'OBSERVED', `.wc-play aria-label="${label}"`);
  }

  // touch target sizes on mobile
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${WEB}/`);
  await page.waitForLoadState('networkidle');
  const small = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('button, a').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.height < 44) out.push(`${el.tagName}.${(el.className || '').toString().split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return out.slice(0, 12);
  });
  say('A11Y-TOUCH', small.length ? 'OBSERVED' : 'CLEAN',
    `${small.length} interactive elements under 44px tall at 375px: ${small.join(', ')}`);
});
