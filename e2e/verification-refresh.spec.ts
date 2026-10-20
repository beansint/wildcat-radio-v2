import { expect, test } from '@playwright/test';
import { API_BASE as api, WEB_BASE as web, assertLocalPlaywrightEnvironment } from './_fixtures';
import { fixtureSql as sql } from './_sql';
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";

test('same account verification in another tab refreshes chat authorization without reload or duplicate sockets', async ({ page, context, request }) => {
  assertLocalPlaywrightEnvironment(process.env);
  const suffix = Date.now().toString(); const email = `verify_refresh_${suffix}@cit.edu`; const handle = `vr${suffix}`; const episode = `verify-refresh-${suffix}`;
  const signup = await request.post(`${api}/api/auth/sign-up/email`, { headers: { Origin: web }, data: { email, name: 'Verification fixture', handle, password: 'Password123!' } });
  expect(signup.ok()).toBeTruthy(); const userId = (await signup.json()).user.id as string;

  let socketCount = 0; let activeSockets = 0;
  await page.routeWebSocket('**/socket.io/**', socket => {
    socketCount++; activeSockets++;
    const upstream = socket.connectToServer();
    let closed = false;
    const recordClose = () => { if (!closed) { activeSockets--; closed = true; } };
    socket.onClose((code, reason) => { recordClose(); void upstream.close({ code, reason }); });
    upstream.onClose((code, reason) => { recordClose(); void socket.close({ code, reason }); });
    // Control unavailable stream metadata only; authentication, joins, chat and acknowledgements use the real gateway.
    upstream.onMessage(message => { if (!String(message).includes('\"stream:status\"')) socket.send(message); });
  });
  await page.route('**/api/stream/manifest', route => route.fulfill({ json: { status: 'LIVE', type: 'hls', url: null, reason: null, dj: [], episodeId: episode, showId: null, showName: null } }));
  try {
    sql(`UPDATE episodes SET "endedAt"=NOW(),status='OFF_AIR' WHERE "startedAt" IS NOT NULL AND "endedAt" IS NULL; INSERT INTO episodes (id,"createdAt","startedAt") VALUES (${quote(episode)},NOW(),NOW());`);
    const login = await context.request.post(`${api}/api/auth/sign-in/email`, { headers: { Origin: web }, data: { email, password: 'Password123!' } }); expect(login.ok()).toBeTruthy();
    await page.goto('/listen'); await expect(page.getByTestId('listen-gate-verify').first()).toBeVisible();
    await expect.poll(() => socketCount).toBeGreaterThan(0);
    await page.waitForTimeout(1000);
    const beforeVerification = socketCount;
    const other = await context.newPage(); await other.goto('/verify-email'); await other.bringToFront();
    // Represents the trusted server verification write; no real email provider or token delivery is exercised.
    sql(`UPDATE users SET "emailVerified"=true WHERE id=${quote(userId)};`);
    await page.bringToFront(); await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByTestId('listen-chat-input').first()).toBeVisible();
    await expect.poll(() => socketCount).toBeGreaterThan(beforeVerification);
    const input = page.getByTestId('listen-chat-input').first(); await input.focus(); const content = `Verified without reload ${suffix}`; await input.fill(content); await input.press('Enter');
    await expect(page.getByTestId('engagement-chat-feed').getByText(content, { exact: true })).toHaveCount(1);
    expect(sql(`SELECT COUNT(*) FROM chat_messages WHERE "episodeId"=${quote(episode)} AND content=${quote(content)};`)).toBe('1');
    await expect.poll(() => activeSockets).toBe(1);
    for (const change of ['claims', 'session'] as const) {
      const previous = socketCount;
      await other.bringToFront();
      if (change === 'claims') sql(`UPDATE users SET class='CAMPUS', role='MODERATOR' WHERE id=${quote(userId)};`);
      else expect((await context.request.post(`${api}/api/auth/sign-in/email`, { headers: { Origin: web }, data: { email, password: 'Password123!' } })).ok()).toBeTruthy();
      await page.waitForTimeout(5100); // Better Auth's documented source focus refresh throttle.
      await page.bringToFront(); await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await expect.poll(() => socketCount).toBeGreaterThan(previous);
      await expect.poll(() => activeSockets).toBe(1);
    }
    const stableConnections = socketCount;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(1000); expect(socketCount).toBe(stableConnections);
    await other.close();
  } finally {
    await page.goto('about:blank');
    sql(`DELETE FROM chat_messages WHERE "episodeId"=${quote(episode)}; DELETE FROM episodes WHERE id=${quote(episode)}; DELETE FROM consent_records WHERE "userId"=${quote(userId)}; DELETE FROM users WHERE id=${quote(userId)};`);
  }
});
