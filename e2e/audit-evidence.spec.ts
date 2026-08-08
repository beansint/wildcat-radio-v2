import { test, type Page } from '@playwright/test';
import * as path from 'node:path';

/** Captures screenshot evidence + staff-route console health for the audit report. */

const WEB = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3011';
const OUT = process.env.AUDIT_SHOT_DIR ?? 'audit-evidence';
const MOD = { email: 'mod@example.com', password: 'Password123!' };

function say(id: string, detail: string) {
  console.log(`EVIDENCE: [${id}] ${detail}`);
}

async function loginAsMod(page: Page) {
  await page.goto(`${WEB}/login`);
  await page.getByLabel(/email/i).fill(MOD.email);
  await page.locator('input[type="password"]').first().fill(MOD.password);
  await page.getByTestId('auth-submit').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });
}

const shot = (name: string) => path.join(OUT, `${name}.png`);

test('EVIDENCE: mobile schedule overflow + missing bottom nav', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${WEB}/schedule`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: shot('01-schedule-mobile-375'), fullPage: false });

  await page.goto(`${WEB}/`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: shot('02-landing-mobile-375-no-bottomnav'), fullPage: false });
  say('MOBILE', 'captured schedule + landing at 375px');
});

test('EVIDENCE: staff dark pills and light-mode gold', async ({ page }) => {
  const consoleMsgs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`${m.type()}: ${m.text().slice(0, 200)}`);
  });

  await loginAsMod(page);
  await page.goto(`${WEB}/mod/users`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: shot('03-mod-users-dark'), fullPage: false });

  await page.getByTestId('mod-nav-theme-toggle').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot('04-mod-users-light-gold-on-white'), fullPage: false });

  say('STAFF-CONSOLE', `console errors/warnings on /mod/users incl. theme toggle: ${consoleMsgs.length}`);
  if (consoleMsgs.length) console.log('    ' + [...new Set(consoleMsgs)].slice(0, 10).join('\n    '));

  const hydrationWarn = consoleMsgs.filter((m) => /hydrat|did not match|mismatch/i.test(m));
  say('HYDRATION', hydrationWarn.length
    ? `React hydration warning observed: ${hydrationWarn[0]}`
    : 'no React hydration warning logged on the staff route');
});

test('EVIDENCE: staff route console health with stored light theme', async ({ page }) => {
  const msgs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text().slice(0, 200)}`);
  });
  await loginAsMod(page);
  await page.goto(`${WEB}/mod/users`);
  await page.evaluate(() => localStorage.setItem('wc-staff-theme', 'light'));
  msgs.length = 0;
  await page.reload();
  await page.waitForLoadState('networkidle');
  say('HYDRATION-LIGHT', `after reload with wc-staff-theme=light: ${msgs.length} console error/warning`);
  if (msgs.length) console.log('    ' + [...new Set(msgs)].slice(0, 10).join('\n    '));
  // restore
  await page.evaluate(() => localStorage.removeItem('wc-staff-theme'));
});

test('EVIDENCE: show detail and dj profile', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${WEB}/shows`);
  await page.waitForLoadState('networkidle');
  const href = await page.locator('a[href^="/shows/"]').first().getAttribute('href');
  if (href) {
    await page.goto(`${WEB}${href}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: shot('05-show-detail-no-ctas'), fullPage: false });
  }
  await page.goto(`${WEB}/djs`);
  await page.waitForLoadState('networkidle');
  const dj = await page.locator('a[href^="/djs/"]').first().getAttribute('href');
  if (dj) {
    await page.goto(`${WEB}${dj}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: shot('06-dj-profile-no-sidebar'), fullPage: false });
  }
  say('PAGES', `captured ${href} and ${dj}`);
});

test('EVIDENCE: studio console has no theme toggle', async ({ page }) => {
  await page.goto(`${WEB}/studio`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: shot('07-studio-no-theme-toggle'), fullPage: false });
  say('STUDIO', 'captured /studio');
});
