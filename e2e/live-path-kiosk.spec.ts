import { expect, test, type Page } from '@playwright/test';
import { appAlerts, attachConsoleGuard } from './_console';
import { json, manifestBody, mockManifest, mockSocket, snapshotBody, type ManifestBody } from './_live-path-mocks';

/**
 * live-path-hardening (#127) — booth kiosk resilience, W-E5..W-E10 + W-E12.
 * Catalog: .agent/test-suites/live-path-hardening/web/e2e.md (W-E11 archive is Phase 4).
 *
 * The kiosk must show what listeners actually hear, survive API blips without
 * hiding the roster or locking the booth out, and recover console state.
 */

// 02:30Z = 10:30 station time (UTC+8, NEXT_PUBLIC_STATION_UTC_OFFSET_MINUTES=480).
const T0 = Date.parse('2026-10-06T02:30:00.000Z');
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();
const MIN = 60_000;
const EPISODE = 'kiosk-episode';

type Today = Record<string, unknown>;

function show(overrides: Record<string, unknown> = {}) {
  return {
    id: null,
    showId: 'kiosk-show',
    scheduledFor: iso(-30 * MIN),
    effectiveStart: iso(-30 * MIN),
    effectiveEnd: iso(30 * MIN),
    status: 'SCHEDULED',
    showName: 'Morning Signal',
    djs: ['DJ Ana', 'DJ Ben'],
    ...overrides,
  };
}

const ROSTER = [
  { rosterId: 'r-ana', displayName: 'DJ Ana', timedIn: false, timeIn: null, timeOut: null },
  { rosterId: 'r-ben', displayName: 'DJ Ben', timedIn: false, timeIn: null, timeOut: null },
];

function openEpisodeToday(): Today {
  return {
    episode: { id: EPISODE, status: 'OPEN', startedAt: iso(-20 * MIN), endedAt: null, showId: 'kiosk-show', unscheduled: false },
    attendees: [{ rosterId: 'r-ana', displayName: 'DJ Ana', timeIn: iso(-20 * MIN) }],
    slotRoster: [{ ...ROSTER[0], timedIn: true, timeIn: iso(-20 * MIN) }, ROSTER[1]],
    todayShows: [show({ id: EPISODE, status: 'ON_AIR' })],
    pendingHandover: null,
  };
}

function idleToday(todayShows: unknown[]): Today {
  return { episode: null, attendees: [], slotRoster: ROSTER, todayShows, pendingHandover: null };
}

interface KioskOptions {
  today?: Today | number;
  session?: unknown;
  manifest?: ManifestBody;
  recentChat?: unknown[];
}

async function kiosk(page: Page, options: KioskOptions = {}) {
  await page.clock.install({ time: T0 });
  const socket = await mockSocket(page);
  let today: Today | number = options.today ?? openEpisodeToday();
  let session: unknown = options.session ?? { active: true, label: 'Booth PC' };
  let recentChat = options.recentChat ?? [];
  let todayRequests = 0;
  let sessionRequests = 0;
  let snapshotRequests = 0;
  await page.route('**/api/studio/session', (route) => {
    sessionRequests += 1;
    return typeof session === 'number' ? json(route, { message: 'nope' }, session) : json(route, session);
  });
  await page.route('**/api/studio/today', (route) => {
    todayRequests += 1;
    return typeof today === 'number' ? json(route, { message: 'Service Unavailable' }, today) : json(route, today);
  });
  await page.route('**/api/studio/roster', (route) => json(route, []));
  await page.route('**/api/studio/queue', (route) => json(route, { episodeId: EPISODE, showName: 'Morning Signal', items: [] }));
  await page.route('**/api/episodes/*/engagement-snapshot', (route) => {
    snapshotRequests += 1;
    const episodeId = new URL(route.request().url()).pathname.split('/')[3];
    return json(route, snapshotBody(episodeId, recentChat));
  });
  const manifest = await mockManifest(page, options.manifest ?? manifestBody({ episodeId: EPISODE, showName: 'Morning Signal' }));
  return {
    socket,
    manifest,
    setToday: (next: Today | number) => { today = next; },
    setSession: (next: unknown) => { session = next; },
    setRecentChat: (next: unknown[]) => { recentChat = next; },
    todayRequests: () => todayRequests,
    sessionRequests: () => sessionRequests,
    snapshotRequests: () => snapshotRequests,
  };
}

test.describe('live-path kiosk', () => {
  test('W-E5: a stale encoder reads "Encoder offline" with a ticking auto-end countdown, never "On air"', async ({ page }) => {
    const guard = attachConsoleGuard(page);
    const k = await kiosk(page, {
      manifest: manifestBody({
        status: 'STATION_ROTATION',
        reason: 'SOURCE_STALE',
        episodeId: EPISODE,
        showName: 'Morning Signal',
        autoEndsAt: iso(4 * MIN + 5_000),
      }),
    });
    await page.goto('/studio');

    const header = page.getByTestId('studio-kiosk-onair');
    await expect(header).toHaveAttribute('data-kind', 'encoder-offline');
    await expect(header).toHaveText(/Encoder offline — listeners hear rotation; show auto-ends in 4:0\d/);
    const card = page.getByTestId('studio-attendance-broadcast');
    await expect(card).toHaveText(/Encoder offline — listeners hear rotation; show auto-ends in 4:0\d/);
    await expect(page.getByText(/^On air/)).toHaveCount(0);
    await expect(page.getByTestId('studio-schedule-row')).toContainText('Open · encoder offline');

    // The countdown runs off a clock, not the poll.
    await page.clock.fastForward(MIN);
    await expect(header).toHaveText(/auto-ends in 3:0\d/);

    // A newer `stream:status` from the socket (encoder back) flips it straight to LIVE.
    await expect.poll(() => k.socket.connections()).toBeGreaterThan(0);
    k.socket.emit('stream:status', { episodeId: EPISODE, status: 'LIVE', reason: null, listeners: 3, autoEndsAt: null });
    await expect(header).toHaveAttribute('data-kind', 'live');
    await expect(header).toHaveText('On air · Morning Signal');
    await expect(card).toHaveText('On air now');
    guard.assertClean();
  });

  test('W-E5b: an open episode with a healthy LIVE manifest still says On air', async ({ page }) => {
    await kiosk(page);
    await page.goto('/studio');
    await expect(page.getByTestId('studio-kiosk-onair')).toHaveText('On air · Morning Signal');
    await expect(page.getByTestId('studio-attendance-broadcast')).toHaveText('On air now');
  });

  test('W-E6: /studio/today 503 keeps the cached roster with "Connection lost — updated hh:mm"', async ({ page }) => {
    const k = await kiosk(page);
    await page.goto('/studio');
    const rows = page.getByTestId('studio-slot-row');
    await expect(rows).toHaveCount(2);

    k.setToday(503);
    await page.clock.fastForward(15_100);
    const alert = page.getByTestId('studio-attendance-alert');
    await expect(alert).toHaveText(/^Connection lost — updated 10:3\d$/, { timeout: 10_000 });
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId('studio-schedule-row')).toHaveCount(1);
    await expect(page.getByTestId('studio-kiosk-onair')).toBeVisible();

    k.setToday(openEpisodeToday());
    await page.clock.fastForward(15_100);
    await expect(alert).toHaveCount(0);
    await expect(rows).toHaveCount(2);
  });

  test('W-E6b: a failed time-in still refetches today (onSettled)', async ({ page }) => {
    const k = await kiosk(page);
    await page.route('**/api/studio/time-in', (route) => json(route, { message: 'TIMEIN_CONFLICT: Already timed in elsewhere' }, 409));
    await page.goto('/studio');
    await expect(page.getByTestId('studio-slot-row')).toHaveCount(2);
    const before = k.todayRequests();
    await page.getByRole('button', { name: 'Time in DJ Ben' }).click();
    await expect(page.getByTestId('studio-attendance-alert')).toHaveText('Already timed in elsewhere');
    await expect.poll(() => k.todayRequests()).toBeGreaterThan(before);
  });

  test('W-E7: a session 503 shows "Can\'t reach server" + retry, not the lock screen', async ({ page }) => {
    const k = await kiosk(page, { session: 503 });
    await page.goto('/studio');
    const card = page.getByTestId('studio-unreachable');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByRole('heading', { name: "Can't reach server" })).toBeVisible();
    await expect(page.getByTestId('studio-handoff-required')).toHaveCount(0);
    expect(k.sessionRequests()).toBe(3); // first try + 2 retries

    k.setSession({ active: true, label: 'Booth PC' });
    await page.getByTestId('studio-session-retry').click();
    await expect(page.getByTestId('studio-kiosk-header')).toBeVisible();
    await expect(card).toHaveCount(0);
  });

  test('W-E7b: a real 401 is the lock screen, without retrying', async ({ page }) => {
    const k = await kiosk(page, { session: 401 });
    await page.goto('/studio');
    await expect(page.getByTestId('studio-handoff-required')).toBeVisible();
    await expect(page.getByTestId('studio-unreachable')).toHaveCount(0);
    expect(k.sessionRequests()).toBe(1);
  });

  test('W-E8: reload and socket reconnect mid-show keep the console chat', async ({ page }) => {
    const earlier = { id: 'c1', content: 'Earlier hello from a listener', asBooth: false, createdAt: iso(-5 * MIN), author: { handle: 'early', name: 'Early' } };
    const k = await kiosk(page, { recentChat: [earlier] });
    await page.goto('/studio');
    await page.getByTestId('studio-seg-console').click();
    await expect(page.getByText('Earlier hello from a listener')).toBeVisible();

    await page.reload();
    await page.getByTestId('studio-seg-console').click();
    await expect(page.getByText('Earlier hello from a listener')).toBeVisible();

    // Messages sent while the socket was down arrive via the snapshot on reconnect.
    await expect.poll(() => k.socket.connections()).toBeGreaterThan(0);
    const connectionsBefore = k.socket.connections();
    const snapshotsBefore = k.snapshotRequests();
    k.setRecentChat([earlier, { id: 'c2', content: 'Sent while the booth was offline', asBooth: false, createdAt: iso(-MIN), author: { handle: 'late', name: 'Late' } }]);
    k.socket.drop();
    await expect.poll(() => k.socket.connections(), { timeout: 20_000 }).toBeGreaterThan(connectionsBefore);
    await expect.poll(() => k.snapshotRequests()).toBeGreaterThan(snapshotsBefore);
    await expect(page.getByText('Sent while the booth was offline')).toBeVisible();
    await expect(page.getByText('Earlier hello from a listener')).toHaveCount(1);
  });

  test('W-E10: a show created mid-slot is "Up now" with its roster, on a ticking clock', async ({ page }) => {
    // Window opens 1 minute from now; the first poll already carries it.
    const k = await kiosk(page, { today: idleToday([show({ effectiveStart: iso(MIN), scheduledFor: iso(MIN) })]), manifest: manifestBody({ status: 'STATION_ROTATION', reason: 'NO_ATTENDANCE', episodeId: null, dj: [] }) });
    await page.goto('/studio');
    await expect(page.getByText('No open episode')).toBeVisible();
    await expect(page.getByTestId('studio-up-now')).toHaveCount(0);

    // Even with /studio/today failing (fetch time frozen), the clock moves the slot to "Up now".
    k.setToday(503);
    await page.clock.fastForward(2 * MIN);
    await expect(page.getByTestId('studio-up-now')).toHaveText('Up now · nobody timed in', { timeout: 10_000 });
    await expect(page.getByText('Morning Signal').first()).toBeVisible();
    const rows = page.getByTestId('studio-slot-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.getByTestId('studio-timein')).toHaveCount(2);
  });

  test('W-E12: ENDED_EARLY in its window says "Ended early — time in to restart"; DONE is never Up now', async ({ page }) => {
    const k = await kiosk(page, {
      today: idleToday([show({ id: 'ep-early', status: 'ENDED_EARLY' })]),
      manifest: manifestBody({ status: 'STATION_ROTATION', reason: 'NO_ATTENDANCE', episodeId: null, dj: [] }),
    });
    await page.goto('/studio');
    await expect(page.getByTestId('studio-ended-early')).toHaveText('Ended early — time in to restart');
    await expect(page.getByTestId('studio-schedule-row')).toHaveAttribute('data-status', 'ENDED_EARLY');
    await expect(page.getByTestId('studio-schedule-row')).toContainText('Ended early — time in to restart');
    await expect(page.getByTestId('studio-slot-row').getByTestId('studio-timein')).toHaveCount(2);

    k.setToday(idleToday([show({ id: 'ep-done', status: 'DONE' })]));
    await page.clock.fastForward(15_100);
    await expect(page.getByTestId('studio-ended-early')).toHaveCount(0);
    await expect(page.getByTestId('studio-up-now')).toHaveCount(0);
    await expect(page.getByText('No open episode')).toBeVisible();
  });
});

test.describe('live-path schedule delete guard', () => {
  test('W-E9: deleting a show in overtime surfaces the 409 as an alert; the dialog stays busy while pending', async ({ page }) => {
    const now = new Date().toISOString();
    await page.route('**/api/auth/get-session', (route) =>
      json(route, {
        session: { id: 'mod-session', userId: 'mod-user', token: 't', expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: now, updatedAt: now },
        user: { id: 'mod-user', email: 'mod@example.test', name: 'Mod', handle: 'mod', role: 'MODERATOR', emailVerified: true, createdAt: now, updatedAt: now },
      }),
    );
    const show = {
      id: 'overtime-show',
      name: 'Overtime Hour',
      slug: 'overtime-hour',
      description: null,
      cadence: { kind: 'WEEKLY', days: ['MON'], start: '09:00', end: '10:00' },
      createdAt: now,
      updatedAt: now,
      roster: [{ id: 'r-ana', displayName: 'DJ Ana' }],
      hiatusFrom: null,
      hiatusUntil: null,
      hiatusReason: null,
    };
    await page.route('**/api/shows/admin', (route) => json(route, [show]));
    await page.route('**/api/shows/admin/occurrences**', (route) => json(route, []));
    await page.route(/\/api\/roster(\?.*)?$/, (route) =>
      json(route, [{ id: 'r-ana', displayName: 'DJ Ana', bio: null, photoUrl: null, isActive: true, createdAt: now }]),
    );
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let deletes = 0;
    await page.route('**/api/shows/overtime-show', async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      deletes += 1;
      await held;
      return json(route, { statusCode: 409, message: 'SHOW_AIRING: Overtime Hour is still on air (overtime) — end the episode before deleting the show.' }, 409);
    });

    await page.goto('/mod/schedule');
    await page.getByTestId('mod-schedule-cell').filter({ hasText: 'Overtime Hour' }).click();
    await page.getByTestId('show-delete').click();
    await page.getByTestId('show-delete-confirm-confirm').click();
    await expect.poll(() => deletes).toBe(1);
    // While the delete is in flight the edit dialog is busy: no saving over it.
    await expect(page.getByTestId('show-save')).toBeDisabled();
    await expect(page.getByTestId('show-delete')).toBeDisabled();

    release();
    await expect(appAlerts(page)).toHaveText('Overtime Hour is still on air (overtime) — end the episode before deleting the show.');
    await expect(page.getByTestId('show-save')).toBeEnabled();
    await expect(page.getByTestId('show-delete')).toBeEnabled();
  });
});
