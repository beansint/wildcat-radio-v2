import { expect, test, type Page, type BrowserContext, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { apiLoginAs } from './_fixtures';

import { assertIntegrityCleanup, startIntegrityBroadcast as startLocalBroadcast, api, endBroadcast, episodeRows, localDb, loginIntegrityAs as loginAs, play, seedStaffEpisodes, unlockLiveStudio } from './_broadcast-integrity';

const identityModule = ts.transpileModule(
  readFileSync("src/lib/realtime/episode-browser-id.ts", "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
async function installIdentity(page: Page, noLocks = false, denied = false) {
  await page.goto("/__identity");
  await page.evaluate(
    ({ code, noLocks, denied }) => {
      if (noLocks)
        Object.defineProperty(navigator, "locks", { value: undefined });
      if (denied) {
        Object.defineProperty(window, "localStorage", {
          get() {
            throw Error("storage denied");
          },
        });
        Object.defineProperty(window, "indexedDB", {
          value: {
            open() {
              throw Error("storage denied");
            },
          },
        });
      }
      const moduleExports: Record<string, unknown> = {};
      new Function("exports", code)(moduleExports);
      (window as unknown as { identityModule: unknown }).identityModule =
        moduleExports;
      (window as unknown as { getBrowserId: unknown }).getBrowserId =
        moduleExports.getEpisodeBrowserId;
    },
    { code: identityModule, noLocks, denied },
  );
}
const id = (page: Page, episode: string) =>
  page.evaluate(
    (episode) =>
      (
        window as unknown as { getBrowserId: (e: string) => Promise<string> }
      ).getBrowserId(episode),
    episode,
  );
for (const noLocks of [false, true])
  test(`isolated browser storage: IDs share simultaneous first play across tabs (${noLocks ? "IndexedDB" : "Web Locks"})`, async ({
    context,
  }) => {
    await context.route("**/__identity", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Identity fixture</title>",
      }),
    );
    const first = await context.newPage(),
      second = await context.newPage();
    await Promise.all([
      installIdentity(first, noLocks),
      installIdentity(second, noLocks),
    ]);
    const [a, b] = await Promise.all([
      id(first, "episode-one"),
      id(second, "episode-one"),
    ]);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(b).toBe(a);
    expect(await id(first, "episode-one")).toBe(a);
    expect(await id(first, "episode-two")).not.toBe(a);
  });
test("isolated browser storage: denial keeps only a page-session identity", async ({
  context,
}) => {
  await context.route("**/__identity", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Identity fixture</title>",
    }),
  );
  const a = await context.newPage(),
    b = await context.newPage();
  await Promise.all([
    installIdentity(a, true, true),
    installIdentity(b, true, true),
  ]);
  const one = await id(a, "episode");
  expect(await id(a, "episode")).toBe(one);
  expect(await id(b, "episode")).not.toBe(one);
  expect(
    await a.evaluate(async () => {
      const identityApi = (
        window as unknown as {
          identityModule: {
            getEpisodeBrowserIdentity: (
              id: string,
            ) => Promise<{ id: string; persistent: boolean }>;
            listeningJoinPayload: (
              id: string,
              identity: { id: string; persistent: boolean },
            ) => unknown;
          };
        }
      ).identityModule;
      const identity = await identityApi.getEpisodeBrowserIdentity("episode");
      return {
        persistent: identity.persistent,
        payload: identityApi.listeningJoinPayload("episode", identity),
      };
    }),
  ).toEqual({ persistent: false, payload: { episodeId: "episode" } });
});


test.afterAll(() => assertIntegrityCleanup());

// Integration scenarios below use real API + WS + PostgreSQL. No route interception.
test('AC-2/AC-3 (integrity AC-3): FE-BI-1: real browser reactions persist, hydrate studio bins and decay during quiet ticks', async ({ browser, request, page }) => {
  test.setTimeout(140_000);
  const broadcast = await startLocalBroadcast(request);
  let studioContext: BrowserContext | undefined;
  try {
    studioContext = await browser.newContext();
    const studio = await studioContext.newPage();
    await page.goto('/listen');
    const meter = page.getByTestId('engagement-hype-meter');
    await expect(meter).toHaveAttribute('aria-label', /^0 reactions/);
    const reaction = page.waitForResponse(r => r.url() === api(`episodes/${broadcast.episodeId}/reactions`) && r.request().method() === 'POST');
    await page.getByTestId('engagement-reaction-fire').click();
    expect((await reaction).ok()).toBe(true);
    await expect.poll(() => episodeRows(broadcast.episodeId).reactions).toBe(1);
    await expect(meter).toHaveAttribute('aria-label', /^1 reactions/);
    // A late console must hydrate nonzero history from the real snapshot.
    await unlockLiveStudio(studio, broadcast);
    await expect(studio.getByTestId('studio-hype-count')).toHaveText('1');
    await expect(studio.getByTestId('studio-hype-bars').locator('span')).toHaveCount(12);
    expect(await studio.getByTestId('studio-hype-bars').locator('span').evaluateAll(bars => bars.some(bar => parseFloat((bar as HTMLElement).style.height) > 0))).toBe(true);
    await expect(meter).toHaveAttribute('aria-label', /^0 reactions/, { timeout: 75_000 });
    await expect(studio.getByTestId('studio-hype-count')).toHaveText('0');
    expect(await studio.getByTestId('studio-hype-bars').locator('span').evaluateAll(bars => bars.every(bar => (bar as HTMLElement).style.height === '0%'))).toBe(true);
    expect(episodeRows(broadcast.episodeId).reactions).toBe(1);
  } finally {
    await page.goto('about:blank');
    await studioContext?.close();
    await broadcast.cleanup();
  }
});

test('AC-2/AC-3 (integrity AC-4/AC-5): FE-BI-2/3: real reconnect removes moderated chat and expired pins, ended episode gates writes', async ({ browser, request, page, context }) => {
  test.setTimeout(150_000);
  const broadcast = await startLocalBroadcast(request);
  let studioContext: BrowserContext | undefined;
  let moderator: APIRequestContext | undefined;
  let voterContext: BrowserContext | undefined;
  try {
    studioContext = await browser.newContext();
    const studio = await studioContext.newPage();
    moderator = await apiLoginAs('moderator');
    await unlockLiveStudio(studio, broadcast);
    await page.goto('/listen');
    await expect(page.getByTestId('engagement-hype-meter')).toHaveAttribute('aria-label', /^0 reactions/);
    const message = `Persisted recovery ${broadcast.episodeId}`;
    await studio.getByTestId('studio-chat-input').fill(message);
    await studio.getByTestId('studio-chat-submit').click();
    await expect(page.getByTestId('engagement-chat-feed')).toContainText(message);
    const chat = episodeRows(broadcast.episodeId).chats.find(row => row.content === message)!;
    expect(chat.isHidden).toBe(false);
    const pin = `Timed recovery ${broadcast.episodeId}`;
    const pinned = await broadcast.stationPost('studio/pin', { text: pin, expiresAt: new Date(Date.now()+4000).toISOString(), expiresAtEpisodeEnd: true });
    expect(pinned.ok(), await pinned.text()).toBe(true);
    await expect(page.getByTestId('engagement-pinned-topic')).toContainText(pin);
    const created = await broadcast.stationPost('studio/polls', { question: `Recovery poll ${broadcast.episodeId}`, options: ['First', 'Second'], visibility: 'ANONYMOUS' });
    expect(created.ok(), await created.text()).toBe(true);
    const poll = await created.json();
    await expect(page.getByTestId('engagement-poll')).toContainText('0 votes');
    await expect(studio.getByTestId(`studio-poll-${poll.id}`)).toContainText('0 votes');
    await context.setOffline(true);
    await studioContext.setOffline(true);
    await expect(page.getByTestId('engagement-hype-meter')).toHaveAttribute('aria-label', /unavailable/i, { timeout: 20_000 });
    const hide = await moderator.patch(api(`chat/${chat.id}/hide`));
    expect(hide.ok(), await hide.text()).toBe(true);
    await expect.poll(() => episodeRows(broadcast.episodeId).chats.find(row => row.id === chat.id)?.isHidden).toBe(true);
    voterContext = await browser.newContext();
    const voter = await voterContext.newPage();
    await loginAs(voter, 'listener');
    await voter.goto('/listen');
    await expect(voter.getByTestId('engagement-poll')).toContainText(poll.question);
    await voter.getByTestId('engagement-poll-option').first().click();
    await expect(voter.getByTestId('engagement-poll')).toContainText('1 votes');
    const closed = await broadcast.stationPost(`studio/polls/${poll.id}/close`);
    expect(closed.ok(), await closed.text()).toBe(true);
    expect(localDb<number>(`return p.pollVote.count({where:{pollId:${JSON.stringify(poll.id)}}});`)).toBe(1);
    // The elapsed expiration is authoritative real time, not a fake timer.
    await expect.poll(() => Date.now(), { timeout: 6000 }).toBeGreaterThan(new Date((await pinned.json()).expiresAt).getTime());
    await context.setOffline(false);
    await studioContext.setOffline(false);
    // Focus is the documented background/reconnect recovery trigger.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await studio.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByTestId('engagement-chat-feed')).not.toContainText(message);
    await expect(studio.getByText(message, { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('engagement-pinned-topic')).not.toContainText(pin);
    await expect(page.getByTestId('engagement-poll')).toContainText('Poll closed · 1 votes');
    await expect(page.getByTestId('engagement-poll-option').first()).toBeDisabled();
    await expect(studio.getByTestId(`studio-poll-${poll.id}`)).toContainText('1 votes');
    await expect(studio.getByTestId(`studio-poll-${poll.id}`).getByTestId('studio-poll-close')).toHaveCount(0);
    const firstPin = `Original ${broadcast.episodeId}`;
    await broadcast.stationPost('studio/pin', { text: firstPin, expiresAtEpisodeEnd: true });
    await expect(studio.getByTestId('studio-pinned-topic')).toHaveText(firstPin);
    await context.setOffline(true);
    await studioContext.setOffline(true);
    await broadcast.stationPost('studio/pin', { text: 'Replacement recovery pin', expiresAtEpisodeEnd: true });
    await context.setOffline(false);
    await studioContext.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await studio.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByTestId('engagement-pinned-topic')).toContainText('Replacement recovery pin');
    await expect(studio.getByTestId('studio-pinned-topic')).toHaveText('Replacement recovery pin');
    await context.setOffline(true);
    await studioContext.setOffline(true);
    await broadcast.stationPost('studio/pin', { text: '', expiresAtEpisodeEnd: true });
    await context.setOffline(false);
    await studioContext.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await studio.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByTestId('engagement-pinned-topic')).not.toContainText('Replacement recovery pin');
    await expect(studio.getByTestId('studio-pinned-topic')).toHaveCount(0);
    await endBroadcast(broadcast);
    await expect.poll(() => episodeRows(broadcast.episodeId).endedAt).not.toBeNull();
    await expect(page.getByTestId('engagement-reaction-fire')).toHaveCount(0, { timeout: 20_000 });
    const late = await request.post(api(`episodes/${broadcast.episodeId}/reactions`), { data: { emoji: '🔥' } });
    expect(late.status()).toBeGreaterThanOrEqual(400);
    expect(episodeRows(broadcast.episodeId).reactions).toBe(0);
  } finally {
    await context.setOffline(false);
    await page.goto('about:blank');
    await studioContext?.close();
    await voterContext?.close();
    await moderator?.dispose();
    await broadcast.cleanup();
  }
});

test('AC-2 (integrity AC-6): FE-BI-4: real playing tabs and reload share only their current episode browser identity', async ({ context, request, page }) => {
  test.setTimeout(120_000);
  let broadcast = await startLocalBroadcast(request);
  let second: Page | undefined;
  let firstIdentity = '';
  try {
    await page.goto('/listen');
    await play(page);
    second = await context.newPage();
    await second.goto('/listen');
    await play(second);
    await expect.poll(() => episodeRows(broadcast.episodeId).sessions.filter(s => s.endedAt === null).length).toBe(2);
    let rows = episodeRows(broadcast.episodeId).sessions;
    expect(new Set(rows.map(s => s.anonId)).size).toBe(1);
    expect(rows.every(s => s.identityQuality === 'episode-browser-v1')).toBe(true);
    firstIdentity = rows[0].anonId;
    expect(firstIdentity).toMatch(/^[0-9a-f-]{36}$/);
    await page.reload();
    await play(page);
    await expect.poll(() => episodeRows(broadcast.episodeId).sessions.length).toBeGreaterThanOrEqual(3);
    rows = episodeRows(broadcast.episodeId).sessions;
    expect(new Set(rows.map(s => s.anonId))).toEqual(new Set([firstIdentity]));
    await page.goto('about:blank');
    await second.close();
    second = undefined;
    await endBroadcast(broadcast);
    await broadcast.cleanup();
    broadcast = await startLocalBroadcast(request);
    await page.goto('/listen');
    await play(page);
    await expect.poll(() => episodeRows(broadcast.episodeId).sessions.length).toBeGreaterThan(0);
    expect(episodeRows(broadcast.episodeId).sessions[0].anonId).not.toBe(firstIdentity);
  } finally {
    await page.goto('about:blank');
    await second?.close();
    await broadcast.cleanup();
  }
});

test('AC-2/AC-3 (integrity AC-9/AC-10): FE-BI-5/7: real staff listing filters historical quality and respects Manila date boundaries', async ({ page }) => {
  const fixture = seedStaffEpisodes();
  try {
    await loginAs(page, 'moderator');
    await page.goto('/mod/analytics');
    await page.getByTestId('mod-analytics-period-pcustom').click();
    await page.getByTestId('mod-analytics-from').fill(fixture.date);
    const listed = page.waitForResponse(r => {
      const u = new URL(r.url());
      return u.pathname === '/api/analytics/episodes' && u.searchParams.get('from') === new Date(fixture.start).toISOString() && u.searchParams.get('to') === new Date(fixture.end).toISOString() && !u.searchParams.has('measurementStatus');
    });
    await page.getByTestId('mod-analytics-to').fill(fixture.date);
    const response = await listed;
    expect(response.ok()).toBe(true);
    const data = await response.json();
    for (const privateField of ['anonId', 'userId', 'demographicSnapshot', 'sessions', 'voters']) {
      expect(JSON.stringify(data)).not.toContain(`"${privateField}":`);
    }
    expect(data.items.map((e: {episodeId: string}) => e.episodeId)).toEqual(expect.arrayContaining([fixture.ids.archived, fixture.ids.complete, fixture.ids.pending]));
    expect(data.items.map((e: {episodeId: string}) => e.episodeId)).not.toEqual(expect.arrayContaining([fixture.ids.before]));
    expect(data.items.map((e: {episodeId: string}) => e.episodeId)).not.toEqual(expect.arrayContaining([fixture.ids.after]));
    await expect(page.getByTestId(`mod-analytics-episode-row-${fixture.ids.archived}`)).toContainText('Archived integrity fixture');
    await expect(page.getByTestId(`mod-analytics-episode-row-${fixture.ids.pending}`)).toContainText('pending');
    await page.getByTestId(`mod-analytics-episode-row-${fixture.ids.complete}`).getByTestId('mod-analytics-episode-open').click();
    const detail = page.getByTestId('mod-analytics-episode-detail');
    await expect(detail).toContainText('0 / 1');
    await expect(detail).toContainText('not people');
    await expect(detail).toContainText('SONG_REQUEST: 1');
    await page.keyboard.press('Escape');
    await page.getByTestId('mod-analytics-episode-measurement').click();
    await page.getByTestId('mod-analytics-episode-measurement-unavailable').click();
    await expect(page.getByTestId(`mod-analytics-episode-row-${fixture.ids.complete}`)).toHaveCount(0);
    await page.getByTestId(`mod-analytics-episode-row-${fixture.ids.archived}`).getByTestId('mod-analytics-episode-open').click();
    await expect(detail).toContainText('Unavailable');
    await expect(detail).toContainText('Breakdown unavailable');
    await page.keyboard.press('Escape');
    await page.getByTestId('mod-analytics-episode-measurement').click();
    await page.getByTestId('mod-analytics-episode-measurement-all').click();
    await page.getByTestId('mod-analytics-episode-show').click();
    await page.getByTestId('mod-analytics-episode-show-unscheduled').click();
    await expect(page.getByTestId(`mod-analytics-episode-row-${fixture.ids.archived}`)).toHaveCount(0);
    await expect(page.getByTestId(`mod-analytics-episode-row-${fixture.ids.complete}`)).toBeVisible();
  } finally {
    await page.goto('about:blank');
    fixture.cleanup();
  }
});

test('AC-2 (integrity AC-9): FE-BI-6: real guest and listener cannot read staff episode measurements', async ({ page, request }) => {
  const fixture = seedStaffEpisodes();
  let listener: APIRequestContext | undefined;
  try {
    listener = await apiLoginAs('listener');
    for (const endpoint of ['analytics/episodes', `analytics/episodes/${fixture.ids.complete}`]) {
      expect((await request.get(api(endpoint))).status()).toBe(401);
      expect((await listener.get(api(endpoint))).status()).toBe(403);
    }
    await page.goto('/mod/analytics');
    await expect(page).toHaveURL(/\/login/);
    await loginAs(page, 'listener');
    await page.goto('/mod/analytics');
    await expect(page.getByTestId('mod-analytics-episodes')).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/mod\/analytics$/);
  } finally {
    await page.goto('about:blank');
    await listener?.dispose();
    fixture.cleanup();
  }
});





test('AC-2/AC-3 (integrity AC-9): FE-BI-10: staff paginates all real archived episode rows next and back', async ({ page }) => {
  const fixture = seedStaffEpisodes(23);
  try {
    await loginAs(page, 'moderator');
    await page.goto('/mod/analytics');
    await expect(page.getByTestId('mod-analytics-episodes')).toBeVisible();
    await page.getByTestId('mod-analytics-episode-show').click();
    await page.getByTestId(`mod-analytics-episode-show-${fixture.showId}`).click();
    await expect(page.getByTestId(`mod-analytics-episode-row-${fixture.extraIds[22]}`)).toBeVisible();
    await expect(page.getByTestId(`mod-analytics-episode-row-${fixture.ids.archived}`)).toHaveCount(0);
    await page.getByTestId('mod-analytics-episodes-next').click();
    await expect(page.getByTestId(`mod-analytics-episode-row-${fixture.ids.archived}`)).toBeVisible();
    await expect(page.getByTestId(`mod-analytics-episode-row-${fixture.extraIds[22]}`)).toHaveCount(0);
    await expect(page.getByTestId('mod-analytics-episodes-next')).toBeDisabled();
    await page.getByTestId('mod-analytics-episodes-prev').click();
    await expect(page.getByTestId(`mod-analytics-episode-row-${fixture.extraIds[22]}`)).toBeVisible();
    await expect(page.getByTestId('mod-analytics-episodes-prev')).toBeDisabled();
  } finally {
    await page.goto('about:blank');
    fixture.cleanup();
  }
});

test('AC-2 (integrity AC-5/AC-6/AC-7): FE-BI-11: same occurrence resumes and finalizes actual measured browser reach', async ({ page, request, browser }) => {
  test.setTimeout(120_000);
  const broadcast = await startLocalBroadcast(request, { scheduled: true });
  let staffContext: BrowserContext | undefined;
  let dropStart = false;
  let missedStart = false;
  // Transport fault only: forward real server frames, except the one start
  // notification that a disconnected/background listener can miss.
  await page.routeWebSocket('**/socket.io/**', socket => {
    const server = socket.connectToServer();
    server.onMessage(message => {
      if (dropStart && String(message).includes('"episode:started"')) missedStart = true;
      else socket.send(message);
    });
  });
  try {
    await page.goto('/listen');
    await play(page);
    await expect.poll(() => episodeRows(broadcast.episodeId).sessions.length).toBe(1);
    const identity = episodeRows(broadcast.episodeId).sessions[0].anonId;
    await page.getByTestId('engagement-reaction-fire').click();
    await expect(page.getByTestId('engagement-hype-meter')).toHaveAttribute('aria-label', /^1 reactions/);
    await endBroadcast(broadcast);
    await expect(page.getByTestId('engagement-reaction-fire')).toHaveCount(0);
    await expect(page.getByTestId('engagement-hype-meter')).toHaveCount(0);
    await expect.poll(() => localDb<{reach:number}|null>(`return p.episodeAnalyticsSnapshot.findUnique({where:{episodeId:${JSON.stringify(broadcast.episodeId)}},select:{reach:true}});`)).toEqual({ reach: 1 });
    const firstRevision = localDb<number>(`return (await p.episodeAnalyticsSnapshot.findUniqueOrThrow({where:{episodeId:${JSON.stringify(broadcast.episodeId)}}})).lifecycleRevision;`);
    // Receive the end, then lose the matching real start notification.
    // Fresh server state must recover the same episode without a page reload.
    dropStart = true;
    await broadcast.resume();
    await expect.poll(() => missedStart).toBe(true);
    await expect.poll(async () => (await (await request.get(api('stream/manifest'))).json()).status).toBe('LIVE');
    dropStart = false;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByTestId('engagement-reaction-fire')).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByTestId('engagement-hype-meter')).toHaveAttribute('aria-label', /^1 reactions/);
    // Reconnect a real playing tab after resumption; this is the same occurrence.
    await page.reload();
    await play(page);
    await expect.poll(() => episodeRows(broadcast.episodeId).sessions.length).toBeGreaterThanOrEqual(2);
    expect(new Set(episodeRows(broadcast.episodeId).sessions.map(row => row.anonId))).toEqual(new Set([identity]));
    await endBroadcast(broadcast);
    await expect.poll(() => localDb<boolean>(`const e=await p.episode.findUniqueOrThrow({where:{id:${JSON.stringify(broadcast.episodeId)}}});const s=await p.episodeAnalyticsSnapshot.findUnique({where:{episodeId:e.id}});return e.analyticsStatus==='complete'&&!!s&&s.lifecycleRevision===e.lifecycleRevision&&s.lifecycleRevision>${firstRevision};`)).toBe(true);
    await expect.poll(() => localDb<{reach:number;tlh:number;reactions:number}|null>(`const s=await p.episodeAnalyticsSnapshot.findUnique({where:{episodeId:${JSON.stringify(broadcast.episodeId)}}});return s?{reach:s.reach,tlh:s.tlh,reactions:(s.engagement as any).reactions}:null;`)).toEqual({ reach: 1, tlh: expect.any(Number), reactions: 1 });
    const snapshot = localDb<{tlh:number}>(`return p.episodeAnalyticsSnapshot.findUniqueOrThrow({where:{episodeId:${JSON.stringify(broadcast.episodeId)}},select:{tlh:true}});`);
    expect(snapshot.tlh).toBeGreaterThan(0);
    expect(episodeRows(broadcast.episodeId).sessions.every(row => row.endedAt !== null)).toBe(true);
    staffContext = await browser.newContext();
    const staff = await staffContext.newPage();
    await loginAs(staff, 'moderator');
    await staff.goto('/mod/analytics');
    const row = staff.getByTestId(`mod-analytics-episode-row-${broadcast.episodeId}`);
    await expect(row).toContainText('complete');
    await row.getByTestId('mod-analytics-episode-open').click();
    await expect(staff.getByTestId('mod-analytics-episode-detail')).toContainText('Measured resume fixture');
    await expect(staff.getByTestId('mod-analytics-episode-detail')).toContainText('Measured distinct browser IDs');
  } finally {
    await page.goto('about:blank');
    await staffContext?.close();
    await broadcast.cleanup();
  }
});
