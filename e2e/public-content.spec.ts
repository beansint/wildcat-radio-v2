import { expect, request as pwRequest, test, type APIRequestContext } from '@playwright/test';
import { attachConsoleGuard } from './_console';
import {
  API_BASE,
  WEB_BASE,
  apiLoginAs,
  archiveAnnouncement,
  cleanupAnnouncements,
  cleanupRoster,
  createAnnouncement,
  createEpisodeViaStudio,
  createPublishedAnnouncement,
  createRosterEntry,
  createShow,
  deleteShow,
  loginAs,
  pinAnnouncement,
  resetPins,
  reviewAnnouncement,
  setRosterActive,
  submitAnnouncement,
  type AnnouncementStaff,
  type Show,
} from './_fixtures';

// FE#9 public content pages (`/announcements`, `/announcements/[ref]`, `/shows`,
// `/shows/[slug]`, `/djs`, `/djs/[id]`, `/charts`). Case IDs are transcribed
// from `.agent/test-suites/fe-m5-public-content/public/{contract,integration,e2e}.md`
// and `docs/features/07-fe9-public-content/qa-plan.md` — none reverse-engineered
// from the (not-yet-written) page implementations. Every page under test is
// expected to 404/not-exist at authoring time (RED); a failure here for
// "page/testid not found" is the correct, expected failure mode.

// ── Fixtures (created via the real API in beforeAll, cleaned FK-safe in afterAll) ──

let modApi: APIRequestContext;
let anonApi: APIRequestContext;

let pinnedPublished: AnnouncementStaff;
let draftAnnouncement: AnnouncementStaff;
let rejectedAnnouncement: AnnouncementStaff;
let archivedAnnouncement: AnnouncementStaff;

let activeDjA: { id: string; displayName: string };
let activeDjB: { id: string; displayName: string };
let inactiveDj: { id: string; displayName: string };
let show: Show;

const createdAnnouncementIds: string[] = [];
const createdRosterIds: string[] = [];

test.beforeAll(async () => {
  modApi = await apiLoginAs('moderator');
  anonApi = await pwRequest.newContext({ baseURL: API_BASE });

  // Release any pins left behind by an earlier run/file — the cap is global,
  // so a leaked pin would make this file's fixture setup fail spuriously.
  await resetPins(modApi);

  pinnedPublished = await createPublishedAnnouncement(modApi, {
    title: `E2E FE9 Pinned Published ${Date.now()}`,
  });
  createdAnnouncementIds.push(pinnedPublished.id);
  await pinAnnouncement(modApi, pinnedPublished.id, true);

  draftAnnouncement = await createAnnouncement(modApi, { title: `E2E FE9 Draft ${Date.now()}` });
  createdAnnouncementIds.push(draftAnnouncement.id);

  const toReject = await createAnnouncement(modApi, { title: `E2E FE9 ToReject ${Date.now()}` });
  createdAnnouncementIds.push(toReject.id);
  await submitAnnouncement(modApi, toReject.id);
  rejectedAnnouncement = await reviewAnnouncement(modApi, toReject.id, 'REJECT', {
    rejectionReason: 'Fixture rejection reason — not for public consumption.',
  });

  const toArchive = await createAnnouncement(modApi, { title: `E2E FE9 ToArchive ${Date.now()}` });
  createdAnnouncementIds.push(toArchive.id);
  archivedAnnouncement = await archiveAnnouncement(modApi, toArchive.id);

  activeDjA = await createRosterEntry(modApi, { displayName: `E2E FE9 Active DJ A ${Date.now()}` });
  createdRosterIds.push(activeDjA.id);
  activeDjB = await createRosterEntry(modApi, { displayName: `E2E FE9 Active DJ B ${Date.now()}` });
  createdRosterIds.push(activeDjB.id);
  const toDeactivate = await createRosterEntry(modApi, { displayName: `E2E FE9 Inactive DJ ${Date.now()}` });
  createdRosterIds.push(toDeactivate.id);
  inactiveDj = await setRosterActive(modApi, toDeactivate.id, false);

  show = await createShow(modApi, [activeDjA.id, activeDjB.id], { name: `E2E FE9 Show ${Date.now()}` });

  // Best-effort — episodes are a side effect of the studio time-in/out flow
  // (no direct "create episode" REST route documented). If the station
  // token isn't configured in this environment, the show/DJ pages still
  // exist and render their own empty episode sections; only the
  // upcoming/recent episode assertions in PUB-E-03/PUB-C-04 depend on this.
  await createEpisodeViaStudio(anonApi, activeDjA.id, { close: true }).catch(() => undefined);
});

test.afterAll(async () => {
  await cleanupAnnouncements(modApi, createdAnnouncementIds);
  if (show) await deleteShow(modApi, show.id).catch(() => undefined);
  await cleanupRoster(modApi, createdRosterIds);

  // Assert nothing leaked: every fixture announcement is ARCHIVED (the API
  // has no hard-delete route for announcements — see e2e/_fixtures.ts), the
  // show is gone, and every fixture DJ is inactive. Guarded with `show`
  // truthiness — if `beforeAll` itself failed partway (e.g. a shared-resource
  // conflict on the live dev DB), this still cleans up whatever *was*
  // created instead of throwing on an undefined fixture.
  for (const id of createdAnnouncementIds) {
    const res = await modApi.get(`/api/announcements/admin/${id}`);
    expect(res.ok(), `fixture announcement ${id} should still be readable (archived, not deleted)`).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ARCHIVED');
  }
  if (show) {
    const showRes = await modApi.get(`/api/shows/${show.slug}`);
    expect(showRes.status(), 'fixture show should have been hard-deleted').toBe(404);
  }

  await modApi.dispose();
  await anonApi.dispose();
});

// ── Contract tier — Playwright `request` context, no browser ──────────────

test.describe('@contract', () => {
  test('PUB-C-01: GET /api/announcements shape and ordering', async () => {
    const res = await anonApi.get('/api/announcements');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('page');
    expect(body).toHaveProperty('pageSize');
    expect(Array.isArray(body.items)).toBe(true);

    const pinnedIndex = body.items.findIndex((item: { id: string }) => item.id === pinnedPublished.id);
    expect(pinnedIndex, 'pinned fixture announcement should be present').toBeGreaterThanOrEqual(0);
    expect(pinnedIndex, 'pinned item should be first').toBe(0);

    const item = body.items[0];
    expect(Object.keys(item).sort()).toEqual(
      // `slug`/`publicId` are the readable-address fields (AC-C9). Still no
      // moderator identity of any kind — that's what this assertion guards.
      ['content', 'id', 'isPinned', 'photos', 'publicId', 'publishedAt', 'slug', 'title'].sort(),
    );
  });

  test('PUB-C-02: publishing makes a row appear publicly, pinning moves it to position 1', async () => {
    const created = await createAnnouncement(modApi, { title: `E2E FE9 PubC02 ${Date.now()}` });
    createdAnnouncementIds.push(created.id);
    await submitAnnouncement(modApi, created.id);
    await reviewAnnouncement(modApi, created.id, 'PUBLISH');

    const listed = await anonApi.get('/api/announcements');
    const body = await listed.json();
    expect(body.items.some((item: { id: string }) => item.id === created.id)).toBe(true);

    await pinAnnouncement(modApi, created.id, true);
    const relisted = await anonApi.get('/api/announcements');
    const relistedBody = await relisted.json();
    expect(relistedBody.items[0].id).toBe(created.id);
    await pinAnnouncement(modApi, created.id, false); // free the pin slot for other fixtures/tests.
  });

  test('PUB-C-03: DRAFT, REJECTED, ARCHIVED and a random id all 404 identically', async () => {
    const ids = [draftAnnouncement.id, rejectedAnnouncement.id, archivedAnnouncement.id, 'not-a-real-cuid'];
    const bodies: unknown[] = [];
    for (const id of ids) {
      const res = await anonApi.get(`/api/announcements/${id}`);
      expect(res.status(), `id ${id} should 404, never 403`).toBe(404);
      bodies.push(await res.json().catch(() => null));
    }
    const shapes = bodies.map((body) => (body && typeof body === 'object' ? Object.keys(body).sort() : body));
    expect(new Set(shapes.map((shape) => JSON.stringify(shape))).size).toBe(1);
  });

  test('PUB-C-04: show + episodes shape; unknown slug 404s both', async () => {
    const showRes = await anonApi.get(`/api/shows/${show.slug}`);
    expect(showRes.status()).toBe(200);
    const showBody = await showRes.json();
    // `cadenceLabel` and `airtimeLabel` are the Tier-1 additions from BE#62
    // (ruling 6) — the show page rendered placeholder chips without them. This
    // exact-key assertion is the contract guard, so it is updated deliberately
    // rather than loosened to a subset check.
    expect(Object.keys(showBody).sort()).toEqual(
      [
        'airtimeLabel',
        'cadenceLabel',
        'coverImage',
        'description',
        'id',
        'name',
        'roster',
        'slug',
        'tags',
        'theme',
      ].sort(),
    );
    for (const rosterEntry of showBody.roster) {
      expect(Object.keys(rosterEntry).sort()).toEqual(['id', 'displayName', 'photoUrl'].sort());
    }

    const episodesRes = await anonApi.get(`/api/shows/${show.slug}/episodes`);
    expect(episodesRes.status()).toBe(200);
    const episodesBody = await episodesRes.json();
    expect(episodesBody).toHaveProperty('upcoming');
    expect(episodesBody).toHaveProperty('recent');

    const unknownShow = await anonApi.get('/api/shows/definitely-not-a-show-slug');
    expect(unknownShow.status()).toBe(404);
    const unknownEpisodes = await anonApi.get('/api/shows/definitely-not-a-show-slug/episodes');
    expect(unknownEpisodes.status()).toBe(404);
  });

  test('PUB-C-05: public shows + DJs lists, roster deactivation disappears from the next read', async () => {
    const showsRes = await anonApi.get('/api/shows');
    expect(showsRes.status()).toBe(200);
    const showsBody = await showsRes.json();
    const names = showsBody.map((entry: { name: string }) => entry.name);
    // Compare with the default sort, not `localeCompare`: the list is ordered by
    // Postgres, which puts every uppercase initial before any lowercase one,
    // and default JS sort is the same code-unit order. `localeCompare` folds
    // case, so it disagreed as soon as one show name began lowercase — the
    // assertion was describing an ordering the API never promised.
    expect([...names]).toEqual([...names].sort());

    const djsRes = await anonApi.get('/api/djs');
    expect(djsRes.status()).toBe(200);
    const djsBody = await djsRes.json();
    expect(djsBody.some((dj: { id: string }) => dj.id === inactiveDj.id)).toBe(false);
    expect(djsBody.some((dj: { id: string }) => dj.id === activeDjA.id)).toBe(true);
    for (const dj of djsBody) {
      expect(dj).not.toHaveProperty('linkedAccountId');
    }

    // Flip an active DJ inactive, confirm it disappears, then restore it —
    // this specific roster row is otherwise cleaned up (deactivated) in afterAll anyway.
    await setRosterActive(modApi, activeDjB.id, false);
    const afterDeactivate = await anonApi.get('/api/djs');
    const afterDeactivateBody = await afterDeactivate.json();
    expect(afterDeactivateBody.some((dj: { id: string }) => dj.id === activeDjB.id)).toBe(false);
    await setRosterActive(modApi, activeDjB.id, true);
  });

  // GATED: the per-minute public-read throttle is relaxed 200x under
  // NODE_ENV=test on the API (Slice B AC-B2), and the `request` context has
  // no route-interception mechanism (that's browser-only) to fake a 429
  // deterministically. Brute-forcing hundreds of real requests against a
  // shared dev DB is not a reliable, fast, or polite way to prove this.
  test.skip(
    'PUB-C-06: public reads are throttled — GET /api/announcements returns 429 past its window',
    async () => {
      // Intentionally not implemented — see GATED comment above.
    },
  );

  test('PUB-C-07: chart shape is safe before any compute has run', async () => {
    const res = await anonApi.get('/api/charts/current');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('weekOf');
    expect(Array.isArray(body.entries)).toBe(true);
    for (const entry of body.entries) {
      expect(Object.keys(entry).sort()).toEqual(['count', 'title'].sort());
    }
  });
});

// ── Integration + E2E tier — real browser ──────────────────────────────────

test('PUB-I-01: the page renders what the API returned, not a cached mock', async ({ page }) => {
  const guard = attachConsoleGuard(page);
  const unique = await createPublishedAnnouncement(modApi, { title: `E2E FE9 Unique Title ${Date.now()}` });
  createdAnnouncementIds.push(unique.id);

  await page.goto(`${WEB_BASE}/announcements`);
  await expect(page.getByTestId('public-announcements-list')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(unique.title as string)).toBeVisible({ timeout: 10_000 });

  guard.assertClean();
});

test('PUB-I-02: landing sections are live (featured, most requested, shows grid)', async ({ page }) => {
  const guard = attachConsoleGuard(page);

  await page.goto(`${WEB_BASE}/`);
  await expect(page.getByText(pinnedPublished.title as string)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(show.name)).toBeVisible({ timeout: 10_000 });

  guard.assertClean();
});

test('PUB-I-03: no auth required on any of the seven public routes + /schedule', async ({ browser }) => {
  const context = await browser.newContext(); // fresh context — zero cookies.
  const page = await context.newPage();
  const routes = [
    '/announcements',
    `/announcements/${pinnedPublished.slug}-${pinnedPublished.publicId}`,
    '/shows',
    `/shows/${show.slug}`,
    '/djs',
    `/djs/${activeDjA.id}`,
    '/charts',
    '/schedule',
  ];
  for (const route of routes) {
    await page.goto(`${WEB_BASE}${route}`);
    await expect(page, `${route} should not redirect to /login`).not.toHaveURL(/\/login/);
  }
  await context.close();
});

test('PUB-I-04: the global player keeps playing across public navigations', async ({ page }) => {
  await page.goto(`${WEB_BASE}/`);
  // Pre-existing player testids (see e2e/stream-playback.spec.ts): the
  // status pill flips to LIVE once playback is confirmed; play starts it.
  const status = page.getByTestId('player-status');
  const playButton = page.getByTestId('player-play');
  // FIX (was a genuinely wrong assertion, not a page bug): this test already
  // has a graceful "stream wasn't LIVE in this environment" skip path below,
  // but guarded the click on visibility alone. When no stream is actually
  // live the button renders visible-but-disabled (see global-player.tsx) and
  // stays that way — Playwright's `.click()` then waits the full test
  // timeout for it to become actionable instead of failing fast, which
  // defeats the very skip path this test was written to fall back to.
  // Guarding on both visible and enabled restores that intent.
  if (
    (await playButton.isVisible().catch(() => false)) &&
    (await playButton.isEnabled().catch(() => false))
  ) {
    await playButton.click();
  }
  const wasLive = await status
    .filter({ hasText: 'LIVE' })
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!wasLive) {
    test.info().annotations.push({
      type: 'note',
      description: 'stream was not LIVE in this environment; skipping the cross-navigation persistence assertion body.',
    });
    return;
  }
  await page.goto(`${WEB_BASE}/announcements`);
  await expect(status).toContainText('LIVE', { timeout: 10_000 });
  await page.goto(`${WEB_BASE}/charts`);
  await expect(status).toContainText('LIVE', { timeout: 10_000 });
});

test('PUB-I-05: staff dark mode never leaks onto a public page', async ({ page }) => {
  // This case has to actually TURN DARK MODE ON before it can prove dark mode
  // doesn't leak. It previously visited /mod with no session, was redirected to
  // /login, found no theme toggle, and fell through its best-effort `if` — so
  // the final assertion passed no matter what the app did.
  await loginAs(page, 'moderator');
  // `/mod` is not a route — only its children are — so navigating there landed
  // on a 404 with no staff chrome and therefore no theme toggle.
  await page.goto(`${WEB_BASE}/mod/queue`);
  const toggle = page.getByTestId('mod-nav-theme-toggle');
  await expect(toggle, 'staff theme toggle should exist — the leak test is meaningless without it').toBeVisible();

  // Flip until the staff shell is genuinely dark, so the precondition is
  // established rather than assumed.
  for (let i = 0; i < 2; i += 1) {
    const cls = (await page.locator('html').getAttribute('class')) ?? '';
    if (/\bdark\b/.test(cls)) break;
    await toggle.click();
  }
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  await page.goto(`${WEB_BASE}/announcements`);
  const htmlClass = await page.locator('html').getAttribute('class');
  expect(htmlClass ?? '', 'public pages must stay light even when staff chose dark').not.toMatch(/\bdark\b/);
});

test('PUB-I-06: 375x812 responsive — no horizontal scroll on any new public page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const route of ['/announcements', '/shows', '/djs', '/charts']) {
    await page.goto(`${WEB_BASE}${route}`);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth, `${route} should not scroll horizontally at 375px`).toBeLessThanOrEqual(clientWidth + 1);
  }
});

test('PUB-E-01: golden path — news discovery, publish appears public and pinned first', async ({ page }) => {
  const guard = attachConsoleGuard(page);

  await page.goto(`${WEB_BASE}/`);
  await expect(page.getByText(pinnedPublished.title as string)).toBeVisible({ timeout: 10_000 });

  const allNewsLink = page.getByRole('link', { name: /all news/i });
  await allNewsLink.click();
  await expect(page).toHaveURL(/\/announcements$/);

  const list = page.getByTestId('public-announcements-list');
  await expect(list).toBeVisible({ timeout: 10_000 });
  const cards = page.getByTestId('public-announcement-card');
  await expect(cards.first()).toContainText(pinnedPublished.title as string);

  await cards.first().click();
  // AC-11: the address is the readable `<slug>-<publicId>`, never the bare cuid.
  await expect(page).toHaveURL(
    new RegExp(`/announcements/${pinnedPublished.slug}-${pinnedPublished.publicId}$`),
  );
  await expect(page.getByTestId('public-announcement-body')).toBeVisible({ timeout: 10_000 });

  // INV-1 — no moderator identity anywhere on this public detail page.
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toMatch(/@mod\b|@custodian\b/i);
  expect(bodyText.toLowerCase()).not.toContain('mod@example.com');

  const backLink = page.getByRole('link', { name: /back|announcements/i });
  await backLink.first().click();
  await expect(page).toHaveURL(/\/announcements$/);

  guard.assertClean();
});

test('PUB-E-02: edge — unpublished (DRAFT) detail renders not-found, no title leak', async ({ page }) => {
  await page.goto(
    `${WEB_BASE}/announcements/${draftAnnouncement.slug}-${draftAnnouncement.publicId}`,
  );
  await expect(page.getByTestId('public-announcement-body')).toHaveCount(0);
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain(draftAnnouncement.title as string);
});

test('PUB-E-02b: a STALE slug still resolves and the address self-heals to canonical (AC-11)', async ({
  page,
}) => {
  const canonical = `${pinnedPublished.slug}-${pinnedPublished.publicId}`;
  // Simulates a link shared before someone fixed a typo in the title.
  await page.goto(`${WEB_BASE}/announcements/totally-stale-slug-${pinnedPublished.publicId}`);

  await expect(page.getByTestId('public-announcement-body')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('public-not-found')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/announcements/${canonical}$`), { timeout: 10_000 });
});

test('PUB-E-02c: an old bare-cuid link still resolves and upgrades to the readable address (AC-11)', async ({
  page,
}) => {
  const canonical = `${pinnedPublished.slug}-${pinnedPublished.publicId}`;
  await page.goto(`${WEB_BASE}/announcements/${pinnedPublished.id}`);

  await expect(page.getByTestId('public-announcement-body')).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(new RegExp(`/announcements/${canonical}$`), { timeout: 10_000 });
});

test('PUB-E-03: shows index lists shows; detail shows description, lineup, episode sections', async ({ page }) => {
  await page.goto(`${WEB_BASE}/shows`);
  await expect(page.getByTestId('public-shows-list')).toBeVisible({ timeout: 10_000 });
  const cards = page.getByTestId('public-show-card');
  await expect(cards.filter({ hasText: show.name })).toHaveCount(1);

  await page.goto(`${WEB_BASE}/shows/${show.slug}`);
  // Scope to the heading: FE#37 gave this route real metadata, so the show name
  // is now also the document <title> and a page-wide getByText matches both.
  await expect(page.getByRole('heading', { name: show.name })).toBeVisible({ timeout: 10_000 });
  // FE#44 restored a "Hosted by <DJ>" byline in the hero, which duplicates
  // the same display name already rendered in the Lineup grid below — a
  // page-wide `getByText(displayName)` now resolves two elements and trips
  // Playwright's strict mode. Scope this assertion to the Lineup section
  // specifically, which is what it actually means to verify.
  await expect(
    page.getByTestId('public-show-lineup').getByText(activeDjA.displayName),
  ).toBeVisible({ timeout: 10_000 });
});

test('FE#44: show detail hero has the CTA row, hosted-by byline, and cadence/airtime chips when present', async ({
  page,
}) => {
  await page.goto(`${WEB_BASE}/shows/${show.slug}`);
  const main = page.locator('main');
  await expect(main.getByText(show.name)).toBeVisible({ timeout: 10_000 });

  // CTA row — both point at /listen, scoped to <main> so the top-nav/global
  // player's own "Listen live" link (present on every page) can't false-pass
  // this assertion.
  await expect(main.getByRole('link', { name: /listen live/i })).toBeVisible();
  await expect(main.getByRole('link', { name: /join the chat/i })).toBeVisible();

  // Hosted-by byline: both roster DJs, linked to their profile. The same
  // href also appears in the Lineup grid further down, so assert on the
  // href directly rather than a name-scoped role locator (which would hit
  // the same strict-mode collision PUB-E-03 had).
  await expect(main.getByText(/hosted by/i)).toBeVisible();
  await expect(main.locator(`a[href="/djs/${activeDjA.id}"]`).first()).toBeVisible();

  // cadence/airtime chips — the fixture show is created with a WEEKLY
  // Mon/Wed/Fri 13:00-16:00 cadence (`createShow` in `_fixtures.ts`), which
  // the backend's `formatCadence` renders as "Airs Mon, Wed, Fri" (not a
  // contiguous run) and "1:00–4:00 PM" — assert those exact labels rather
  // than just presence, so a formatting regression on either side shows up.
  await expect(main.getByText('Airs Mon, Wed, Fri')).toBeVisible();
  await expect(main.getByText('1:00–4:00 PM')).toBeVisible();
});

test('PUB-E-04: DJs index lists only active DJs; inactive DJ id 404s directly', async ({ page }) => {
  await page.goto(`${WEB_BASE}/djs`);
  await expect(page.getByTestId('public-djs-list')).toBeVisible({ timeout: 10_000 });
  const cards = page.getByTestId('public-dj-card');
  await expect(cards.filter({ hasText: activeDjA.displayName })).toHaveCount(1);
  await expect(cards.filter({ hasText: inactiveDj.displayName })).toHaveCount(0);

  await page.goto(`${WEB_BASE}/djs/${activeDjA.id}`);
  // FE#45's "All DJs" rail also renders every sibling's display name
  // (including the active DJ's own chip), so a page-wide `getByText` is no
  // longer unique here — assert on the profile `<h1>` specifically.
  await expect(page.getByRole('heading', { level: 1, name: activeDjA.displayName })).toBeVisible({
    timeout: 10_000,
  });

  await page.goto(`${WEB_BASE}/djs/${inactiveDj.id}`);
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain(inactiveDj.displayName);
});

test('FE#45: DJ profile "All DJs" rail lists siblings and marks the current DJ active', async ({ page }) => {
  await page.goto(`${WEB_BASE}/djs/${activeDjA.id}`);
  const rail = page.getByRole('navigation', { name: 'All DJs' });
  await expect(rail).toBeVisible({ timeout: 10_000 });

  // Both fixture DJs are on the same show's roster, so both are siblings in
  // the rail; activeDjB (not the page's own DJ) should appear as a plain
  // link, activeDjA (the page's own DJ) should be marked current.
  const siblingLink = rail.locator(`a[href="/djs/${activeDjB.id}"]`);
  await expect(siblingLink).toBeVisible();
  await expect(siblingLink).not.toHaveClass(/active/);

  const currentLink = rail.locator(`a[href="/djs/${activeDjA.id}"]`);
  await expect(currentLink).toBeVisible();
  await expect(currentLink).toHaveClass(/active/);
  await expect(currentLink).toHaveAttribute('aria-current', 'page');
});

test('PUB-E-05: edge — unknown show slug renders not-found, episode sections absent', async ({ page }) => {
  await page.goto(`${WEB_BASE}/shows/definitely-not-a-show`);
  await expect(page.getByTestId('public-empty')).toHaveCount(0); // this is not-found, not an empty-collection state.
  const bodyText = await page.locator('body').innerText();
  expect(bodyText.toLowerCase()).not.toContain('upcoming');
  expect(bodyText.toLowerCase()).not.toContain('recent episodes');
});

test('PUB-E-06: edge — empty chart renders empty state with week label, no spinner', async ({ page }) => {
  await page.goto(`${WEB_BASE}/charts`);
  const rows = page.getByTestId('public-chart-rows');
  const emptyState = page.getByTestId('public-empty');
  // Deterministic only if no snapshot has been computed for the current
  // week in this environment (no API exists to seed/clear chart snapshots —
  // see e2e/_fixtures.ts). If a snapshot already exists, this assertion is
  // the honest alternate branch rather than a false pass.
  //
  // FIX (was a genuinely wrong assertion, not a page bug): `locator.isVisible({ timeout })`
  // does not wait — the `timeout` option is deprecated and ignored by Playwright
  // (it "does not wait for the element to become visible and returns immediately").
  // The original `if (await emptyState.isVisible({ timeout: 5_000 })...)` therefore
  // sampled visibility the instant `goto` resolved, before the client had fetched
  // `/api/charts/current` and rendered either state, so it always fell into the
  // `else` branch and then waited 10s for `rows` — which never appears when the
  // real state is empty. Replaced with an actual wait for whichever testid the
  // page settles into, then asserting on that one.
  await Promise.race([
    emptyState.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined),
    rows.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined),
  ]);
  if (await emptyState.isVisible()) {
    await expect(emptyState).toBeVisible();
  } else {
    await expect(rows).toBeVisible({ timeout: 10_000 });
  }
});

test('PUB-E-07: edge — rate limited read shows the retry card, retry re-issues successfully', async ({ page }) => {
  let intercepted = false;
  await page.route('**/api/announcements**', async (route) => {
    if (!intercepted && route.request().method() === 'GET') {
      intercepted = true;
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 429, message: 'Too Many Requests' }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto(`${WEB_BASE}/announcements`);
  await expect(page.getByTestId('public-rate-limited')).toBeVisible({ timeout: 10_000 });

  await page.getByTestId('public-retry').click();
  await expect(page.getByTestId('public-announcements-list')).toBeVisible({ timeout: 10_000 });
});

test('PUB-E-08: cross-links resolve — show -> DJ, DJ -> show, schedule -> show', async ({ page }) => {
  await page.goto(`${WEB_BASE}/shows/${show.slug}`);
  // FE#44's "Hosted by" byline links to the same DJ as the Lineup grid
  // card below it — both resolve `activeDjA.displayName` as a link name, so
  // `.first()` (rather than a bare strict-mode locator) is required here.
  const djLink = page.getByRole('link', { name: new RegExp(activeDjA.displayName) }).first();
  await expect(djLink).not.toHaveAttribute('href', '#');
  await djLink.click();
  await expect(page).toHaveURL(new RegExp(`/djs/${activeDjA.id}$`));

  await page.goto(`${WEB_BASE}/djs/${activeDjA.id}`);
  // FE#45's "All DJs" rail can also surface `show.name` — as the current
  // DJ's `currentShow` subtitle on their own (active) rail chip — alongside
  // the "Shows" list link this assertion actually means to test. Scope to
  // the Shows list testid to avoid the same strict-mode collision.
  const showLink = page.getByTestId('public-dj-shows').getByRole('link', { name: new RegExp(show.name) });
  await expect(showLink).not.toHaveAttribute('href', '#');
  await showLink.click();
  await expect(page).toHaveURL(new RegExp(`/shows/${show.slug}$`));

  await page.goto(`${WEB_BASE}/schedule`);
  const scheduleShowLink = page.getByRole('link', { name: new RegExp(show.name) });
  if (await scheduleShowLink.first().isVisible().catch(() => false)) {
    await scheduleShowLink.first().click();
    await expect(page).toHaveURL(new RegExp(`/shows/${show.slug}$`));
  }
});

test('PUB-E-09: a11y — keyboard traverse reaches every interactive element in order, headings are structured', async ({
  page,
}) => {
  for (const route of ['/announcements', '/shows', '/djs', '/charts']) {
    await page.goto(`${WEB_BASE}${route}`);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);

    await page.keyboard.press('Tab');
    // `toBeTruthy()` on a tagName could never fail — with nothing focusable,
    // activeElement is <body>, whose tagName is the truthy string "BODY".
    // Assert that focus actually landed on something interactive.
    const firstFocused = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']).toContain(firstFocused);

    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('Tab');
    }
    const focusedAfterTabs = page.locator(':focus');
    await expect(focusedAfterTabs).toBeVisible();
  }
});
