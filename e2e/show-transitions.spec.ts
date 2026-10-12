import { createHash } from 'node:crypto';
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { API_BASE, WEB_BASE, execBackendTsx } from './_fixtures';

/**
 * FE#132 / BE#195 — show transitions in the studio kiosk. Spec-first from
 * .agent/test-suites/show-transitions/web/e2e.md (W-E1..W-E14).
 *
 * Real API (3010) + real browser against a THROWAWAY local database only
 * (`SHOW_TRANSITIONS_DATABASE_URL`, local host, name ending `_test`): the
 * fixtures close every open episode. The API clock is real, so slots sit
 * relative to now in station time:
 *   A  [now-50m, now+4m]  — on air, in its last five minutes
 *   B  [now+4m,  now+60m] — up next; its DJ can check in early (≤ 15 min)
 * `overtime()` re-seeds A as already past its end with B current.
 */

const expect = baseExpect.configure({ timeout: 10_000 });

const DB_URL = process.env.SHOW_TRANSITIONS_DATABASE_URL ?? '';
const dbOk = (() => {
  try {
    const u = new URL(DB_URL);
    return ['localhost', '127.0.0.1'].includes(u.hostname) && u.pathname.replace(/^\//, '').endsWith('_test');
  } catch {
    return false;
  }
})();

const STATION_TOKEN = process.env.STATION_DEVICE_TOKEN ?? 'e2e-195-browser-token';
const STATION_DEVICE_ID = 'e2e-195-browser-device';
const TOKEN_HASH = createHash('sha256').update(STATION_TOKEN).digest('hex');
const OFFSET_MIN = Number.parseInt(process.env.STATION_UTC_OFFSET_MINUTES ?? '480', 10);
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const stationNow = () => new Date(Date.now() + OFFSET_MIN * 60_000);
const NOW = stationNow().getUTCHours() * 60 + stationNow().getUTCMinutes();
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const DJ = { A1: 'DJ Alpha One', A2: 'DJ Alpha Two', B1: 'DJ Bravo One', B2: 'DJ Bravo Two' } as const;
type DjKey = keyof typeof DJ;
const id = (k: string) => `e2e-195-${k.toLowerCase()}`;

/**
 * Reset to: show A on air with `onAir` DJs (started 40 min ago), show B next.
 * `aEnd`/`bStart` are minutes from now; the default puts A in its last 5 min.
 */
function seed({ onAir = ['A1'] as DjKey[], aEnd = 4, bStart = 4 } = {}) {
  const date = stationNow().toISOString().slice(0, 10);
  const day = WEEKDAYS[stationNow().getUTCDay()];
  const cadence = (start: number, end: number) => ({ kind: 'WEEKLY', days: [day], start: hhmm(start), end: hhmm(end) });
  const fixture = {
    date, offset: OFFSET_MIN, tokenHash: TOKEN_HASH, deviceId: STATION_DEVICE_ID,
    djs: Object.entries(DJ).map(([k, name]) => ({ id: id(k), name })),
    shows: [
      { id: id('show-a'), name: 'Show Alpha', cadence: cadence(NOW - 50, NOW + aEnd), roster: [id('A1'), id('A2')] },
      { id: id('show-b'), name: 'Show Bravo', cadence: cadence(NOW + bStart, NOW + 60), roster: [id('B1'), id('B2')] },
    ],
    onAir: onAir.map((k) => id(k)),
  };
  execBackendTsx(`
    import { PrismaPg } from '@prisma/adapter-pg';
    import { PrismaClient } from '@prisma/client';
    const f = ${JSON.stringify(fixture)};
    async function main() {
      const url = ${JSON.stringify(DB_URL)};
      const u = new URL(url);
      if (!['localhost', '127.0.0.1'].includes(u.hostname) || !u.pathname.endsWith('_test')) throw new Error('refusing non-throwaway DB');
      const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
      const at = (hm: string) => {
        const [y, mo, d] = f.date.split('-').map(Number); const [h, mi] = hm.split(':').map(Number);
        return new Date(Date.UTC(y, mo - 1, d, h, mi) - f.offset * 60000);
      };
      // Targeted reset: other specs share this DB (seeded shows must survive).
      await prisma.episode.updateMany({ where: { startedAt: { not: null }, endedAt: null }, data: { endedAt: new Date(), status: 'OFF_AIR' } });
      const ours = f.shows.map((s) => s.id);
      const djIds = f.djs.map((d) => d.id);
      const eps = (await prisma.episode.findMany({ where: { showId: { in: ours } }, select: { id: true } })).map((e) => e.id);
      await prisma.attendanceRecord.deleteMany({ where: { OR: [{ episodeId: { in: eps } }, { rosterId: { in: djIds } }] } });
      await prisma.episodeAnalyticsSnapshot.deleteMany({ where: { episodeId: { in: eps } } });
      await prisma.episode.deleteMany({ where: { id: { in: eps } } });
      await prisma.showRosterEntry.deleteMany({ where: { showId: { in: ours } } });
      await prisma.show.deleteMany({ where: { id: { in: ours } } });
      await prisma.rosterEntry.deleteMany({ where: { id: { in: djIds } } });
      await prisma.streamHealth.deleteMany({});
      // One active booth at a time: park the others while this spec runs.
      await prisma.stationSession.updateMany({ where: { isActive: true }, data: { isActive: false } });
      await prisma.stationSession.deleteMany({ where: { id: 'e2e-195-booth' } });
      await prisma.stationSession.create({ data: { id: 'e2e-195-booth', label: 'E2E 195 Booth', tokenHash: f.tokenHash, isActive: true, deviceId: f.deviceId, enrolledAt: new Date() } });
      // No booth audio here: keep the abandoned-episode sweep quiet (never LIVE by itself).
      await prisma.streamHealth.create({ data: { id: 'primary', sourceConnected: false, lastPublishedAt: new Date('2099-01-01T00:00:00Z') } });
      for (const d of f.djs) await prisma.rosterEntry.create({ data: { id: d.id, displayName: d.name } });
      for (const s of f.shows) await prisma.show.create({ data: { id: s.id, name: s.name, slug: s.id, cadence: s.cadence, roster: { create: s.roster.map((rosterId) => ({ rosterId })) } } });
      if (f.onAir.length) {
        const a = f.shows[0];
        const startedAt = new Date(Date.now() - 40 * 60000);
        const ep = await prisma.episode.create({ data: {
          showId: a.id, unscheduled: false, status: 'OFF_AIR', startedAt,
          scheduledFor: at(a.cadence.start), scheduledEndAt: at(a.cadence.end),
          effectiveStartAt: at(a.cadence.start), effectiveEndAt: at(a.cadence.end),
        } });
        for (const rosterId of f.onAir) {
          const rec = await prisma.attendanceRecord.create({ data: { episodeId: ep.id, rosterId, timeIn: startedAt, onAirStartAt: startedAt, source: 'TAP' } });
          await prisma.attendanceBroadcastInterval.create({ data: { attendanceRecordId: rec.id, startedAt } });
        }
      }
      await prisma.$disconnect();
    }
    main().catch((e) => { console.error(e); process.exit(1); });
  `);
}

/** Leave the shared throwaway DB as other specs expect it: none of our rows, no open episode. */
function cleanup() {
  execBackendTsx(`
    import { PrismaPg } from '@prisma/adapter-pg';
    import { PrismaClient } from '@prisma/client';
    async function main() {
      const url = ${JSON.stringify(DB_URL)};
      const u = new URL(url);
      if (!['localhost', '127.0.0.1'].includes(u.hostname) || !u.pathname.endsWith('_test')) throw new Error('refusing non-throwaway DB');
      const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
      const shows = [${JSON.stringify(id('show-a'))}, ${JSON.stringify(id('show-b'))}];
      const djs = ${JSON.stringify(Object.keys(DJ).map(id))};
      const eps = (await prisma.episode.findMany({ where: { showId: { in: shows } }, select: { id: true } })).map((e) => e.id);
      await prisma.attendanceRecord.deleteMany({ where: { OR: [{ episodeId: { in: eps } }, { rosterId: { in: djs } }] } });
      await prisma.episodeAnalyticsSnapshot.deleteMany({ where: { episodeId: { in: eps } } });
      await prisma.episode.deleteMany({ where: { id: { in: eps } } });
      await prisma.showRosterEntry.deleteMany({ where: { showId: { in: shows } } });
      await prisma.show.deleteMany({ where: { id: { in: shows } } });
      await prisma.rosterEntry.deleteMany({ where: { id: { in: djs } } });
      await prisma.stationSession.deleteMany({ where: { id: 'e2e-195-booth' } });
      await prisma.streamHealth.deleteMany({});
      await prisma.$disconnect();
    }
    main().catch((e) => { console.error(e); process.exit(1); });
  `);
}

async function station(page: Page, route: string, data: object) {
  return page.request.post(`${API_BASE}/api/studio/${route}`, {
    headers: { Authorization: `Bearer ${STATION_TOKEN}`, 'x-wildcat-device-id': STATION_DEVICE_ID },
    data,
  });
}

async function openStudio(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  const handoff = await page.request.post(`${API_BASE}/api/studio/handoff`, {
    headers: { Authorization: `Bearer ${STATION_TOKEN}`, 'x-wildcat-device-id': STATION_DEVICE_ID },
  });
  expect(handoff.ok()).toBeTruthy();
  const { handoff: code } = (await handoff.json()) as { handoff: string };
  await page.goto(`${WEB_BASE}/listen#station_handoff=${encodeURIComponent(code)}`);
  await page.waitForURL(`${WEB_BASE}/studio`, { timeout: 15_000 });
  await expect(page.getByTestId('studio-slot-row').first()).toBeVisible();
  return errors;
}

const timeOutButton = (page: Page, name: string) => page.getByRole('button', { name: `Time out ${name}` });
/** Console errors that aren't ours: the stream manifest 404s with no booth publishing. */
const ours = (errors: string[]) => errors.filter((e) => !/Failed to load resource.*(manifest|m3u8)/i.test(e));

test.describe.configure({ mode: 'serial' });

test.describe('FE#132 show transitions', () => {
  test.skip(!dbOk, 'needs SHOW_TRANSITIONS_DATABASE_URL = a local *_test database (the API on :3010 must use it too)');
  test.skip(NOW < 60 || NOW + 61 > 24 * 60, 'fixtures need now-60m … now+61m inside one station day');
  test.afterAll(() => {
    if (dbOk) cleanup();
  });

  test('W-E1/E2/E3/E4/E7/E9/E10: golden hand-over, with the keep-broadcasting edge', async ({ page }) => {
    seed();
    const errors = await openStudio(page);

    // W-E10 labeled elapsed chip; W-E9 last-five-minutes cue.
    await expect(page.getByTestId('studio-kiosk-dj-chip')).toContainText(`${DJ.A1} · on 40m`);
    await expect(page.getByTestId('studio-slot-cue')).toHaveAttribute('data-kind', 'soon');
    await expect(page.getByTestId('studio-slot-cue')).toContainText(/Ends in [0-4]:\d\d/);

    // W-E1 up next before anyone checks in.
    const upNext = page.getByTestId('studio-up-next');
    await expect(upNext).toContainText('Show Bravo');
    await expect(upNext).toContainText(/Starts .* · in [1-4] min/);
    await expect(upNext.getByTestId('studio-up-next-dj').filter({ hasText: DJ.B1 })).toContainText('not here');

    // W-E7 early check-in: B1 taps in while A is on air → waits for B; A untouched.
    expect((await (await station(page, 'time-in', { rosterId: id('B1') })).json()).state).toBe('PENDING_HANDOVER');
    await expect(page.getByTestId('studio-handover-title')).toContainText('Checked in for Show Bravo · starts', { timeout: 20_000 });
    await expect(page.getByTestId('studio-handover')).toHaveText(/Start my show/);
    await expect(upNext.getByTestId('studio-up-next-dj').filter({ hasText: DJ.B1 })).toContainText('here');
    await expect(page.getByTestId('studio-up-next-dj').filter({ hasText: DJ.B2 })).toContainText('not here');

    // W-E4 edge: Keep broadcasting sends nothing.
    await timeOutButton(page, DJ.A1).click();
    const dialog = page.getByTestId('studio-end-show-dialog');
    await expect(dialog).toContainText('End Show Alpha?');
    await expect(dialog).toContainText(`${DJ.A1} is the last DJ on air`);
    await expect(dialog.getByTestId('studio-end-show-next')).toContainText('Show Bravo');
    await expect(dialog.getByTestId('studio-end-show-next')).toContainText(`${DJ.B1} · here`);
    await expect(page.getByTestId('studio-end-show-cancel')).toBeFocused(); // W-E2
    let posts = 0;
    page.on('request', (r) => r.method() === 'POST' && r.url().includes('/studio/time-out') && posts++);
    await page.getByTestId('studio-end-show-cancel').click();
    await expect(dialog).toBeHidden();
    expect(posts).toBe(0);
    await expect(page.getByTestId('studio-kiosk-dj-chip')).toContainText(DJ.A1);

    // W-E3 confirm → hand-over moment, B on air.
    await timeOutButton(page, DJ.A1).click();
    await expect(page.getByTestId('studio-end-show-confirm')).toHaveText('End show & hand over');
    await page.getByTestId('studio-end-show-confirm').click();
    // Regression: the closing dialog must not flash fallback copy for its exit frame.
    await expect(page.getByText('End this ad-hoc episode?')).toHaveCount(0);
    const moment = page.getByTestId('studio-transition');
    await expect(moment).toContainText('Show Alpha ended');
    await expect(moment).toContainText(`Show Bravo is live — welcome ${DJ.B1}`);
    await expect(page.getByTestId('studio-kiosk-dj-chip')).toContainText(DJ.B1);
    await expect(page.getByTestId('studio-schedule-row').filter({ hasText: 'Show Bravo' })).toHaveAttribute('data-status', 'ON_AIR');
    await expect(moment).toBeHidden({ timeout: 10_000 });
    expect(ours(errors)).toEqual([]);
  });

  test('W-E5/E6: nobody waiting → End show plays rotation; a non-last DJ times out without a dialog', async ({ page }) => {
    seed({ onAir: ['A1', 'A2'] });
    const errors = await openStudio(page);
    await timeOutButton(page, DJ.A2).click();
    await expect(page.getByTestId('studio-end-show-dialog')).toBeHidden();
    await expect(page.getByTestId('studio-kiosk-dj-chip')).toHaveCount(1);

    await timeOutButton(page, DJ.A1).click();
    const dialog = page.getByTestId('studio-end-show-dialog');
    await expect(dialog.getByTestId('studio-end-show-rotation')).toContainText('Nobody is waiting');
    await expect(dialog.getByTestId('studio-end-show-rotation')).toContainText('Next on the schedule: Show Bravo');
    await expect(page.getByTestId('studio-end-show-confirm')).toHaveText('End show');
    await page.getByTestId('studio-end-show-confirm').click();
    await expect(page.getByTestId('studio-transition')).toContainText('Show Alpha ended · the station is playing rotation');
    await expect(page.getByTestId('studio-ended-early')).toBeVisible();
    expect(ours(errors)).toEqual([]);
  });

  test('W-E4b: race — the kiosk still shows two DJs, the other already left: the API asks for the confirm', async ({ page }) => {
    seed({ onAir: ['A1', 'A2'] });
    const errors = await openStudio(page);
    await expect(page.getByTestId('studio-kiosk-dj-chip')).toHaveCount(2);
    // A2 times out from another kiosk; this one hasn't refreshed yet.
    expect((await station(page, 'time-out', { rosterId: id('A2') })).ok()).toBeTruthy();
    await timeOutButton(page, DJ.A1).click();
    const dialog = page.getByTestId('studio-end-show-dialog');
    await expect(dialog).toContainText('End Show Alpha?');
    await expect(page.getByTestId('studio-attendance-alert')).toBeHidden(); // a question, not an error
    await page.getByTestId('studio-end-show-confirm').click();
    await expect(page.getByTestId('studio-transition')).toContainText('Show Alpha ended');
    // The browser logs the API's 409 itself; nothing else may.
    expect(ours(errors).filter((e) => !e.includes('409'))).toEqual([]);
  });

  test('W-E8: Go live now asks first; Cancel sends nothing; confirm starts the show early', async ({ page }) => {
    seed({ onAir: [] });
    const errors = await openStudio(page);
    // Nothing on air, A's slot still running, B starts in 4 min: B1 checks in early.
    await page.getByTestId('studio-timein-sub').click();
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(DJ.B1) }).click();
    await expect(page.getByTestId('studio-handover-title')).toContainText('Checked in for Show Bravo');
    await expect(page.getByTestId('studio-handover')).toHaveText(/Go live now/);
    await page.getByTestId('studio-handover').click();
    const dialog = page.getByTestId('studio-go-live-dialog');
    await expect(dialog.getByTestId('studio-go-live-summary')).toHaveText('Nothing is on air — Show Bravo starts now.');
    let posts = 0;
    page.on('request', (r) => r.method() === 'POST' && r.url().includes('/studio/handover') && posts++);
    await page.getByTestId('studio-go-live-cancel').click();
    expect(posts).toBe(0);
    await page.getByTestId('studio-handover').click();
    await page.getByTestId('studio-go-live-confirm').click();
    await expect(page.getByTestId('studio-kiosk-dj-chip')).toContainText(DJ.B1);
    await expect(page.getByTestId('studio-handover-banner')).toBeHidden();
    expect(ours(errors)).toEqual([]);
  });

  test('W-E8b/W-E9: overtime cue names who waits; Start my show names what it ends', async ({ page }) => {
    seed({ aEnd: -3, bStart: -3 });
    const errors = await openStudio(page);
    await station(page, 'time-in', { rosterId: id('B1') });
    await expect(page.getByTestId('studio-slot-cue')).toContainText(/Overtime \+[34] min · Show Bravo waiting/, { timeout: 20_000 });
    await page.getByTestId('studio-handover').click();
    await expect(page.getByTestId('studio-go-live-summary')).toContainText(`This ends Show Alpha (${DJ.A1}, on 40m)`);
    await page.getByTestId('studio-go-live-confirm').click();
    await expect(page.getByTestId('studio-transition')).toContainText(`Show Bravo is live — welcome ${DJ.B1}`);
    expect(ours(errors)).toEqual([]);
  });

  test('W-E11/W-E12: console shows the show name, follows a hand-over instantly, lock asks first', async ({ page }) => {
    seed();
    const errors = await openStudio(page);
    await page.getByRole('button', { name: /Console/ }).first().click();
    await expect(page.getByTestId('studio-console-show')).toHaveText('Show Alpha');

    // A hand-over from elsewhere (another kiosk tab / API) reaches the console
    // through the socket, well inside the 15 s poll.
    await station(page, 'time-in', { rosterId: id('B1') });
    const t0 = Date.now();
    await station(page, 'handover', { rosterId: id('B1') });
    await expect(page.getByTestId('studio-transition')).toContainText('Show Bravo is live', { timeout: 5_000 });
    expect(Date.now() - t0).toBeLessThan(5_000);
    await expect(page.getByTestId('studio-console-show')).toHaveText('Show Bravo');

    // W-E11 Lock kiosk: Cancel keeps the session; Confirm locks.
    await page.getByTestId('studio-lock-kiosk').click();
    await expect(page.getByTestId('studio-lock-dialog')).toContainText('Lock this kiosk?');
    await page.getByTestId('studio-lock-cancel').click();
    await expect(page.getByTestId('studio-console-show')).toBeVisible();
    await page.getByTestId('studio-lock-kiosk').click();
    await page.getByTestId('studio-lock-confirm').click();
    await expect(page.getByTestId('studio-handoff-required')).toBeVisible();
    expect(ours(errors)).toEqual([]);
  });

  test('W-E13: keyboard only — the end-show dialog opens, Escape keeps the show, focus returns', async ({ page }) => {
    seed();
    await openStudio(page);
    const button = timeOutButton(page, DJ.A1);
    await button.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('studio-end-show-cancel')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
    await expect(page.getByTestId('studio-kiosk-dj-chip')).toContainText(DJ.A1);
  });
});
