import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { API_BASE, WEB_BASE, PASSWORD, assertLocalPlaywrightEnvironment } from './_fixtures';
import { localDb } from './_broadcast-integrity';
import { openProfile, type ProfileAccount } from './_profile-fixtures';
import { attachConsoleGuard, type ConsoleGuard } from './_console';
import { audioPlaying } from './_live-path-mocks';

// Actual HTTP/auth/PG/Socket.IO throughout. Media is local ffmpeg AAC/HLS.
const accounts: ProfileAccount[] = [];
const contexts: APIRequestContext[] = [];
type ObservedSocket = { openedAt: number; namespaceConnectSentAt?: number; namespaceConnectedAt?: number; closedAt?: number };
const cancelledHandshakeWarning = `[warning] WebSocket connection to '${new URL(API_BASE).origin.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket' failed: WebSocket is closed before the connection is established.`;
const diagnostics: { label: string; page: Page; guard: ConsoleGuard; pageErrors: string[]; media: string[]; sockets: ObservedSocket[] }[] = [];
let live: Awaited<ReturnType<typeof startChatBroadcast>> | undefined;
let mediaOrigin: string | undefined;

function observe(page: Page, label: string) {
  const entry = { label, page, guard: attachConsoleGuard(page), pageErrors: [] as string[], media: [] as string[], sockets: [] as ObservedSocket[] };
  page.on('request', r => { if (mediaOrigin && r.url().startsWith(`${mediaOrigin}/`)) entry.media.push(r.url()); });
  page.on('pageerror', error => entry.pageErrors.push(error.message));
  page.on('websocket', socket => {
    if (!socket.url().startsWith(`${new URL(API_BASE).origin.replace(/^http/, 'ws')}/socket.io/`)) return;
    const event: ObservedSocket = { openedAt: Date.now() };
    entry.sockets.push(event);
    socket.on('framesent', frame => {
      if (/^40(?:\{|$)/.test(frame.payload.toString())) event.namespaceConnectSentAt ??= Date.now();
    });
    socket.on('framereceived', frame => {
      if (/^40(?:\{|$)/.test(frame.payload.toString())) event.namespaceConnectedAt ??= Date.now();
    });
    socket.on('close', () => { event.closedAt = Date.now(); });
  });
  diagnostics.push(entry);
  return entry;
}

async function account(api: APIRequestContext, label: string) {
  contexts.push(api);
  const handle = `comb_${label}_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const email = `${handle}@example.com`;
  const response = await api.post(`${API_BASE}/api/auth/sign-up/email`, { headers: { Origin: WEB_BASE }, data: { email, password: PASSWORD, handle, name: `Combined ${label}` } });
  expect(response.ok(), `Synthetic ${label} signup`).toBe(true);
  const subject = { id: (await response.json()).user.id as string, email, handle, api };
  accounts.push(subject);
  localDb(`await p.user.update({where:{id:${JSON.stringify(subject.id)}},data:{emailVerified:true,notifyEmail:false,notifyInApp:false,yearLevel:'2',college:'Combined private college',gender:'female'}});`);
  return subject;
}

async function signIn(page: Page, subject: ProfileAccount) {
  await page.goto(`${WEB_BASE}/login`);
  // Let an existing owner resolve before editing its keyed login form.
  await expect(page.getByTestId('auth-submit')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByTestId('auth-email').fill(subject.email);
  await page.getByTestId('auth-password').fill(PASSWORD);
  const response = page.waitForResponse(r => r.url() === `${API_BASE}/api/auth/sign-in/email` && r.request().method() === 'POST');
  await page.getByTestId('auth-submit').click();
  expect((await response).ok()).toBe(true);
  await expect(page.getByTestId('account-menu-trigger')).toHaveAttribute('aria-label', new RegExp(subject.handle));
}

async function report(info: TestInfo) {
  const entries = await Promise.all(diagnostics.map(async d => {
    const audio = await d.page.getByTestId('player-audio').evaluate((a: HTMLAudioElement) => ({ src: a.currentSrc, paused: a.paused, time: a.currentTime, ready: a.readyState, error: a.error?.message })).catch(() => null);
    return { label: d.label, errors: d.guard.errors(), badResponses: d.guard.badResponses(), pageErrors: d.pageErrors, sockets: d.sockets, media: d.media, audio };
  }));
  const file = info.outputPath('browser-diagnostics.json');
  writeFileSync(file, JSON.stringify(entries, null, 2));
  await info.attach('browser-diagnostics', { path: file, contentType: 'application/json' });
  for (const entry of entries) {
    expect(entry.pageErrors, `${entry.label} browser runtime errors`).toEqual([]);
    // Full navigation/owner transitions intentionally cancel pending browser
    // handshakes. Keep this exact API-origin warning in the report; all other
    // diagnostics fail. The test asserts the successful namespace transition,
    // audio continuity and persisted actor directly instead of warning counts.
    expect(entry.errors.filter(error => error !== cancelledHandshakeWarning), `${entry.label} unexpected browser diagnostics`).toEqual([]);
    expect(entry.badResponses, `${entry.label} unexpected HTTP failures`).toEqual([]);
  }
}

test.afterEach(async ({}, info) => {
  try { await report(info); }
  finally {
    if (live) { await live.cleanup(); live = undefined; }
    mediaOrigin = undefined;
    const ids = accounts.splice(0).map(a => a.id);
    if (ids.length) {
      const remaining = localDb<number>(`
        const ids=${JSON.stringify(ids)};
        const crypto=await import('./src/auth/auth-email-crypto');
        const hash=crypto.authEmailIdentityHash??crypto.default?.authEmailIdentityHash;
        const hashes=ids.map(id=>hash('account',id));
        await p.$transaction(async tx=>{
          await tx.authEmailJob.deleteMany({where:{accountHash:{in:hashes}}});
          await tx.staffAuditLog.deleteMany({where:{actorId:{in:ids}}});
          await tx.verification.deleteMany({where:{value:{in:ids}}});
          await tx.consentRecord.deleteMany({where:{userId:{in:ids}}});
          await tx.notification.deleteMany({where:{userId:{in:ids}}});
          await tx.session.deleteMany({where:{userId:{in:ids}}});
          await tx.account.deleteMany({where:{userId:{in:ids}}});
          await tx.user.deleteMany({where:{id:{in:ids}}});
        });
        return p.user.count({where:{id:{in:ids}}});
      `);
      expect(remaining, 'Only this run’s synthetic account fixtures are removed').toBe(0);
    }
    for (const api of contexts.splice(0)) await api.dispose();
    diagnostics.splice(0);
  }
});

test('combined account edge: browser erasure persists a terminal subject and revokes issued reset material', async ({ page, playwright }, info) => {
  assertLocalPlaywrightEnvironment(process.env);
  observe(page, 'erase');
  const subject = await account(await playwright.request.newContext(), 'erase');
  await openProfile(page, subject);
  // Signup's real verification intent shares the 60-second mailbox budget.
  // Age only this synthetic fixture's intent so reset delivery is also admitted.
  localDb(`const crypto=await import('./src/auth/auth-email-crypto'); const hash=crypto.authEmailIdentityHash??crypto.default?.authEmailIdentityHash; await p.authEmailJob.updateMany({where:{accountHash:hash('account',${JSON.stringify(subject.id)})},data:{createdAt:new Date(Date.now()-61_000)}});`);
  const reset = await subject.api.post(`${API_BASE}/api/auth/request-password-reset`, { headers: { Origin: WEB_BASE }, data: { email: subject.email, redirectTo: `${WEB_BASE}/reset-password` } });
  expect(reset.ok()).toBe(true);
  const verification = localDb<{ identifier: string }>(`return p.verification.findFirstOrThrow({where:{value:${JSON.stringify(subject.id)},identifier:{startsWith:'reset-password:'}}});`);
  await page.goto('/my-data');
  await page.getByTestId('privacy-erase-open').click();
  const confirm = page.getByTestId('privacy-erase-confirm-button');
  await expect(confirm).toBeDisabled();
  await page.getByTestId('privacy-erase-confirm').fill('delete');
  await expect(confirm).toBeDisabled();
  await page.getByTestId('privacy-erase-confirm').fill('DELETE');
  const erased = page.waitForResponse(r => r.url() === `${API_BASE}/api/me/data` && r.request().method() === 'DELETE');
  await confirm.click();
  expect((await erased).ok()).toBe(true);
  await expect(page).toHaveURL(`${WEB_BASE}/`);
  await expect(page.getByTestId('account-menu-trigger')).not.toBeVisible();
  const persisted = localDb<{ user: { anonymizedAt: string | null; name: string; college: string | null }; accounts: number; sessions: number; resets: number }>(`
    const userId=${JSON.stringify(subject.id)};
    return {user:await p.user.findUniqueOrThrow({where:{id:userId},select:{anonymizedAt:true,name:true,college:true}}),accounts:await p.account.count({where:{userId}}),sessions:await p.session.count({where:{userId}}),resets:await p.verification.count({where:{value:userId,identifier:{startsWith:'reset-password:'}}})};
  `);
  expect(persisted.user.anonymizedAt).not.toBeNull();
  expect(persisted).toMatchObject({ user: { name: 'Deleted account', college: null }, accounts: 0, sessions: 0, resets: 0 });
  expect((await subject.api.get(`${API_BASE}/api/users/me`)).status()).toBe(401);
  const recovered = await subject.api.post(`${API_BASE}/api/auth/reset-password`, { headers: { Origin: WEB_BASE }, data: { token: verification.identifier.slice('reset-password:'.length), newPassword: PASSWORD } });
  expect(recovered.status()).toBe(400);
  await page.screenshot({ path: info.outputPath('erased-public-browser.png'), fullPage: true });
  await info.attach('persisted-erasure', { body: JSON.stringify(persisted, null, 2), contentType: 'application/json' });
});

async function startChatBroadcast(api: APIRequestContext) {
  const id = `combined_${randomUUID().replaceAll('-', '')}`;
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const baselineHealth = localDb<unknown>(`
    if(await p.episode.count({where:{startedAt:{not:null},endedAt:null}})||await p.stationSession.count({where:{isActive:true,leaseExpiresAt:{gt:new Date()}}}))throw Error('Another broadcast owns this local fixture database');
    const health=await p.streamHealth.findUnique({where:{id:'primary'}});
    await p.$transaction(async tx=>{
      await tx.rosterEntry.create({data:{id:${JSON.stringify(id)},displayName:'Combined local booth',isActive:true}});
      await tx.stationSession.create({data:{id:${JSON.stringify(id)},deviceId:${JSON.stringify(id)},label:'Combined browser fixture',tokenHash:${JSON.stringify(tokenHash)},generation:1}});
    }); return health;
  `);
  const headers = { Authorization: `Bearer ${token}`, 'x-wildcat-device-id': id };
  const post = (path: string, data: object = {}) => api.post(`${API_BASE}/api/${path}`, { headers, data });
  let episodeId = '';
  let timer: ReturnType<typeof setInterval> | undefined;
  let pending = Promise.resolve();
  let error: unknown;
  const cleanup = async () => {
    if (timer) clearInterval(timer);
    await pending;
    if (episodeId) {
      const ended = await post('studio/time-out', { rosterId: id, confirmEnd: true });
      expect(ended.ok(), await ended.text()).toBe(true);
    }
    const remaining = localDb<number>(`
      const id=${JSON.stringify(id)},episodeId=${JSON.stringify(episodeId)};
      await p.$transaction(async tx=>{
        if(episodeId){
          await tx.chatMessage.deleteMany({where:{episodeId}});
          await tx.reaction.deleteMany({where:{episodeId}});
          await tx.queueItem.deleteMany({where:{episodeId}});
          await tx.listenerSession.deleteMany({where:{episodeId}});
          await tx.episodeMinuteSample.deleteMany({where:{episodeId}});
          await tx.episodeAnalyticsSnapshot.deleteMany({where:{episodeId}});
          await tx.attendanceRecord.deleteMany({where:{episodeId,rosterId:id}});
          await tx.broadcastActivityLog.deleteMany({where:{episodeId}});
          await tx.episode.deleteMany({where:{id:episodeId}});
        }
        await tx.rosterEntry.deleteMany({where:{id}});
        await tx.streamHealth.deleteMany({where:{publisherStationId:id}});
        const baseline=${JSON.stringify(baselineHealth)};
        if(baseline&&!await tx.streamHealth.findUnique({where:{id:'primary'}})){
          for(const key of ['lastHeartbeatAt','lastSegmentAt','lastPublishedAt','sourceStaleSince','degradedSince','updatedAt'])if(baseline[key])baseline[key]=new Date(baseline[key]);
          await tx.streamHealth.create({data:baseline});
        }
        await tx.stationSession.deleteMany({where:{id}});
      }); return await p.episode.count({where:{id:episodeId}})+await p.stationSession.count({where:{id}})+await p.rosterEntry.count({where:{id}});
    `);
    expect(remaining, 'Owned broadcast fixtures removed').toBe(0);
    if (error) throw error;
  };
  try {
    const leased = await post('stream/publisher-lease');
    expect(leased.ok(), await leased.text()).toBe(true);
    const lease = await leased.json();
    const timedIn = await post('studio/time-in', { rosterId: id });
    expect(timedIn.ok(), await timedIn.text()).toBe(true);
    episodeId = (await timedIn.json()).episodeId;
    const beat = async () => {
      const now = new Date().toISOString();
      const response = await post('stream/heartbeat', { sourceConnected: true, lastSegmentAt: now, lastPublishedAt: now, publisherGeneration: lease.generation });
      expect(response.ok(), await response.text()).toBe(true);
      expect((await response.json()).status).toBe('LIVE');
    };
    await beat();
    timer = setInterval(() => { pending = pending.then(beat).catch(e => { error = e; }); }, 4_000);
    return { episodeId, cleanup };
  } catch (e) { await cleanup(); throw e; }
}

test('combined identity regression: a persistent playing socket sends Bob chat as Bob after sibling login', async ({ page, context, playwright, request }, info) => {
  test.setTimeout(90_000);
  assertLocalPlaywrightEnvironment(process.env);
  const observed = observe(page, 'original-chat-tab');
  const alice = await account(await playwright.request.newContext(), 'alice');
  const bob = await account(await playwright.request.newContext(), 'bob');
  live = await startChatBroadcast(request);
  const manifest = await (await request.get(`${API_BASE}/api/stream/manifest`)).json();
  const mediaUrl = new URL(manifest.url);
  expect(mediaUrl.protocol).toBe('http:');
  expect(['127.0.0.1', 'localhost', '[::1]']).toContain(mediaUrl.hostname);
  expect([new URL(API_BASE).origin, new URL(WEB_BASE).origin]).not.toContain(mediaUrl.origin);
  mediaOrigin = mediaUrl.origin;
  const mediaDir = info.outputPath('local-hls');
  mkdirSync(mediaDir, { recursive: true });
  execFileSync(process.env.FFMPEG_EXECUTABLE ?? 'ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000',
    '-t', '180', '-c:a', 'aac', '-b:a', '64k', '-f', 'hls', '-hls_time', '2', '-hls_list_size', '0',
    '-hls_playlist_type', 'vod', '-hls_segment_filename', path.join(mediaDir, 'segment-%03d.ts'), path.join(mediaDir, 'live.m3u8'),
  ], { stdio: 'pipe', windowsHide: true });
  const assets = new Set(readdirSync(mediaDir));
  const ownedMediaPrefix = new URL('./', mediaUrl).href;
  await context.route(`${ownedMediaPrefix}**`, route => {
    const name = path.basename(new URL(route.request().url()).pathname);
    if (!assets.has(name)) return route.fulfill({ status: 404 });
    const bytes = readFileSync(path.join(mediaDir, name));
    return route.fulfill({ status: 200, contentType: name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t', headers: { 'Access-Control-Allow-Origin': '*' }, body: bytes });
  });
  await signIn(page, alice);
  const aliceSession = await playwright.request.newContext({ storageState: await context.storageState() });
  contexts.push(aliceSession);
  await page.goto('/listen');
  await expect(page.getByTestId('player-status')).toHaveText('LIVE');
  const input = page.getByTestId('listen-chat-input').filter({ visible: true }).first();
  await expect(input).toBeEnabled();
  await page.getByTestId('player-play').click();
  await expect.poll(() => audioPlaying(page)).toBe(true);
  await page.getByTestId('player-audio').evaluate(a => a.setAttribute('data-combined-original', 'true'));
  const aliceMessage = `Combined Alice control ${randomUUID()}`;
  await input.fill(aliceMessage);
  await input.press('Enter');
  await expect(page.getByTestId('engagement-chat-feed').getByText(aliceMessage, { exact: true })).toBeVisible();
  expect(localDb<{ userId: string }>(`return p.chatMessage.findFirstOrThrow({where:{episodeId:${JSON.stringify(live.episodeId)},content:${JSON.stringify(aliceMessage)}},select:{userId:true}});`).userId).toBe(alice.id);
  const namespaceConnections = () => observed.sockets.filter(socket => socket.namespaceConnectedAt !== undefined).length;
  const before = namespaceConnections();
  const sibling = await context.newPage();
  observe(sibling, 'sibling-login-tab');
  await signIn(sibling, bob);
  await page.bringToFront();
  await expect(page.getByTestId('account-menu-trigger')).toHaveAttribute('aria-label', new RegExp(bob.handle));
  await expect.poll(namespaceConnections, { message: 'Bob switch establishes exactly one fresh Socket.IO namespace connection' }).toBe(before + 1);
  await expect(page.getByTestId('player-audio')).toHaveAttribute('data-combined-original', 'true');
  await expect.poll(() => audioPlaying(page)).toBe(true);
  const bobSession = await playwright.request.newContext({ storageState: await context.storageState() });
  contexts.push(bobSession);
  expect((await (await aliceSession.get(`${API_BASE}/api/auth/get-session`)).json()).user.id).toBe(alice.id);
  expect((await (await bobSession.get(`${API_BASE}/api/auth/get-session`)).json()).user.id).toBe(bob.id);
  const bobMessage = `Combined Bob after switch ${randomUUID()}`;
  await expect(input).toBeEnabled();
  await input.fill(bobMessage);
  await input.press('Enter');
  await expect(page.getByTestId('engagement-chat-feed').getByText(bobMessage, { exact: true })).toBeVisible();
  const persisted = localDb<{ userId: string; content: string }>(`return p.chatMessage.findFirstOrThrow({where:{episodeId:${JSON.stringify(live.episodeId)},content:${JSON.stringify(bobMessage)}},select:{userId:true,content:true}});`);
  const attributionFile = info.outputPath('identity-attribution.json');
  writeFileSync(attributionFile, JSON.stringify({ aliceId: alice.id, bobId: bob.id, persisted, aliceSessionStillValid: true, bobSessionStillValid: true, originalTabNamespaceConnectionsBeforeSwitch: before, originalTabNamespaceConnectionsAfterSwitch: namespaceConnections() }, null, 2));
  await info.attach('identity-attribution', { path: attributionFile, contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath('bob-chat-original-playing-tab.png'), fullPage: true });
  expect(persisted.userId, 'Bob UI must never publish through Alice’s still-valid socket identity').toBe(bob.id);
  expect(namespaceConnections(), 'Settled account switch adds exactly one successful namespace handshake').toBe(before + 1);
});
