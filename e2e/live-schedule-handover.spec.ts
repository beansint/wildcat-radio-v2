import { createHash } from 'node:crypto';
import path from 'node:path';
import { expect as baseExpect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { API_BASE, BACKEND_DIR, WEB_BASE, execBackendTsx, loginAs } from './_fixtures';

/**
 * #106 / FE#84 — live schedule exceptions, explicit DJ handover, approved
 * overtime, truthful public "On air". Spec-first from
 * .agent/test-suites/live-schedule-handover/web/e2e.md (WEB-E-01..09).
 *
 * Real API (3010) + real Neon dev DB + real browser. The backend clock is the
 * real clock, so fixtures are placed RELATIVE to now in station time:
 *   A  [now-90m, now-10m]  — overrunning: its episode is still open (seeded)
 *   B  [now-10m, now+50m]  — the current occurrence; its DJ arrives mid-overrun
 *   C  [now+60m, now+120m] — later today; used for delay / cancel / resume
 * Only the open-episode state is seeded directly (there is no API to start a
 * scheduled episode in the past); everything else goes through the UI/API.
 */

// Dev API talks to Neon in another region (~10 queries per lifecycle call), so
// post-mutation UI assertions get a longer, explicit budget than the 5s default.
const expect = baseExpect.configure({ timeout: 20_000 });

const STATION_TOKEN = process.env.STATION_DEVICE_TOKEN ?? 'dev-studio-token-change-me';
const STATION_DEVICE_ID = process.env.WC_DEVICE_ID ?? 'e2e-browser-device-3011';
const TOKEN_HASH = createHash('sha256').update(STATION_TOKEN).digest('hex');
const OFFSET_MIN = Number.parseInt(process.env.STATION_UTC_OFFSET_MINUTES ?? '480', 10);
const RUN = `${Date.now()}`.slice(-7);

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const stationNow = () => new Date(Date.now() + OFFSET_MIN * 60_000); // read with getUTC*
const localMinutes = () => {
  const n = stationNow();
  return n.getUTCHours() * 60 + n.getUTCMinutes();
};
const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const today = () => stationNow().toISOString().slice(0, 10);
const weekday = () => WEEKDAYS[stationNow().getUTCDay()];

const NOW = localMinutes();
const SLOTS = {
  A: { start: NOW - 90, end: NOW - 10 },
  B: { start: NOW - 10, end: NOW + 50 },
  C: { start: NOW + 60, end: NOW + 120 },
};
const ids = {
  showA: `e2e106-a-${RUN}`,
  showB: `e2e106-b-${RUN}`,
  showC: `e2e106-c-${RUN}`,
  djA: `e2e106-dja-${RUN}`,
  djB: `e2e106-djb-${RUN}`,
};
const names = {
  A: `E2E106 Alpha ${RUN}`,
  B: `E2E106 Bravo ${RUN}`,
  C: `E2E106 Charlie ${RUN}`,
  djA: `DJ Alpha ${RUN}`,
  djB: `DJ Bravo ${RUN}`,
};

function prismaScript(body: string) {
  execBackendTsx(`
    import * as dotenv from 'dotenv';
    import { PrismaPg } from '@prisma/adapter-pg';
    import { PrismaClient } from '@prisma/client';
    async function main() {
      dotenv.config({ path: ${JSON.stringify(path.join(BACKEND_DIR, 'apps/api/.env'))} });
      const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
      const offset = ${OFFSET_MIN};
      const at = (date: string, hm: string) => {
        const [y, mo, d] = date.split('-').map(Number); const [h, mi] = hm.split(':').map(Number);
        return new Date(Date.UTC(y, mo - 1, d, h, mi) - offset * 60000);
      };
      ${body}
      await prisma.$disconnect();
    }
    main().catch((e) => { console.error(e); process.exit(1); });
  `);
}

const OUR_SHOWS = JSON.stringify([ids.showA, ids.showB, ids.showC]);

function seed() {
  const cadence = (k: 'A' | 'B' | 'C') =>
    JSON.stringify({ kind: 'WEEKLY', days: [weekday()], start: hhmm(SLOTS[k].start), end: hhmm(SLOTS[k].end) });
  prismaScript(`
    const date = ${JSON.stringify(today())};
    await prisma.stationSession.upsert({
      where: { id: 'seed-studio-pc-0001' },
      update: { tokenHash: ${JSON.stringify(TOKEN_HASH)}, isActive: true, deviceId: ${JSON.stringify(STATION_DEVICE_ID)}, generation: 1, revokedAt: null, leaseExpiresAt: null },
      create: { id: 'seed-studio-pc-0001', label: 'E2E106 Studio', tokenHash: ${JSON.stringify(TOKEN_HASH)}, isActive: true, deviceId: ${JSON.stringify(STATION_DEVICE_ID)} },
    });
    await prisma.episode.updateMany({ where: { startedAt: { not: null }, endedAt: null }, data: { endedAt: new Date(), status: 'OFF_AIR' } });
    await prisma.rosterEntry.create({ data: { id: ${JSON.stringify(ids.djA)}, displayName: ${JSON.stringify(names.djA)} } });
    await prisma.rosterEntry.create({ data: { id: ${JSON.stringify(ids.djB)}, displayName: ${JSON.stringify(names.djB)} } });
    for (const [id, name, cadence, dj] of [
      [${JSON.stringify(ids.showA)}, ${JSON.stringify(names.A)}, ${cadence('A')}, ${JSON.stringify(ids.djA)}],
      [${JSON.stringify(ids.showB)}, ${JSON.stringify(names.B)}, ${cadence('B')}, ${JSON.stringify(ids.djB)}],
      [${JSON.stringify(ids.showC)}, ${JSON.stringify(names.C)}, ${cadence('C')}, null],
    ] as const) {
      await prisma.show.create({ data: { id, name, slug: id, cadence, roster: dj ? { create: [{ rosterId: dj }] } : undefined } });
    }
    // Show A is overrunning: its occurrence started, its DJ is still on air.
    const startedAt = new Date(Date.now() - 60 * 60000);
    const ep = await prisma.episode.create({ data: {
      showId: ${JSON.stringify(ids.showA)}, unscheduled: false, status: 'OFF_AIR',
      scheduledFor: at(date, ${JSON.stringify(hhmm(SLOTS.A.start))}),
      scheduledEndAt: at(date, ${JSON.stringify(hhmm(SLOTS.A.end))}),
      effectiveStartAt: at(date, ${JSON.stringify(hhmm(SLOTS.A.start))}),
      effectiveEndAt: at(date, ${JSON.stringify(hhmm(SLOTS.A.end))}),
      startedAt,
    } });
    await prisma.attendanceRecord.create({ data: { episodeId: ep.id, rosterId: ${JSON.stringify(ids.djA)}, timeIn: startedAt, onAirStartAt: startedAt, source: 'TAP' } });
  `);
}

function cleanup() {
  prismaScript(`
    const shows = ${OUR_SHOWS};
    const eps = await prisma.episode.findMany({ where: { showId: { in: shows } }, select: { id: true } });
    const epIds = eps.map((e) => e.id);
    await prisma.attendanceRecord.deleteMany({ where: { OR: [{ episodeId: { in: epIds } }, { rosterId: { in: [${JSON.stringify(ids.djA)}, ${JSON.stringify(ids.djB)}] } }] } });
    await prisma.episodeAnalyticsSnapshot.deleteMany({ where: { episodeId: { in: epIds } } });
    await prisma.episode.deleteMany({ where: { id: { in: epIds } } });
    await prisma.showOccurrenceOverride.deleteMany({ where: { showId: { in: shows } } });
    await prisma.showRosterEntry.deleteMany({ where: { showId: { in: shows } } });
    await prisma.show.deleteMany({ where: { id: { in: shows } } });
    await prisma.rosterEntry.deleteMany({ where: { id: { in: [${JSON.stringify(ids.djA)}, ${JSON.stringify(ids.djB)}] } } });
    // WEB-E-06 leaves fresh publication evidence; a later spec's
    // sourceConnected:false heartbeat would then read as SOURCE_STALE and
    // auto-close its fixture episode. Leave stream health as we found it: empty.
    await prisma.streamHealth.deleteMany({});
  `);
}

async function stationPost(page: Page, route: string, data: object) {
  return page.request.post(`${API_BASE}/api/${route}`, {
    headers: { Authorization: `Bearer ${STATION_TOKEN}`, 'x-wildcat-device-id': STATION_DEVICE_ID },
    data,
  });
}

async function unlockStudio(page: Page): Promise<void> {
  const handoff = await page.request.post(`${API_BASE}/api/studio/handoff`, {
    headers: { Authorization: `Bearer ${STATION_TOKEN}`, 'x-wildcat-device-id': STATION_DEVICE_ID },
  });
  expect(handoff.ok()).toBeTruthy();
  const { handoff: code } = (await handoff.json()) as { handoff: string };
  await page.goto(`${WEB_BASE}/listen#station_handoff=${encodeURIComponent(code)}`);
  await page.waitForURL(`${WEB_BASE}/studio`, { timeout: 15_000 });
}

/** One moderator sign-in per run (sign-in is rate-limited); later tests reuse its session. */
let modState: Awaited<ReturnType<BrowserContext['storageState']>> | undefined;
async function moderatorPage(browser: Browser): Promise<Page> {
  if (modState) return (await browser.newContext({ storageState: modState })).newPage();
  const page = await (await browser.newContext()).newPage();
  await loginAs(page, 'moderator');
  modState = await page.context().storageState();
  return page;
}

/** WEB-E-09: every page visited must be console-error free. */
function trackConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  // Name the request behind any "Failed to load resource" (CI has no traces).
  page.on('response', (r) => {
    if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.request().method()} ${r.url()}`);
  });
  return errors;
}

const studioRow = (page: Page, name: string) =>
  page.getByTestId('studio-schedule-row').filter({ hasText: name });

test.describe.configure({ mode: 'serial' });

test.describe('#106 live schedule, handover, approved overtime', () => {
  test.skip(NOW < 95 || NOW + 125 > 24 * 60, 'fixtures need a same-day window of now-90m … now+120m (station time)');

  test.beforeAll(() => {
    cleanup();
    seed();
  });
  test.afterAll(() => cleanup());

  test('WEB-E-04: studio shows the full day; a mid-overrun arrival waits, then "Start my show" hands over', async ({ page }) => {
    const errors = trackConsole(page);
    await unlockStudio(page);

    await expect(studioRow(page, names.A)).toHaveAttribute('data-status', 'ON_AIR');
    await expect(studioRow(page, names.B)).toHaveAttribute('data-status', 'SCHEDULED');
    await expect(studioRow(page, names.C)).toHaveAttribute('data-status', 'SCHEDULED');

    await page.getByTestId('studio-timein-sub').click();
    await page.getByTestId('studio-timein-sub-search').fill(names.djB);
    await page.getByTestId('studio-timein-sub-option').filter({ hasText: names.djB }).click();

    await expect(page.getByTestId('app-toast')).toContainText('waiting for the current show to hand over');
    const banner = page.getByTestId('studio-handover-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('role', 'status');
    await expect(banner).toContainText(names.B);
    await expect(banner).toContainText(names.djB);
    await expect(studioRow(page, names.A)).toHaveAttribute('data-status', 'ON_AIR'); // outgoing untouched
    await expect(studioRow(page, names.B)).toHaveAttribute('data-status', 'PENDING_HANDOVER');

    await page.getByTestId('studio-handover').click();
    await expect(banner).toBeHidden();
    await expect(studioRow(page, names.B)).toHaveAttribute('data-status', 'ON_AIR');
    await expect(studioRow(page, names.A)).toHaveAttribute('data-status', 'DONE');
    expect(errors).toEqual([]);
  });

  test('WEB-E-06: public "On air" only for the show actually broadcasting', async ({ page }) => {
    test.skip(['SAT', 'SUN'].includes(weekday()), 'public grid is Mon–Fri');
    const errors = trackConsole(page);
    const now = new Date().toISOString();
    const hb = await stationPost(page, 'stream/heartbeat', { sourceConnected: true, lastSegmentAt: now, lastPublishedAt: now });
    expect(hb.ok()).toBeTruthy();
    const manifest = await (await page.request.get(`${API_BASE}/api/stream/manifest`)).json();
    expect(manifest).toMatchObject({ status: 'LIVE', showId: ids.showB });

    await page.goto(`${WEB_BASE}/schedule`);
    const grid = page.getByTestId('schedule-grid');
    const bravo = grid.getByRole('link', { name: new RegExp(names.B) });
    const alpha = grid.getByRole('link', { name: new RegExp(names.A) });
    await expect(bravo.locator('.wc-badge-live')).toBeVisible();
    await expect(alpha.locator('.wc-badge-live')).toHaveCount(0);

    await page.goto(`${WEB_BASE}/shows/${ids.showB}`);
    await expect(page.getByText('Live now')).toBeVisible();
    await page.goto(`${WEB_BASE}/shows/${ids.showA}`);
    await expect(page.getByRole('heading', { name: names.A })).toBeVisible();
    await expect(page.getByText('Live now')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('WEB-E-01/02/07/08: moderator delays, cancels (keyboard), resumes one date; public board reflects it', async ({ browser }) => {
    const page = await moderatorPage(browser);
    const errors = trackConsole(page);
    await page.goto(`${WEB_BASE}/mod/schedule`);
    const panel = page.getByTestId('mod-occurrences');
    const row = (name: string) => panel.getByTestId('mod-occurrence-row').filter({ hasText: name });

    await expect(row(names.A).getByTestId('mod-occurrence-locked')).toBeVisible();
    await expect(row(names.B).getByTestId('mod-occurrence-locked')).toBeVisible();

    // Edge: overlapping Bravo → server 409 shown in the dialog's alert region.
    await row(names.C).getByTestId('mod-occurrence-delay').click();
    const dialog = page.getByTestId('occ-delay-dialog');
    await dialog.getByTestId('occ-delay-start').fill(hhmm(NOW + 40));
    await dialog.getByTestId('occ-delay-end').fill(hhmm(NOW + 100));
    await dialog.getByTestId('occ-delay-reason').fill('Room double-booked');
    await dialog.getByTestId('occ-delay-save').click();
    // Names the first clashing show (Bravo, or another dev show airing then); never the raw code.
    await expect(dialog.getByTestId('occ-delay-alert')).toContainText(/^overlaps ".+" on \d{4}-\d{2}-\d{2}$/);
    // Golden: a free window.
    await dialog.getByTestId('occ-delay-start').fill(hhmm(NOW + 70));
    await dialog.getByTestId('occ-delay-end').fill(hhmm(NOW + 130));
    await dialog.getByTestId('occ-delay-save').click();
    await expect(dialog).toBeHidden();
    await expect(row(names.C)).toHaveAttribute('data-status', 'DELAYED');
    await expect(row(names.C)).toContainText('Room double-booked');

    // Cancel — empty reason blocked client-side; Esc returns focus to the trigger.
    const cancelBtn = row(names.C).getByTestId('mod-occurrence-cancel');
    await cancelBtn.click();
    await page.getByTestId('occ-cancel-confirm').click();
    await expect(page.getByTestId('occ-cancel-alert')).toContainText('Add a reason');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('occ-cancel')).toBeHidden();
    await expect(cancelBtn).toBeFocused();
    // Keyboard-only completion.
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('occ-cancel-reason')).toBeVisible();
    await page.getByTestId('occ-cancel-reason').focus();
    await page.keyboard.type('Exam week');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('occ-cancel-confirm')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('occ-cancel')).toBeHidden();
    await expect(row(names.C)).toHaveAttribute('data-status', 'CANCELLED');

    // WEB-E-07: public board marks it for today.
    if (!['SAT', 'SUN'].includes(weekday())) {
      const pub = await page.context().newPage();
      trackConsole(pub);
      await pub.goto(`${WEB_BASE}/schedule`);
      const charlie = pub.getByTestId('schedule-grid').getByRole('link', { name: new RegExp(names.C) });
      await expect(charlie.getByTestId('schedule-today-cancelled')).toBeVisible();
      await pub.close();
    }

    await row(names.C).getByTestId('mod-occurrence-resume').click();
    await page.getByTestId('occ-resume-reason').fill('Exams moved');
    await page.getByTestId('occ-resume-confirm').click();
    await expect(row(names.C)).toHaveAttribute('data-status', 'SCHEDULED');
    // Only the browser's own network log for the deliberate overlap (409) is allowed.
    expect(errors.filter((e) => !/status of 409 \(Conflict\)/.test(e))).toEqual([]);
    expect(errors.filter((e) => /status of 409/.test(e))).toHaveLength(1);
  });

  test('WEB-E-03: overtime is pending until a moderator approves it; revoke returns it to pending', async ({ browser }) => {
    const page = await moderatorPage(browser);
    const errors = trackConsole(page);
    await page.goto(`${WEB_BASE}/mod/attendance`);
    await page.getByTestId('mod-attendance-search').fill(names.djA);
    const djRow = page.locator('tr').filter({ hasText: names.djA });
    await expect(djRow.getByTestId('mod-attendance-status')).toContainText(/Overtime pending · \d+m/);

    await djRow.getByTestId('mod-attendance-approve-ot').click();
    await page.getByTestId('att-approve-ot-confirm').click();
    await expect(page.getByTestId('att-approve-ot-alert')).toContainText('Add a reason');
    await page.getByTestId('att-approve-ot-reason').fill('Agreed with station manager');
    await page.getByTestId('att-approve-ot-confirm').click();
    await expect(djRow.getByTestId('mod-attendance-status')).toContainText('Agreed overtime');

    await djRow.getByTestId('mod-attendance-revoke-ot').click();
    await page.getByTestId('att-revoke-ot-confirm').click();
    await expect(djRow.getByTestId('mod-attendance-status')).toContainText('Overtime pending');
    expect(errors).toEqual([]);
  });

  test('WEB-E-10: 375px — new panel and today marks never cause horizontal page scroll', async ({ browser }) => {
    const page = await moderatorPage(browser);
    await page.setViewportSize({ width: 375, height: 812 });
    // Wait for the rendered content, not 'networkidle': manifest/today polling
    // and the presence socket keep the network busy, so it never settles in CI.
    for (const [url, ready] of [
      [`${WEB_BASE}/mod/schedule`, 'mod-occurrence-row'],
      [`${WEB_BASE}/schedule`, 'schedule-mobile-panel'],
    ] as const) {
      await page.goto(url);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${url} scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
    }
    await page.goto(`${WEB_BASE}/mod/schedule`);
    await expect(page.getByTestId('mod-occurrences').getByTestId('mod-occurrence-row').filter({ hasText: names.C })).toBeVisible();
  });

  test('WEB-E-05: tapping in during a cancelled slot shows a clear message and changes nothing', async ({ page }) => {
    const errors = trackConsole(page);
    // Reset: nothing on air, Bravo cancelled for today. Any OTHER show airing
    // right now in the shared dev DB would legitimately take the tap, so the
    // case only runs when Bravo's is the only slot covering now.
    prismaScript(`
      const shows = ${OUR_SHOWS};
      const eps = await prisma.episode.findMany({ where: { showId: { in: shows } }, select: { id: true } });
      await prisma.attendanceRecord.deleteMany({ where: { episodeId: { in: eps.map((e) => e.id) } } });
      await prisma.episodeAnalyticsSnapshot.deleteMany({ where: { episodeId: { in: eps.map((e) => e.id) } } });
      await prisma.episode.deleteMany({ where: { id: { in: eps.map((e) => e.id) } } });
      await prisma.episode.updateMany({ where: { startedAt: { not: null }, endedAt: null }, data: { endedAt: new Date(), status: 'OFF_AIR' } });
      await prisma.showOccurrenceOverride.create({ data: {
        showId: ${JSON.stringify(ids.showB)}, date: new Date(${JSON.stringify(today())} + 'T00:00:00Z'),
        status: 'CANCELLED', reason: 'e2e', createdById: 'e2e', updatedById: 'e2e' } });
    `);
    const todayRes = await (await page.request.get(`${API_BASE}/api/schedule/today`)).json();
    const nowIso = Date.now();
    const others = (todayRes.occurrences as Array<{ showId: string; showName: string; status: string; effectiveStart: string; effectiveEnd: string }>).filter(
      (o) => o.showId !== ids.showB && o.status !== 'CANCELLED' && Date.parse(o.effectiveStart) <= nowIso && nowIso < Date.parse(o.effectiveEnd),
    );
    test.skip(others.length > 0, `another dev show airs now (${others.map((o) => o.showName).join(', ')}) and would take the tap`);

    await unlockStudio(page);
    await expect(studioRow(page, names.B)).toHaveAttribute('data-status', 'CANCELLED');
    await page.getByTestId('studio-timein-sub').click();
    await page.getByTestId('studio-timein-sub-search').fill(names.djB);
    await page.getByTestId('studio-timein-sub-option').filter({ hasText: names.djB }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'cancelled today' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'OCCURRENCE_CANCELLED' })).toHaveCount(0);
    await expect(page.getByTestId('studio-handover-banner')).toHaveCount(0);
    expect(errors.filter((e) => !e.includes('409'))).toEqual([]);
  });
});

test.describe('#114 explicit continuing-crew handover', () => {
  test.skip(!process.env.CI || !process.env.DATABASE_URL?.includes('@localhost:'), 'global fixtures are allowed only on CI isolated Postgres');
  test.skip(NOW < 95 || NOW + 125 > 24 * 60, 'fixtures require a same-day station window');
  test.beforeEach(() => {
    cleanup();
    seed();
    prismaScript(`await prisma.showRosterEntry.create({ data: { showId: ${JSON.stringify(ids.showB)}, rosterId: ${JSON.stringify(ids.djA)} } });`);
  });
  test.afterAll(() => cleanup());

  test('outgoing overtime remains open until the crew explicitly starts its next show', async ({ page }) => {
    const errors = trackConsole(page);
    await unlockStudio(page);
    await expect(studioRow(page, names.A)).toHaveAttribute('data-status', 'ON_AIR');
    await expect(page.getByRole('button', { name: 'Start next show', exact: true })).toBeVisible();
    const before = await (await page.request.get(`${API_BASE}/api/studio/today`)).json();
    expect(before.episode.showId).toBe(ids.showA);
    expect(before.pendingHandover.continuingCrew).toBe(true);
    await page.getByRole('button', { name: 'Start next show', exact: true }).click();
    await expect(studioRow(page, names.B)).toHaveAttribute('data-status', 'ON_AIR');
    await expect(studioRow(page, names.A)).toHaveAttribute('data-status', 'DONE');
    await expect(page.getByTestId('studio-handover-banner')).toHaveCount(0);
    prismaScript(`
      const outgoing = await prisma.episode.findFirstOrThrow({ where: { showId: ${JSON.stringify(ids.showA)} }, include: { attendance: true } });
      const row = outgoing.attendance.find(a => a.rosterId === ${JSON.stringify(ids.djA)});
      if (!row?.timeOut || row.timeOutSource !== 'HANDOVER' || row.timeOut <= outgoing.effectiveEndAt || row.overtimeApprovedAt) throw new Error('Outgoing overtime attribution was lost');
      const incoming = await prisma.episode.findFirstOrThrow({ where: { showId: ${JSON.stringify(ids.showB)}, endedAt: null }, include: { attendance: true } });
      if (!incoming.attendance.some(a => a.rosterId === ${JSON.stringify(ids.djA)} && !a.timeOut && a.onAirStartAt)) throw new Error('Continuing crew was not transferred');
      if (await prisma.episode.count({ where: { startedAt: { not: null }, endedAt: null } }) !== 1) throw new Error('More than one episode is open');
    `);
    expect(errors).toEqual([]);
  });
  test('a pending incoming DJ starts the show without dropping the continuing outgoing DJ', async ({ page }) => {
    await unlockStudio(page);
    const arrival = await stationPost(page, 'studio/time-in', { rosterId: ids.djB });
    expect(arrival.ok()).toBeTruthy();
    expect((await arrival.json()).state).toBe('PENDING_HANDOVER');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Start my show', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Start my show', exact: true }).click();
    await expect(studioRow(page, names.B)).toHaveAttribute('data-status', 'ON_AIR');
    prismaScript(`
      const incoming = await prisma.episode.findFirstOrThrow({ where: { showId: ${JSON.stringify(ids.showB)}, endedAt: null }, include: { attendance: true } });
      for (const rosterId of [${JSON.stringify(ids.djA)}, ${JSON.stringify(ids.djB)}]) {
        if (!incoming.attendance.some(a => a.rosterId === rosterId && !a.timeOut && a.onAirStartAt)) throw new Error('Incoming or continuing DJ was dropped');
      }
    `);
  });

});
