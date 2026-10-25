import { randomUUID } from "node:crypto";
import { expect, test, type Page, type BrowserContext, type APIRequestContext } from "@playwright/test";
import { WEB_BASE, PASSWORD, ACCOUNTS, apiLoginAs, getAdminSettings, putSetting } from "./_fixtures";
import { api, assertIntegrityCleanup, endBroadcast, localDb, play, startIntegrityBroadcast, unlockLiveStudio } from "./_broadcast-integrity";

// Real local HTTP, session cookies, station handoff, playback and Socket.IO.
// DB writes below are deterministic setup/cleanup only, never action assertions.
// Each case owns and cleans its fixtures; the project runs one worker, and a
// failure must not suppress evidence from the other independent journeys.
test.setTimeout(180_000);
test.use({ actionTimeout: 15_000 });
const ownedUsers: string[] = [];
test.afterAll(() => {
  assertIntegrityCleanup();
  expect(localDb<number>(`return p.user.count({where:{id:{in:${JSON.stringify(ownedUsers)}}}});`), "All engagement listener fixtures were removed").toBe(0);
});

function seedListener(userClass: "CAMPUS" | "GUEST", notifyInApp = false) {
  const id = `engagement-${randomUUID()}`;
  const handle = `eng${randomUUID().replaceAll("-", "").slice(0, 18)}`;
  const email = `${handle}@${userClass === "CAMPUS" ? "cit.edu" : "example.com"}`;
  localDb(`const credential=await p.account.findFirstOrThrow({where:{user:{email:${JSON.stringify(ACCOUNTS.listener)}},providerId:'credential'}});
    await p.user.create({data:{id:${JSON.stringify(id)},email:${JSON.stringify(email)},name:'Engagement listener',handle:${JSON.stringify(handle)},class:${JSON.stringify(userClass)},emailVerified:true,notifyInApp:${notifyInApp},notifyEmail:false,accounts:{create:{accountId:${JSON.stringify(id)},providerId:'credential',password:credential.password}}}});`);
  ownedUsers.push(id);
  return { id, email, cleanup() { localDb(`await p.notification.deleteMany({where:{userId:${JSON.stringify(id)}}}); await p.user.delete({where:{id:${JSON.stringify(id)}}});`); } };
}

async function signIn(page: Page, email: string) {
  await page.goto(`${WEB_BASE}/login`);
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(PASSWORD);
  await page.getByTestId("auth-submit").click();
  await page.waitForURL(url => url.pathname === "/");
  await page.goto(`${WEB_BASE}/listen`);
  await expect(page.getByTestId("submission-budget")).toBeVisible();
}

async function submit(page: Page, type: "request" | "dedication" | "qa", text: string) {
  await page.getByTestId(`engagement-open-${type}`).click();
  await page.getByTestId(type === "request" ? "engagement-request-song" : type === "dedication" ? "engagement-dedication-body" : "engagement-qa-body").fill(text);
  const response = page.waitForResponse(r => r.url().endsWith("/queue") && r.request().method() === "POST");
  await page.getByTestId("engagement-submit").click();
  const result = await response;
  expect(result.ok(), await result.text()).toBe(true);
  await expect(page.getByTestId("engagement-sheet")).not.toBeVisible();
  return (await result.json()).id as string;
}

async function ownHistory(page: Page) {
  const summary = page.getByTestId("my-submissions").locator("summary");
  if (!(await summary.evaluate(el => el.parentElement?.hasAttribute("open")))) await summary.click();
}

async function closeSubmissionSheet(page: Page) {
  const sheet = page.getByTestId("engagement-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("data-state", "open");
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  // Radix retains the closing panel through its exit animation. Finish that
  // lifecycle before a later trigger click opens another panel instance.
  await expect(sheet).toHaveCount(0);
}

async function act(studio: Page, id: string, label: "Queue" | "Read on air" | "Decline" | "Handled") {
  const row = studio.getByTestId(`studio-submission-${id}`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  const response = studio.waitForResponse(r => r.url().endsWith(`/queue/${id}/act`) && r.request().method() === "POST");
  await row.getByRole("button", { name: label, exact: true }).click();
  const result = await response;
  expect(result.ok(), await result.text()).toBe(true);
  return result.json();
}

test("AC-5/6/8/9: opt-out decisions leave Pending, Handle drains Up Next, and private history survives episode end", async ({ browser, request }, testInfo) => {
  const broadcast = await startIntegrityBroadcast(request);
  let user: ReturnType<typeof seedListener> | undefined;
  let listenerContext: BrowserContext | undefined;
  let boothContext: BrowserContext | undefined;
  try {
    user = seedListener("CAMPUS");
    listenerContext = await browser.newContext();
    boothContext = await browser.newContext();
    const listener = await listenerContext.newPage();
    const studio = await boothContext.newPage();
    await signIn(listener, user.email);
    await unlockLiveStudio(studio, broadcast);
    const queued = await submit(listener, "request", "Queue then handle this request");
    await expect(studio.getByTestId("studio-pending-count")).toHaveText("1", { timeout: 15_000 });
    expect(await act(studio, queued, "Queue")).toMatchObject({ status: "QUEUED", receipt: false });
    await expect(studio.getByText("Added to Up Next.", { exact: true })).toBeVisible();
    await expect(studio.getByTestId("studio-pending-count")).toHaveText("0");
    await expect(studio.getByTestId(`studio-submission-${queued}`)).toHaveCount(0);
    await expect(listener.getByTestId("public-up-next-item")).toContainText("Queue then handle");
    await studio.getByTestId("studio-queue-upNext").click();
    expect(await act(studio, queued, "Handled")).toMatchObject({ status: "HANDLED", receipt: false });
    await expect(listener.getByTestId("public-up-next-item")).toHaveCount(0);
    await studio.getByTestId("studio-queue-pending").click();
    const read = await submit(listener, "dedication", "Read this dedication privately");
    expect(await act(studio, read, "Read on air")).toMatchObject({ status: "READ", receipt: false });
    await expect(studio.getByText("Marked read on air.", { exact: true })).toBeVisible();
    const closed = await submit(listener, "qa", "Close this question quietly");
    await act(studio, closed, "Decline");
    await ownHistory(listener);
    await expect(listener.getByTestId(`my-submission-${closed}`).getByTestId("submission-status")).toHaveText("Closed", { timeout: 15_000 });
    await expect(listener.getByTestId(`my-submission-${read}`).getByTestId("submission-status")).toHaveText("Read on air");
    await expect(listener.getByTestId(`my-submission-${queued}`).getByTestId("submission-status")).toHaveText("Handled");
    await expect(listener.getByTestId("submission-budget")).toContainText("2 of 5");
    await expect(listener.getByText("Your request is up next.", { exact: true })).toHaveCount(0);
    await studio.getByTestId("studio-queue-history").click();
    await expect(studio.getByTestId("studio-queue").locator("article")).toHaveCount(3);
    await expect(studio.getByTestId("studio-queue").getByRole("button")).toHaveCount(0);
    await studio.screenshot({ path: testInfo.outputPath("studio-history.png"), fullPage: true });
    await listener.screenshot({ path: testInfo.outputPath("listener-private-history.png"), fullPage: true });
    const expired = await submit(listener, "qa", "Pending question when the episode ends");
    await expect(listener.getByTestId(`my-submission-${expired}`).getByTestId("submission-status")).toHaveText("Pending");
    await endBroadcast(broadcast);
    await expect(listener.getByTestId(`my-submission-${expired}`).getByTestId("submission-status")).toHaveText("Closed", { timeout: 20_000 });
    await listener.reload();
    await ownHistory(listener);
    await expect(listener.getByTestId(`my-submission-${closed}`)).toBeVisible();
    await expect(listener.getByTestId("submission-budget")).toContainText("1 of 5");
  } finally {
    await Promise.allSettled([listenerContext?.close(), boothContext?.close()]);
    await broadcast.cleanup(); user?.cleanup();
  }
});

test("AC-9: guest allowance is shared by request and dedication, remains exhausted after decline and reload", async ({ browser, request }) => {
  const broadcast = await startIntegrityBroadcast(request);
  let user: ReturnType<typeof seedListener> | undefined;
  let context: BrowserContext | undefined;
  try {
    user = seedListener("GUEST");
    context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, user.email);
    const first = await submit(page, "request", "Guest request consumes one");
    await submit(page, "dedication", "Guest dedication consumes two");
    expect((await broadcast.stationPost(`studio/queue/${first}/act`, { action: "DECLINE" })).ok()).toBe(true);
    await page.reload();
    await expect(page.getByTestId("submission-budget")).toContainText("0 of 2");
    await page.getByTestId("engagement-open-qa").click();
    await expect(page.getByTestId("engagement-submit")).toBeDisabled();
    await expect(page.getByTestId("sheet-submission-budget")).toContainText("do not restore");
    const refused = await page.request.post(api(`episodes/${broadcast.episodeId}/queue`), { data: { type: "QUESTION", text: "No third item" } });
    expect(refused.ok()).toBe(false);
    expect(await refused.text()).toMatch(/limit|budget/i);
  } finally { await context?.close().catch(() => undefined); await broadcast.cleanup(); user?.cleanup(); }
});

test("AC-7: seven reverse acceptances stay oldest-first in listener and player across handling, reload and reconnect", async ({ browser, request }) => {
  const broadcast = await startIntegrityBroadcast(request);
  let staff: APIRequestContext | undefined;
  let context: BrowserContext | undefined;
  try {
    staff = await apiLoginAs("moderator");
    context = await browser.newContext();
    const page = await context.newPage();
    const rows: { id: string; text: string }[] = [];
    for (let n = 0; n < 7; n++) {
      const text = `Ordered request ${n + 1}`;
      const response = await staff.post(api(`episodes/${broadcast.episodeId}/queue`), { data: { type: "REQUEST", text } });
      expect(response.ok(), await response.text()).toBe(true);
      rows.push({ id: (await response.json()).id, text });
    }
    for (const row of [...rows].reverse()) expect((await broadcast.stationPost(`studio/queue/${row.id}/act`, { action: "QUEUE" })).ok()).toBe(true);
    await page.goto(`${WEB_BASE}/listen`);
    await play(page);
    const texts = () => page.getByTestId("public-up-next-item").locator("span:nth-child(2)");
    await expect(texts()).toHaveText(rows.slice(0, 5).map(row => row.text));
    await expect(page.getByTestId("player-upnext")).toContainText(rows[0].text);
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Home", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/");
    expect((await broadcast.stationPost(`studio/queue/${rows[0].id}/act`, { action: "HANDLE" })).ok()).toBe(true);
    await expect(page.getByTestId("player-upnext")).toContainText(rows[1].text);
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Listen", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/listen");
    await expect(texts()).toHaveText(rows.slice(1, 6).map(row => row.text));
    await context.setOffline(true);
    expect((await broadcast.stationPost(`studio/queue/${rows[1].id}/act`, { action: "HANDLE" })).ok()).toBe(true);
    await context.setOffline(false);
    await expect(texts()).toHaveText(rows.slice(2, 7).map(row => row.text), { timeout: 20_000 });
    await page.reload();
    await play(page);
    await expect(texts()).toHaveText(rows.slice(2, 7).map(row => row.text));
    await expect(page.getByTestId("player-upnext")).toContainText(rows[2].text);
  } finally { await context?.close().catch(() => undefined); await staff?.dispose(); await broadcast.cleanup(); }
});

test("AC-10/11/12: booth pauses are independent, station restrictions take precedence, browser lock leaves playback live", async ({ browser, request }) => {
  const broadcast = await startIntegrityBroadcast(request, { scheduled: true });
  let user: ReturnType<typeof seedListener> | undefined;
  let staff: APIRequestContext | undefined;
  let listenerContext: BrowserContext | undefined;
  let boothContext: BrowserContext | undefined;
  const originals = new Map<string, unknown>();
  const absentSettings: string[] = [];
  try {
    user = seedListener("GUEST");
    staff = await apiLoginAs("moderator");
    listenerContext = await browser.newContext();
    boothContext = await browser.newContext();
    const settings = await getAdminSettings(staff);
    for (const key of ["toggle.chatFreeze", "killswitch.guests"]) {
      const row = settings.find(row => row.key === key);
      originals.set(key, row?.value ?? false);
      if (!row) absentSettings.push(key);
    }
    await putSetting(staff, "toggle.chatFreeze", false);
    await putSetting(staff, "killswitch.guests", false);
    const listener = await listenerContext.newPage();
    const studio = await boothContext.newPage();
    await signIn(listener, user.email);
    await unlockLiveStudio(studio, broadcast);
    await studio.getByRole("switch", { name: "Pause listener chat" }).click();
    await expect(studio.getByRole("switch", { name: "Pause listener chat" })).toBeChecked();
    await expect(listener.getByTestId("chat-restriction")).toContainText("paused by the booth");
    const pollResponse = await broadcast.stationPost("studio/polls", { question: "Voting stays open while chat is paused", options: ["Keep music", "More stories"], visibility: "PUBLIC" });
    expect(pollResponse.ok(), await pollResponse.text()).toBe(true);
    const poll = await pollResponse.json();
    const voteResponse = listener.waitForResponse(r => r.url().endsWith(`/polls/${poll.id}/vote`) && r.request().method() === "POST");
    await listener.getByTestId("engagement-poll-option").first().click();
    expect((await voteResponse).ok()).toBe(true);
    await listener.getByTestId("engagement-open-request").click();
    await expect(listener.getByTestId("engagement-sheet")).toHaveAttribute("data-state", "open");
    await expect(listener.getByTestId("engagement-submit")).toBeEnabled();
    await closeSubmissionSheet(listener);
    await studio.getByRole("switch", { name: "Pause new submissions" }).click();
    await expect(studio.getByRole("switch", { name: "Pause new submissions" })).toBeChecked();
    await listener.getByTestId("engagement-open-request").click();
    await expect(listener.getByTestId("engagement-sheet")).toBeVisible();
    await expect(listener.getByTestId("engagement-sheet")).toHaveAttribute("data-state", "open");
    await expect(listener.getByTestId("engagement-sheet")).toContainText("New submissions are paused by the booth");
    await expect(listener.getByTestId("engagement-submit")).toBeDisabled();
    await closeSubmissionSheet(listener);
    const denied = await listener.request.put(api(`studio/episodes/${broadcast.episodeId}/controls`), { data: { chatPaused: false } });
    expect([401, 403]).toContain(denied.status());
    await putSetting(staff, "toggle.chatFreeze", true);
    await studio.getByRole("switch", { name: "Pause listener chat" }).click();
    await studio.getByRole("switch", { name: "Pause new submissions" }).click();
    await expect(listener.getByTestId("chat-restriction")).toContainText("station staff", { timeout: 20_000 });
    await expect(studio.getByTestId("studio-engagement-controls")).toContainText("cannot lift this restriction");
    const staffSubmission = await staff.post(api(`episodes/${broadcast.episodeId}/queue`), { data: { type: "QUESTION", text: "Staff remain exempt during freeze" } });
    expect(staffSubmission.ok(), await staffSubmission.text()).toBe(true);
    await putSetting(staff, "toggle.chatFreeze", false);
    await putSetting(staff, "killswitch.guests", true);
    await expect(listener.getByTestId("engagement-restrictions")).toContainText("Guest participation", { timeout: 20_000 });
    await expect(listener.getByTestId("engagement-poll-option").first()).toBeDisabled();
    const blockedVote = await listener.request.post(api(`polls/${poll.id}/vote`), { data: { optionId: poll.options[1].id } });
    expect(blockedVote.status()).toBe(403);
    const reaction = await listener.request.post(api(`episodes/${broadcast.episodeId}/reactions`), { data: { emoji: "🔥" } });
    expect(reaction.ok(), await reaction.text()).toBe(true);
    await putSetting(staff, "killswitch.guests", false);
    await studio.getByRole("switch", { name: "Pause listener chat" }).click();
    await endBroadcast(broadcast);
    await broadcast.resume();
    await studio.reload();
    await studio.getByTestId("studio-seg-console").click();
    await expect(studio.getByRole("switch", { name: "Pause listener chat" })).not.toBeChecked();
    await expect(studio.getByRole("switch", { name: "Pause new submissions" })).not.toBeChecked();
    await play(listener);
    await studio.getByRole("button", { name: "Lock this browser", exact: true }).click();
    await expect(studio.getByTestId("studio-lock-dialog")).toContainText("Playback and the show continue");
    await studio.getByTestId("studio-lock-confirm").click();
    await expect(studio.getByTestId("studio-handoff-required")).toBeVisible();
    expect((await (await request.get(api("stream/manifest"))).json()).status).toBe("LIVE");
    const playhead = await listener.getByTestId("player-audio").evaluate(node => (node as HTMLAudioElement).currentTime);
    await expect.poll(() => listener.getByTestId("player-audio").evaluate(node => (node as HTMLAudioElement).currentTime)).toBeGreaterThan(playhead);
  } finally {
    try {
      if (staff) for (const [key, value] of originals) await putSetting(staff, key, value);
      // The API has no delete-setting route. Exact fixture restoration also
      // removes rows this case created after publishing the default flags.
      if (absentSettings.length) localDb(`await p.setting.deleteMany({where:{key:{in:${JSON.stringify(absentSettings)}}}});`);
    } finally {
      await Promise.allSettled([listenerContext?.close(), boothContext?.close(), staff?.dispose()]);
      await broadcast.cleanup(); user?.cleanup();
    }
  }
});

test("AC-13: listener and booth focus preserve reading position, keyboard jump works, mobile composer remains visible", async ({ browser, request }, testInfo) => {
  const broadcast = await startIntegrityBroadcast(request);
  let user: ReturnType<typeof seedListener> | undefined;
  let listenerContext: BrowserContext | undefined;
  let boothContext: BrowserContext | undefined;
  try {
    user = seedListener("CAMPUS");
    listenerContext = await browser.newContext();
    boothContext = await browser.newContext();
    localDb(`await p.chatMessage.createMany({data:Array.from({length:65},(_,n)=>({episodeId:${JSON.stringify(broadcast.episodeId)},userId:${JSON.stringify(user.id)},content:'Earlier message '+n+' with enough text to wrap naturally while reading chat.',createdAt:new Date(Date.now()-65000+n*1000)}))});`);
    const listener = await listenerContext.newPage();
    const studio = await boothContext.newPage();
    await signIn(listener, user.email);
    await unlockLiveStudio(studio, broadcast);
    for (const [page, focusName, feedId] of [[listener, "Focus live chat", "engagement-chat-feed"], [studio, "Focus booth chat", "studio-chat-feed"]] as const) {
      await page.getByRole("button", { name: focusName, exact: true }).click();
      const feed = page.getByTestId("chat-focus-dialog").getByTestId(feedId);
      await feed.evaluate(el => { el.scrollTop = 20; el.dispatchEvent(new Event("scroll")); });
      const before = await feed.evaluate(el => el.scrollTop);
      const sent = await broadcast.stationPost("studio/chat", { content: `New message while reading ${feedId}` });
      expect(sent.ok(), await sent.text()).toBe(true);
      const jump = page.getByTestId("chat-focus-dialog").getByTestId("chat-new-messages");
      await expect(jump).toBeVisible();
      expect(await feed.evaluate(el => el.scrollTop)).toBeCloseTo(before, 0);
      await jump.focus(); await page.keyboard.press("Enter");
      await expect(jump).toHaveCount(0);
      expect(await feed.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(49);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: focusName, exact: true })).toBeFocused();
    }
    await listener.setViewportSize({ width: 390, height: 844 });
    await listener.getByRole("button", { name: "Focus live chat", exact: true }).click();
    const dialog = listener.getByTestId("chat-focus-dialog");
    await expect.poll(() => dialog.boundingBox()).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
    const composer = dialog.getByTestId("listen-chat-input");
    await expect(composer).toBeVisible();
    const pollCard = dialog.getByTestId("engagement-poll");
    await expect(pollCard).toContainText("No live poll right now.");
    // Visibility alone accepts text clipped by an overflow:hidden flex item.
    // The full poll content must fit its own card while the feed scrolls.
    await expect.poll(
      () => pollCard.evaluate(element => element.scrollHeight - element.clientHeight),
      { message: "The poll card must not shrink and clip its content in chat focus" },
    ).toBeLessThanOrEqual(1);
    const rect = await composer.boundingBox();
    expect(rect).not.toBeNull(); expect(rect!.y + rect!.height).toBeLessThanOrEqual(844);
    await composer.fill("Mobile focus composer stays reachable");
    await dialog.getByRole("button", { name: "Send", exact: true }).click();
    await expect(dialog.getByText("Mobile focus composer stays reachable", { exact: true })).toBeVisible();
    await listener.screenshot({ path: testInfo.outputPath("mobile-chat-focus.png") });
    await dialog.getByRole("button", { name: "Exit focus mode" }).click();
    await expect(listener.getByRole("button", { name: "Focus live chat", exact: true })).toBeFocused();
  } finally { await Promise.allSettled([listenerContext?.close(), boothContext?.close()]); await broadcast.cleanup(); user?.cleanup(); }
});
