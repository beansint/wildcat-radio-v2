import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";

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
  test(`browser IDs share simultaneous first play across tabs (${noLocks ? "IndexedDB" : "Web Locks"})`, async ({
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
test("storage denial keeps only a page-session identity", async ({
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

test("staff discovers unscheduled and archived episodes, filters and drills into unavailable measurements", async ({
  page,
}) => {
  const quality = {
    measurementVersion: "episode-browser-v1",
    sampleCount: null,
    expectedSamples: null,
    samplingCoverage: null,
    interruptedSessions: null,
    fallbackSessions: null,
    rawPrunedAt: null,
    unobservedIntervalSeconds: 15,
  };
  const episode = {
    episodeId: "old-archived",
    showId: "archived-show",
    showName: "Archived evening show",
    title: "Historical special",
    startedAt: "2026-10-01T01:00:00Z",
    endedAt: "2026-10-01T02:00:00Z",
    scheduledFor: null,
    scheduledEndAt: null,
    measurementStatus: "unavailable",
    durationMinutes: 60,
    peak: null,
    average: null,
    reach: null,
    tlh: null,
    tsl: null,
    quality,
  };
  const unsampled = {
    ...episode,
    episodeId: "complete-unsampled",
    showId: "show-without-samples",
    showName: "Unsampled completed show",
    title: "Unsampled morning",
    measurementStatus: "complete",
    reach: 3,
    tlh: 1,
    tsl: 20,
    quality: {
      ...quality,
      sampleCount: 0,
      expectedSamples: 60,
      samplingCoverage: 0,
    },
  };
  const listQueries: URL[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let body: unknown = {};
    if (url.pathname.endsWith("/get-session"))
      body = {
        session: {
          id: "fixture",
          expiresAt: "2030-01-01T00:00:00Z",
          token: "fixture",
          userId: "mod",
        },
        user: {
          id: "mod",
          email: "mod@fixture.test",
          name: "Moderator",
          role: "MODERATOR",
          emailVerified: true,
        },
      };
    else if (url.pathname === "/api/analytics/overview")
      body = {
        peakConcurrent: null,
        cumulativeEpisodeReach: 3,
        totalListeningHours: 1,
        averageEngagementPerEpisode: 2,
        episodeCount: 1,
        coverage: {
          totalEpisodes: 3,
          completedEpisodes: 1,
          pendingEpisodes: 1,
          unavailableEpisodes: 1,
          samplingUnavailableEpisodes: 1,
        },
      };
    else if (url.pathname === "/api/analytics/dayparts") body = [];
    else if (url.pathname === "/api/analytics/shows")
      body = [
        {
          showId: "show-without-samples",
          name: "Unsampled completed show",
          theme: null,
          episodeCount: 1,
          avgConcurrent: null,
          avgTlh: 1,
          avgEngagement: 2,
          trend: null,
        },
      ];
    else if (url.pathname === "/api/analytics/episodes") {
      listQueries.push(url);
      body =
        url.searchParams.get("measurementStatus") === "complete"
          ? { items: [unsampled], total: 1, page: 1, pageSize: 50 }
          : {
              items: [
                episode,
                {
                  ...episode,
                  episodeId: "unscheduled",
                  showId: null,
                  showName: null,
                  title: null,
                  measurementStatus: "pending",
                },
                unsampled,
              ],
              total: 3,
              page: 1,
              pageSize: 20,
            };
    } else if (url.pathname === "/api/analytics/episodes/old-archived")
      body = { ...episode, retention: [], engagement: null };
    else if (url.pathname.includes("manifest"))
      body = {
        status: "OFF_AIR",
        reason: null,
        type: "HLS",
        url: null,
        dj: [],
        episodeId: null,
        showId: null,
        showName: null,
        autoEndsAt: null,
      };
    await route.fulfill({ json: body });
  });
  await page.goto("/mod/analytics");
  await expect(page.getByTestId("mod-analytics-coverage")).toContainText(
    "1 unavailable",
  );
  await expect(page.getByTestId("mod-analytics-coverage")).toContainText(
    "1 complete without audience samples",
  );
  await expect(page.getByTestId("mod-analytics-stat-peak")).toHaveText(
    "Unavailable",
  );
  await expect(
    page
      .getByTestId("mod-analytics-show-row")
      .getByText("Unavailable", { exact: true }),
  ).toHaveCount(2);
  await expect(page.getByTestId("mod-analytics-episodes")).toContainText(
    "Archived evening show",
  );
  await expect(page.getByTestId("mod-analytics-episodes")).toContainText(
    "Unscheduled",
  );
  await page.getByRole("button", { name: "View episode" }).first().click();
  const dialog = page.getByTestId("mod-analytics-episode-detail");
  await expect(dialog).toContainText("Historical special");
  await expect(dialog).toContainText("Unavailable");
  await expect(dialog).toContainText("not people");
  await expect(dialog).toContainText("Breakdown unavailable");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("Measurement", { exact: true }).click();
  await page.getByRole("option", { name: "pending", exact: true }).click();
  await expect
    .poll(() =>
      listQueries.some(
        (url) => url.searchParams.get("measurementStatus") === "pending",
      ),
    )
    .toBe(true);
  expect(
    listQueries.every((url) => url.searchParams.get("to")?.includes("T")),
  ).toBe(true);
});

test("studio hydrates measured zero bins, hides moderated chat, expires pins and recovers authoritatively", async ({
  page,
}) => {
  const peers: import("@playwright/test").WebSocketRoute[] = [];
  await page.routeWebSocket("**/socket.io/**", (peer) => {
    peers.push(peer);
    peer.send(
      "0" +
        JSON.stringify({
          sid: `transport-${peers.length}`,
          upgrades: [],
          pingInterval: 25000,
          pingTimeout: 20000,
          maxPayload: 1000000,
        }),
    );
    peer.onMessage((message) => {
      if (String(message) === "40")
        peer.send("40" + JSON.stringify({ sid: `socket-${peers.length}` }));
    });
  });
  let snapshotRequests = 0;
  const hype = () => ({
    episodeId: "episode",
    capturedAt: new Date().toISOString(),
    windowSeconds: 60,
    count: 0,
    trend: "flat",
    buckets: Array.from({ length: 12 }, (_, i) => ({
      startedAt: new Date(Date.now() - 60000 + i * 5000).toISOString(),
      count: 0,
    })),
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === "/api/studio/session") body = { active: true };
    else if (path === "/api/studio/today")
      body = {
        episode: {
          id: "episode",
          status: "LIVE",
          startedAt: new Date().toISOString(),
          endedAt: null,
          showId: null,
          unscheduled: true,
          effectiveEndAt: null,
        },
        attendees: [],
        slotRoster: [],
        todayShows: [],
        pendingHandover: null,
        nextUp: null,
      };
    else if (path === "/api/studio/queue")
      body = { episodeId: "episode", showName: "Fixture broadcast", items: [] };
    else if (path === "/api/studio/roster") body = [];
    else if (path.endsWith("/engagement-snapshot")) {
      snapshotRequests++;
      body = {
        episodeId: "episode",
        capturedAt: new Date().toISOString(),
        recentChat: [],
        polls: [],
        pinnedTopic: null,
        reactions: [],
        upNext: [],
        hype: hype(),
      };
    } else if (path.endsWith("/get-session")) body = null;
    else if (path.includes("manifest"))
      body = {
        status: "OFF_AIR",
        reason: null,
        type: "HLS",
        url: null,
        dj: [],
        episodeId: null,
        showId: null,
        showName: null,
        autoEndsAt: null,
      };
    await route.fulfill({ json: body });
  });
  await page.goto("/studio");
  await page.getByTestId("studio-seg-console").click();
  await expect.poll(() => snapshotRequests).toBeGreaterThan(0);
  await expect(
    page.getByTestId("studio-hype-bars").locator("span"),
  ).toHaveCount(12);
  expect(
    await page
      .getByTestId("studio-hype-bars")
      .locator("span")
      .evaluateAll((bars) =>
        bars.every((bar) => (bar as HTMLElement).style.height === "0%"),
      ),
  ).toBe(true);
  const emit = (name: string, payload: unknown) =>
    peers[peers.length - 1].send("42" + JSON.stringify([name, payload]));
  emit("chat:new", {
    id: "hide-chat",
    episodeId: "episode",
    content: "Moderated connected chat",
    asBooth: false,
    createdAt: new Date().toISOString(),
    author: { id: "u", handle: "listener", name: "Listener" },
  });
  await expect(page.getByText("Moderated connected chat")).toBeVisible();
  emit("chat:hidden", { id: "hide-chat" });
  await expect(page.getByText("Moderated connected chat")).toHaveCount(0);
  emit("topic:pinned", {
    text: "Brief timed pin",
    expiresAt: new Date(Date.now() + 1000).toISOString(),
  });
  await expect(
    page.getByText("Brief timed pin", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Brief timed pin", { exact: true })).toHaveCount(
    0,
    { timeout: 4000 },
  );
  emit("chat:new", {
    id: "stale-chat",
    episodeId: "episode",
    content: "Hidden while disconnected",
    asBooth: false,
    createdAt: new Date().toISOString(),
    author: { id: "u", handle: "listener", name: "Listener" },
  });
  await expect(page.getByText("Hidden while disconnected")).toBeVisible();
  const previousRequests = snapshotRequests;
  peers[peers.length - 1].close();
  await expect.poll(() => snapshotRequests).toBeGreaterThan(previousRequests);
  await expect(page.getByText("Hidden while disconnected")).toHaveCount(0);
});

test("listener snapshot preserves only events during the current recovery request", async ({
  page,
}) => {
  const peers: import("@playwright/test").WebSocketRoute[] = [];
  await page.routeWebSocket("**/socket.io/**", (peer) => {
    peers.push(peer);
    peer.send(
      "0" +
        JSON.stringify({
          sid: `transport-${peers.length}`,
          upgrades: [],
          pingInterval: 25000,
          pingTimeout: 20000,
          maxPayload: 1000000,
        }),
    );
    peer.onMessage((message) => {
      if (String(message) === "40")
        peer.send("40" + JSON.stringify({ sid: `socket-${peers.length}` }));
    });
  });
  let block = false;
  let waiting: import("@playwright/test").Route | null = null;
  let clean = false;
  let requests = 0;
  const snapshot = () => ({
    episodeId: "episode",
    capturedAt: new Date().toISOString(),
    recentChat: clean
      ? []
      : [
          {
            id: "old-chat",
            content: "Old public snapshot chat",
            asBooth: false,
            createdAt: new Date().toISOString(),
            author: { handle: "listener", name: "Listener" },
          },
        ],
    polls: [],
    pinnedTopic: clean
      ? null
      : {
          episodeId: "episode",
          text: "Old snapshot pin",
          expiresAt: null,
          expiresAtEpisodeEnd: true,
        },
    reactions: [{ emoji: "🔥", count: 100 }],
    upNext: [],
    hype: {
      episodeId: "episode",
      capturedAt: new Date().toISOString(),
      windowSeconds: 60,
      count: 0,
      trend: "flat",
      buckets: Array.from({ length: 12 }, (_, i) => ({
        startedAt: new Date(Date.now() - 60000 + i * 5000).toISOString(),
        count: 0,
      })),
    },
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path.endsWith("/get-session")) body = null;
    else if (path.includes("manifest"))
      body = {
        status: "LIVE",
        reason: null,
        type: "HLS",
        url: "http://localhost:3010/fixture-stream.m3u8",
        dj: [],
        episodeId: "episode",
        showId: null,
        showName: "Fixture broadcast",
        autoEndsAt: null,
      };
    else if (path.endsWith("/engagement-snapshot")) {
      requests++;
      if (block) {
        block = false;
        waiting = route;
        return;
      }
      body = snapshot();
    } else if (path.endsWith("/polls") || path.includes("announcements"))
      body = [];
    await route.fulfill({ json: body });
  });
  await page.goto("/listen");
  await expect(page.getByText("Old public snapshot chat")).toBeVisible();
  await expect.poll(() => requests).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("engagement-hype-meter")).toHaveAttribute(
    "aria-label",
    /0 reactions/,
  );
  block = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => waiting !== null).toBe(true);
  const emit = (name: string, payload: unknown) =>
    peers[peers.length - 1].send("42" + JSON.stringify([name, payload]));
  emit("chat:hidden", { id: "old-chat" });
  emit("chat:new", {
    id: "new-chat",
    content: "Chat during snapshot",
    asBooth: false,
    createdAt: new Date().toISOString(),
    author: { handle: "listener", name: "Listener" },
  });
  emit("topic:pinned", { text: "Pin during snapshot", expiresAt: null });
  await expect(page.getByText("Chat during snapshot")).toBeVisible();
  await waiting!.fulfill({ json: snapshot() });
  await expect(page.getByText("Old public snapshot chat")).toHaveCount(0);
  await expect(page.getByTestId("engagement-pinned-topic")).toContainText(
    "Pin during snapshot",
  );
  clean = true;
  const previous = requests;
  peers[peers.length - 1].close();
  await expect.poll(() => requests).toBeGreaterThan(previous);
  await expect(page.getByText("Chat during snapshot")).toHaveCount(0);
  await expect(page.getByTestId("engagement-pinned-topic")).toContainText(
    "No pinned topic yet.",
  );
});
