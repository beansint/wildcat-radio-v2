import { expect, test, type Page } from "@playwright/test";
import { attachConsoleGuard } from "./_console";

const LIVE_MANIFEST = {
  status: "LIVE",
  reason: null,
  type: "hls",
  url: "/test-live.m3u8",
  dj: ["DJ Test"],
  episodeId: "listener-state-episode-a",
};

async function manifest(page: Page, body: unknown, status = 200) {
  await page.route("**/api/stream/manifest", (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    }),
  );
}

test("#64: OFF_AIR contains no fabricated live metadata", async ({ page }, testInfo) => {
  const consoleGuard = attachConsoleGuard(page);
  await manifest(page, {
    status: "OFF_AIR",
    reason: "PUBLICATION_STALE",
    type: "hls",
    url: null,
    dj: [],
    episodeId: null,
  });
  await page.goto("/listen");

  await expect(page.getByRole("heading", { name: "Off air" })).toBeVisible();
  await expect(page.getByText("DJ Mara")).toHaveCount(0);
  await expect(page.getByText("Afternoon Vibes")).toHaveCount(0);
  await expect(page.getByText("Golden Hour")).toHaveCount(0);
  await expect(page.getByText("142")).toHaveCount(0);
  await expect(page.getByRole("progressbar", { name: "Stream progress" })).toHaveCount(0);
  await expect(page.getByText("2:14 / live")).toHaveCount(0);
  await expect(page.getByText("Live poll · booth")).toHaveCount(0);
  await expect(page.getByText("Sign in to join the chat")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("off-air.png"), fullPage: true });
  consoleGuard.assertClean();
});

test("#64: API failure is unavailable, not genuine OFF_AIR", async ({ page }, testInfo) => {
  const consoleGuard = attachConsoleGuard(page);
  await manifest(page, { message: "unavailable" }, 503);
  await page.goto("/listen");

  await expect(page.getByTestId("player-status")).toHaveText("UNAVAILABLE");
  await expect(page.getByRole("heading", { name: "Broadcast status unavailable" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Off air" })).toHaveCount(0);
  await expect(page.getByText("DJ Mara")).toHaveCount(0);
  await expect(page.getByText("142")).toHaveCount(0);
  await expect(page.getByText("Live poll · booth")).toHaveCount(0);
  await expect(page.getByText("Sign in to join the chat")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("unavailable.png"), fullPage: true });
  expect(
    consoleGuard.errors().filter((entry) => !entry.includes("503 (Service Unavailable)")),
  ).toEqual([]);
  expect(consoleGuard.badResponses()).toEqual([
    expect.objectContaining({ status: 503 }),
  ]);
});

test("#64: a failed poll clears prior LIVE data and stops playback", async ({ page }) => {
  let unavailable = false;
  await page.route("**/api/stream/manifest", (route) =>
    unavailable
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "unavailable" }),
        })
      : route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(LIVE_MANIFEST),
        }),
  );
  await page.route("**/api/episodes/*/polls", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
  );
  await page.route("**/test-live.m3u8", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/vnd.apple.mpegurl",
      body: [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:6",
        "#EXT-X-MEDIA-SEQUENCE:1",
        "#EXTINF:6.0,",
        "live_1.ts",
      ].join("\n"),
    }),
  );
  await page.route("**/live_1.ts", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp2t", body: "segment" }),
  );
  await page.addInitScript(() => {
    Object.defineProperty(window, "__pauseCalls", { value: 0, writable: true });
    HTMLMediaElement.prototype.play = async function () {};
    HTMLMediaElement.prototype.pause = function () {
      (window as typeof window & { __pauseCalls: number }).__pauseCalls += 1;
    };
  });

  await page.goto("/listen");
  await expect(page.getByRole("heading", { name: "Live on air" })).toBeVisible();
  await page.getByTestId("player-play").click();
  await expect(page.getByTestId("player-play")).toHaveAttribute("aria-label", "Pause");

  unavailable = true;
  await expect(page.getByTestId("player-status")).toHaveText("UNAVAILABLE", {
    timeout: 20_000,
  });
  await expect(page.getByText("DJ Test")).toHaveCount(0);
  await expect(page.locator(".wc-player .wc-badge-live")).toHaveCount(0);
  await expect(page.getByTestId("player-play")).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(() => (window as typeof window & { __pauseCalls: number }).__pauseCalls),
    )
    .toBeGreaterThan(0);
});

test("#64: an episode-A submission cannot toast or close episode B", async ({ page }) => {
  let currentManifest = LIVE_MANIFEST;
  let releaseSubmission!: () => void;
  let submissionStarted!: () => void;
  const submissionGate = new Promise<void>((resolve) => {
    releaseSubmission = resolve;
  });
  const started = new Promise<void>((resolve) => {
    submissionStarted = resolve;
  });
  await page.route("**/api/stream/manifest", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(currentManifest),
    }),
  );
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        session: {
          id: "listener-state-session",
          userId: "listener-state-user",
          token: "test",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        user: {
          id: "listener-state-user",
          email: "listener@example.test",
          name: "Listener",
          emailVerified: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await page.route("**/api/episodes/*/polls", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/api/episodes/listener-state-episode-a/queue", async (route) => {
    submissionStarted();
    await submissionGate;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: "episode-a-item", status: "PENDING", remaining: 2 }),
    });
  });

  await page.goto("/listen");
  await page.getByTestId("engagement-open-request").click();
  await page.getByTestId("engagement-request-song").fill("Episode A song");
  await page.getByTestId("engagement-submit").click();
  await started;

  currentManifest = {
    ...LIVE_MANIFEST,
    dj: ["DJ Episode B"],
    episodeId: "listener-state-episode-b",
  };
  await expect(page.getByTestId("now-playing")).toHaveText("DJ Episode B", {
    timeout: 20_000,
  });
  await page.getByTestId("engagement-open-request").click();
  await expect(page.getByTestId("engagement-sheet")).toBeVisible();

  releaseSubmission();
  await page.waitForTimeout(300);
  await expect(page.getByTestId("engagement-sheet")).toBeVisible();
  await expect(page.getByText("Request sent to the booth.")).toHaveCount(0);
});

test("#64: cancelling while the HLS manifest is pending never starts late audio", async ({ page }, testInfo) => {
  const consoleGuard = attachConsoleGuard(page);
  await manifest(page, LIVE_MANIFEST);
  await page.route("**/api/episodes/*/polls", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
  );
  await page.addInitScript(() => {
    Object.defineProperty(window, "__playCalls", { value: 0, writable: true });
    HTMLMediaElement.prototype.play = async function () {
      (window as typeof window & { __playCalls: number }).__playCalls += 1;
    };
  });

  let releaseManifest!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseManifest = resolve;
  });
  await page.route("**/test-live.m3u8", async (route) => {
    await held;
    await route.fulfill({
      status: 200,
      contentType: "application/vnd.apple.mpegurl",
      body: [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:6",
        "#EXT-X-MEDIA-SEQUENCE:1",
        "#EXTINF:6.0,",
        "live_1.ts",
      ].join("\n"),
    });
  });

  await page.goto("/listen");
  const play = page.getByTestId("player-play");
  await expect(play).toBeEnabled();
  await play.click();
  await expect(play).toHaveAttribute("aria-label", /Connecting/);
  await play.click();
  await expect(play).toHaveAttribute("aria-label", "Play live stream");

  releaseManifest();
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(() => (window as typeof window & { __playCalls: number }).__playCalls),
  ).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("cancelled-live.png"), fullPage: true });
  consoleGuard.assertClean();
});

test("#64 realtime: pause, resume, reconnect, and episode turnover stay coherent", async ({
  page,
  request,
}) => {
  test.skip(process.env.PLAYWRIGHT_REALTIME !== "true", "requires the runnable local API/socket fixture");
  const api = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:3210";
  const token = process.env.STATION_DEVICE_TOKEN ?? "e2e-stream-integrity-token";
  const socketUrls: string[] = [];
  let closedSockets = 0;
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/socket.io/")) return;
    socketUrls.push(socket.url());
    socket.on("close", () => {
      closedSockets += 1;
    });
  });
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = async function () {};
  });
  await page.route("**/live.m3u8", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/vnd.apple.mpegurl",
      body: [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:6",
        "#EXT-X-MEDIA-SEQUENCE:1",
        "#EXTINF:6.0,",
        "live_1.ts",
      ].join("\n"),
    }),
  );
  await page.route("**/live_1.ts", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp2t", body: "segment" }),
  );

  const stationPost = (path: string, data: unknown) =>
    request.post(`${api}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      data,
    });
  const freshHeartbeat = () => {
    const now = new Date().toISOString();
    return stationPost("/api/stream/heartbeat", {
      sourceConnected: true,
      lastSegmentAt: now,
      lastPublishedAt: now,
    });
  };

  expect((await stationPost("/api/studio/time-in", { rosterId: "listener64-a" })).ok()).toBe(true);
  expect((await freshHeartbeat()).ok()).toBe(true);
  await page.goto("/listen");
  await expect(page.getByRole("heading", { name: "Live on air" })).toBeVisible();
  await expect.poll(() => socketUrls.length).toBe(1);

  const beforePause = `Before pause ${Date.now()}`;
  expect((await stationPost("/api/studio/chat", { content: beforePause })).ok()).toBe(true);
  await expect(page.getByText(beforePause)).toBeVisible();

  const play = page.getByTestId("player-play");
  await play.click();
  await expect(page.getByText("1 listening").first()).toBeVisible();
  await play.click();
  await expect(page.getByText(beforePause)).toBeVisible();

  const whilePaused = `While paused ${Date.now()}`;
  expect((await stationPost("/api/studio/chat", { content: whilePaused })).ok()).toBe(true);
  await expect(page.getByText(whilePaused)).toBeVisible();
  expect(socketUrls).toHaveLength(1);
  expect(closedSockets).toBe(0);

  await play.click();
  await expect(page.getByText("1 listening").first()).toBeVisible();
  expect(socketUrls).toHaveLength(1);

  await page.context().setOffline(true);
  await expect.poll(() => closedSockets, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.context().setOffline(false);
  await expect.poll(() => socketUrls.length, { timeout: 15_000 }).toBeGreaterThan(1);

  const afterReconnect = `After reconnect ${Date.now()}`;
  await page.waitForTimeout(500);
  expect((await stationPost("/api/studio/chat", { content: afterReconnect })).ok()).toBe(true);
  await expect(page.getByText(afterReconnect)).toBeVisible({ timeout: 10_000 });

  expect((await stationPost("/api/studio/time-out", { rosterId: "listener64-a" })).ok()).toBe(true);
  await expect(page.getByText(beforePause)).toHaveCount(0);
  await expect(page.getByText(whilePaused)).toHaveCount(0);
  await expect(page.getByText(afterReconnect)).toHaveCount(0);

  expect((await stationPost("/api/studio/time-in", { rosterId: "listener64-b" })).ok()).toBe(true);
  expect((await freshHeartbeat()).ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Live on air" })).toBeVisible({ timeout: 20_000 });

  const episodeB = `Episode B ${Date.now()}`;
  expect((await stationPost("/api/studio/chat", { content: episodeB })).ok()).toBe(true);
  await expect(page.getByText(episodeB)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(beforePause)).toHaveCount(0);

  await page.getByTestId("player-audio").evaluate((audio) => {
    audio.setAttribute("data-runtime-instance", "listener-64");
  });
  await page.locator('a[href="/shows"]').first().click();
  await expect(page).toHaveURL(/\/shows$/);
  await expect(page.getByTestId("player-audio")).toHaveAttribute(
    "data-runtime-instance",
    "listener-64",
  );
  await expect(page.getByTestId("player-status")).toHaveText("LIVE");

  expect((await stationPost("/api/studio/time-out", { rosterId: "listener64-b" })).ok()).toBe(true);
});
