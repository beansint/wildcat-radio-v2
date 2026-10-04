import { test, expect } from '@playwright/test';
const show = (id: string, name: string, start = '19:00', end = '22:00') => ({ id, name, slug: id, start, end, roster: ['DJ Vince'] });

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/stream/manifest')
      ? { status: 'LIVE', reason: null, type: 'hls', url: '/test.m3u8', dj: ['DJ Vince'], episodeId: 'episode', showId: 'night', showName: 'Night Shift' }
      : path.endsWith('/schedule/today') ? { date: '2026-10-04', occurrences: [] }
      : path.endsWith('/schedule') ? { days: [{ day: 'MON', shows: [show('night', 'Night Shift'), show('other', 'Second Show'), show('minute', 'Minute Show', '22:48', '23:05')] }, { day: 'TUE', shows: [show('short', 'Short Show', '20:00', '21:00')] }] }
      : path.includes('/snapshot') ? { episodeId: 'episode', capturedAt: new Date().toISOString(), recentChat: [], polls: [], pinnedTopic: null, reactions: [], upNext: [] }
      : path.includes('/auth/get-session') ? null : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
});

test('desktop schedule retains duplicate shows and precise time labels', async ({ page }, info) => {
  await page.goto('/schedule');
  await expect(page.getByRole('link', { name: /Night Shift/ }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Second Show/ }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: '10:48–11:05 PM', exact: true })).toBeVisible();
  const link = page.getByRole('link', { name: /Second Show/ }).first();
  await link.focus();
  await expect(link).toBeFocused();
  await page.screenshot({ path: info.outputPath('schedule-desktop.png'), fullPage: true });
});

test('mobile schedule shows both programs without rotation inside them', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/schedule');
  await page.getByRole('tab', { name: /Mon/i }).click();
  await expect(page.getByRole('link', { name: /Night Shift/ }).last()).toBeVisible();
  await expect(page.getByRole('link', { name: /Second Show/ }).last()).toBeVisible();
  await expect(page.getByRole('tabpanel').getByText('8–9 PM', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('schedule-mobile.png'), fullPage: true });
});

test('listen reflects actual show name and loses it when off air', async ({ page }, info) => {
  await page.goto('/listen');
  await expect(page.getByRole('heading', { name: 'Night Shift', exact: true })).toBeVisible();
  await expect(page.getByTestId('now-playing')).toHaveText('Night Shift');
  await page.getByRole('button', { name: 'Play live stream', exact: true }).first().focus();
  await expect(page.getByRole('button', { name: 'Play live stream', exact: true }).first()).toBeFocused();
  await page.screenshot({ path: info.outputPath('listen-show-name.png'), fullPage: true });
  await page.route('**/api/stream/manifest', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'OFF_AIR', reason: 'PUBLICATION_STALE', type: 'hls', url: null, dj: [], episodeId: null, showId: null, showName: null }) }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Off air', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Night Shift', exact: true })).toHaveCount(0);
});

test('Studio drops its cached episode and queue when the broadcast closes', async ({ page }) => {
  let closed = false;
  await page.clock.install();
  await page.route('**/api/studio/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/session') ? { active: true }
      : path.endsWith('/today') ? { episode: closed ? null : { id: 'studio-old', status: 'LIVE', showId: 'night', unscheduled: false, startedAt: new Date().toISOString(), endedAt: null }, attendees: [], slotRoster: [], todayShows: [], pendingHandover: null }
      : path.endsWith('/queue') ? { episodeId: 'studio-old', showName: 'Previous Show', status: 'LIVE', items: [] }
      : [];
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/studio');
  await page.getByRole('tab', { name: 'Console', exact: true }).click();
  await expect(page.getByText('Previous Show', { exact: false })).toBeVisible();
  closed = true;
  await page.clock.runFor(16_000);
  await expect(page.getByText('Previous Show', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Episode not active', { exact: true })).toBeVisible();
});

test('staff sees legacy overlaps and a rejected edit stays reviewable', async ({ page }, info) => {
  await page.setViewportSize({ width: 1952, height: 1020 });
  await page.route('**/api/auth/get-session', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ session: { id: 'fixture-session', expiresAt: new Date(Date.now() + 3600_000).toISOString() }, user: { id: 'fixture-staff', name: 'Fixture Staff', email: 'fixture@example.test', role: 'MODERATOR', emailVerified: true } }) }));
  const staffShow = (id: string, name: string) => ({ id, name, slug: id, description: null, cadence: { kind: 'WEEKLY', days: ['WED'], start: '19:00', end: '22:00' }, roster: [{ id: 'dj', displayName: 'DJ Vince' }], hiatusFrom: null, hiatusUntil: null, hiatusReason: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await page.route('**/api/shows/admin', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([staffShow('night', 'Night Shift'), staffShow('second', 'Second Show')]) }));
  await page.route('**/api/roster**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ id: 'dj', displayName: 'DJ Vince', isActive: true }]) }));
  await page.route('**/api/shows/night', route => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'SCHEDULE_CONFLICT: overlaps "Second Show" (19:00-22:00). Choose a different day or time.' }) }));
  await page.goto('/mod/schedule');
  await expect(page.getByText('Schedule overlaps need attention')).toBeVisible();
  const cell = page.getByTestId('mod-schedule-cell').filter({ hasText: 'Night Shift' });
  await cell.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByTestId('show-save').click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('overlaps "Second Show"');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(cell).toBeFocused();
  await page.screenshot({ path: info.outputPath('staff-overlap-warning.png'), fullPage: true });
});

test('continuing crew explicitly starts the next show while the outgoing show stays active', async ({ page }) => {
  let handedOver = false;
  let handovers = 0;
  const now = new Date().toISOString();
  await page.route('**/api/studio/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/handover')) {
      handovers++;
      expect(route.request().postDataJSON()).toEqual({ rosterId: 'dj' });
      handedOver = true;
    }
    const body = path.endsWith('/session') ? { active: true }
      : path.endsWith('/handover') ? { episodeId: 'next', showId: 'next-show', startedAt: now }
      : path.endsWith('/today') ? {
        episode: { id: handedOver ? 'next' : 'outgoing', showId: handedOver ? 'next-show' : 'old-show', status: 'LIVE', unscheduled: false, startedAt: now, endedAt: null },
        attendees: [{ rosterId: 'dj', displayName: 'DJ Vince', timeIn: now }], slotRoster: [],
        todayShows: [{ id: handedOver ? 'next' : 'outgoing', showId: handedOver ? 'next-show' : 'old-show', showName: handedOver ? 'Next Show' : 'Outgoing Show', status: 'ON_AIR', scheduledFor: now, effectiveStart: now, effectiveEnd: now, djs: ['DJ Vince'] }],
        pendingHandover: handedOver ? null : { episodeId: null, showId: 'next-show', showName: 'Next Show', continuingCrew: true, attendees: [{ rosterId: 'dj', displayName: 'DJ Vince', timeIn: now }] },
      } : path.endsWith('/queue') ? { episodeId: handedOver ? 'next' : 'outgoing', showName: handedOver ? 'Next Show' : 'Outgoing Show', items: [] } : [];
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/studio');
  await expect(page.getByText('Outgoing Show', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start next show', exact: true })).toBeVisible();
  expect(handovers).toBe(0);
  await page.getByRole('button', { name: 'Start next show', exact: true }).click();
  await expect(page.getByTestId('studio-handover-banner')).toHaveCount(0);
  await expect(page.getByText('Next Show', { exact: true }).first()).toBeVisible();
  expect(handovers).toBe(1);
});
