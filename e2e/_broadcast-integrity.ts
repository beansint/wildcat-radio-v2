import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { ACCOUNTS, PASSWORD, API_BASE, WEB_BASE, assertLocalPlaywrightEnvironment, execBackendTsx, type Role } from './_fixtures';
import { startLocalBroadcast } from './_live-broadcast';

const ownedEpisodes: string[] = [];
const ownedStations: string[] = [];
const ownedShows: string[] = [];
const ownedRuns: string[] = [];
export async function startIntegrityBroadcast(request: APIRequestContext, options: { scheduled?: boolean } = {}) {
  const broadcast = await startLocalBroadcast(request, options);
  ownedEpisodes.push(broadcast.episodeId);
  ownedStations.push(broadcast.stationId);
  if (options.scheduled) ownedShows.push(broadcast.stationId);
  return broadcast;
}
export function assertIntegrityCleanup() {
  const remaining = localDb<{ episodes: number; stations: number; shows: number; runs: number }>(`
    return { episodes:await p.episode.count({where:{id:{in:${JSON.stringify(ownedEpisodes)}}}}), stations:await p.stationSession.count({where:{id:{in:${JSON.stringify(ownedStations)}}}}), shows:await p.show.count({where:{id:{in:${JSON.stringify(ownedShows)}}}}), runs:await p.analyticsProcessRun.count({where:{id:{in:${JSON.stringify(ownedRuns)}}}}) };`);
  expect(remaining).toEqual({ episodes: 0, stations: 0, shows: 0, runs: 0 });
}
/** All scripts inherit the validated explicit loopback DB; never load dotenv. */
export function localDb<T>(body: string): T {
  assertLocalPlaywrightEnvironment(process.env);
  const dir = mkdtempSync(path.join(tmpdir(), 'wildcat-integrity-'));
  const file = path.join(dir, 'result.json');
  try {
    execBackendTsx(`import { writeFileSync } from 'node:fs'; import { PrismaService } from './src/prisma/prisma.service';
      const p=new PrismaService(); async function main(){ try { const result=await (async()=>{${body}})(); writeFileSync(${JSON.stringify(file)},JSON.stringify(result??null)); } finally { await p.$disconnect(); } }
      main().catch(e=>{console.error(e);process.exit(1)});`);
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } finally {
    if (path.dirname(path.resolve(dir)) !== path.resolve(tmpdir()) || !path.basename(dir).startsWith('wildcat-integrity-')) throw Error('Unsafe result directory');
    rmSync(dir, { recursive: true });
  }
}
export function episodeRows(episodeId: string) {
  return localDb<{ reactions: number; chats: { id: string; content: string; isHidden: boolean }[]; sessions: { anonId: string; endedAt: string | null; identityQuality: string }[]; endedAt: string | null }>(`
    const episodeId=${JSON.stringify(episodeId)};
    return { reactions:await p.reaction.count({where:{episodeId}}), chats:await p.chatMessage.findMany({where:{episodeId},select:{id:true,content:true,isHidden:true}}), sessions:await p.listenerSession.findMany({where:{episodeId},select:{anonId:true,endedAt:true,identityQuality:true}}), endedAt:(await p.episode.findUniqueOrThrow({where:{id:episodeId},select:{endedAt:true}})).endedAt };`);
}
export async function unlockLiveStudio(page: Page, broadcast: Awaited<ReturnType<typeof startLocalBroadcast>>) {
  const response = await broadcast.stationPost('studio/handoff');
  expect(response.ok(), await response.text()).toBe(true);
  const { handoff } = await response.json();
  await page.goto(`${WEB_BASE}/listen#station_handoff=${encodeURIComponent(handoff)}`);
  await page.waitForURL(`${WEB_BASE}/studio`);
  await page.getByTestId('studio-seg-console').click();
  await expect(page.getByTestId('studio-hype-bars')).toBeVisible();
}
export async function endBroadcast(broadcast: Awaited<ReturnType<typeof startLocalBroadcast>>) {
  await broadcast.stopHeartbeat();
  const response = await broadcast.stationPost('studio/time-out', { rosterId: broadcast.stationId, confirmEnd: true });
  expect(response.ok(), await response.text()).toBe(true);
}
export async function play(page: Page) {
  await expect(page.getByTestId('player-status')).toHaveText('LIVE', { timeout: 20_000 });
  if (await page.getByTestId('player-audio').evaluate(audio => (audio as HTMLAudioElement).paused)) await page.getByTestId('player-play').click();
  await page.waitForFunction(() => {
    const audio = document.querySelector<HTMLAudioElement>('[data-testid="player-audio"]');
    return audio && !audio.paused && audio.currentTime > 0;
  }, undefined, { timeout: 20_000 });
}

/** Fixed dates relative to yesterday avoid dependence on accumulated station rows. */
export function seedStaffEpisodes(extraCount = 0) {
  const prefix = `e2e-integrity-${randomUUID()}`;
  const date = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const start = new Date(`${date}T00:00:00+08:00`).getTime();
  const end = start + 86_400_000;
  const ids = { before: `${prefix}-before`, archived: `${prefix}-archived`, complete: `${prefix}-complete`, pending: `${prefix}-pending`, after: `${prefix}-after` };
  const showId = `${prefix}-show`;
  const runId = `${prefix}-foreign-run`;
  const extraIds = Array.from({ length: extraCount }, (_, index) => `${prefix}-page-${index}`);
  const allIds = [...Object.values(ids), ...extraIds];
  ownedEpisodes.push(...allIds);
  ownedShows.push(showId);
  ownedRuns.push(runId);
  localDb(`await p.$transaction(async tx=>{
    await tx.show.create({data:{id:${JSON.stringify(showId)},name:'Archived integrity fixture',slug:${JSON.stringify(showId)},archivedAt:new Date()}});
    const rows=${JSON.stringify([
      {id:ids.before,time:start-1,status:'unavailable'},
      {id:ids.archived,time:start,status:'unavailable',showId},
      {id:ids.complete,time:start+3600000,status:'complete'},
      {id:ids.pending,time:end-1,status:'pending'},
      {id:ids.after,time:end,status:'unavailable'},
      ...extraIds.map((id, index) => ({ id, time: start + 2 * 3600000 + index * 1000, status: 'unavailable', showId })),
    ])};
    for(const row of rows) await tx.episode.create({data:{id:row.id,title:row.id,showId:row.showId??null,unscheduled:!row.showId,status:'OFF_AIR',startedAt:new Date(row.time),endedAt:new Date(row.time+60000),analyticsStatus:row.status,analyticsLastAttemptAt:new Date(),analyticsRawPrunedAt:row.status==='unavailable'?new Date():null,lifecycleRevision:1}});
    // A foreign process still durably observes this open session. Real orphan
    // recovery and summary reconciliation must leave its measurement pending.
    await tx.analyticsProcessRun.create({data:{id:${JSON.stringify(runId)},startedAt:new Date(${end - 1}),lastObservedAt:new Date()}});
    await tx.listenerSession.create({data:{episodeId:${JSON.stringify(ids.pending)},runId:${JSON.stringify(runId)},startedAt:new Date(${end - 1}),anonId:${JSON.stringify(randomUUID())},identityQuality:'episode-browser-v1',lifecycleRevision:1}});
    await tx.episodeAnalyticsSnapshot.create({data:{episodeId:${JSON.stringify(ids.complete)},lifecycleRevision:1,measurementVersion:'episode-browser-v1',sampleCount:0,expectedSamples:1,interruptedSessions:1,fallbackSessions:0,peak:0,average:0,reach:3,tlh:1,tsl:20,retention:[],engagement:{chatMessages:2,reactions:4,queueByType:{SONG_REQUEST:1},queueByStatus:{ACCEPTED:1}}}});
  });`);
  let heartbeatError: unknown;
  const heartbeat = setInterval(() => {
    try {
      localDb(`await p.analyticsProcessRun.update({where:{id:${JSON.stringify(runId)}},data:{lastObservedAt:new Date()}});`);
    } catch (error) {
      heartbeatError = error;
      clearInterval(heartbeat);
    }
  }, 10_000);
  return { ids, extraIds, date, start, end, showId, cleanup() {
    clearInterval(heartbeat);
    localDb(`const ids=${JSON.stringify(allIds)}; await p.$transaction(async tx=>{await tx.listenerSession.deleteMany({where:{episodeId:{in:ids}}});await tx.episodeMinuteSample.deleteMany({where:{episodeId:{in:ids}}});await tx.episodeAnalyticsSnapshot.deleteMany({where:{episodeId:{in:ids}}});await tx.episode.deleteMany({where:{id:{in:ids}}});await tx.show.delete({where:{id:${JSON.stringify(showId)}}});await tx.analyticsProcessRun.delete({where:{id:${JSON.stringify(runId)}}});}); if(await p.episode.count({where:{id:{in:ids}}})||await p.analyticsProcessRun.count({where:{id:${JSON.stringify(runId)}}}))throw Error('Leaked integrity episodes or process run');`);
    if (heartbeatError) throw heartbeatError;
  } };
}
export const api = (route: string) => `${API_BASE}/api/${route}`;
export async function loginIntegrityAs(page: Page, role: Role) {
  await page.goto(`${WEB_BASE}/login`);
  await page.getByTestId('auth-email').fill(ACCOUNTS[role]);
  await page.getByTestId('auth-password').fill(PASSWORD);
  const response = page.waitForResponse(r => r.url() === api('auth/sign-in/email') && r.request().method() === 'POST');
  await page.getByTestId('auth-submit').click();
  const signedIn = await response;
  expect(signedIn.ok(), `Sign-in ${signedIn.status()}: ${await signedIn.text()}`).toBe(true);
  await page.waitForURL(url => url.origin === new URL(WEB_BASE).origin && url.pathname === (role === 'listener' ? '/' : '/mod/roster'));
}
