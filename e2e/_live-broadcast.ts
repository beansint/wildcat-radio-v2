import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, type APIRequestContext } from '@playwright/test';
import { API_BASE, execBackendTsx } from './_fixtures';
import { requireLocalServices } from './_local-services';

/** Real station auth, lease, time-in, heartbeat and manifest; no browser interception. */
export async function startLocalBroadcast(request: APIRequestContext) {
  const services = await requireLocalServices(request);
  const id = `e2e-hls-${randomBytes(8).toString('hex')}`;
  const token = randomBytes(32).toString('hex');
  const snapshotDir = mkdtempSync(path.join(tmpdir(), 'wildcat-e2e-hls-'));
  const snapshotRoot = path.resolve(tmpdir());
  const snapshotPath = path.join(snapshotDir, 'snapshot.json');
  const headers = { Authorization: `Bearer ${token}`, 'x-wildcat-device-id': id };
  const stationPost = (route: string, data: unknown = {}) => request.post(`${API_BASE}/api/${route}`, { headers, data });
  let timer: NodeJS.Timeout | undefined;
  let pendingBeat = Promise.resolve();
  let heartbeatError: Error | undefined;
  let episodeId: string | undefined;
  const cleanup = async () => {
    if (timer) clearInterval(timer);
    await pendingBeat;
    // This directory was freshly created above; delete no caller-selected paths.
    if (existsSync(snapshotPath)) {
      const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
      if (snapshot.owner !== id || !Array.isArray(snapshot.episodes) || !Array.isArray(snapshot.health) || !Array.isArray(snapshot.stations)) {
        throw new Error('Refusing to restore an invalid broadcast snapshot');
      }
      execBackendTsx(`import { PrismaService } from './src/prisma/prisma.service';
        const p=new PrismaService(); async function main(){
          await p.$transaction(async tx => {
            // Creation of this random station is the transaction's commit marker.
            // An absent row means initial setup rolled back: restore nothing.
            if(!await tx.stationSession.findUnique({where:{id:${JSON.stringify(id)}}}))return;
            const ids=(await tx.episode.findMany({where:{attendance:{some:{rosterId:${JSON.stringify(id)}}}},select:{id:true}})).map(e=>e.id);
            await tx.listenerSession.deleteMany({where:{episodeId:{in:ids}}});
            await tx.episodeMinuteSample.deleteMany({where:{episodeId:{in:ids}}});
            await tx.episodeAnalyticsSnapshot.deleteMany({where:{episodeId:{in:ids}}});
            await tx.attendanceRecord.deleteMany({where:{rosterId:${JSON.stringify(id)}}});
            await tx.episode.deleteMany({where:{id:{in:ids}}});
            await tx.rosterEntry.deleteMany({where:{id:${JSON.stringify(id)}}});
            await tx.stationSession.deleteMany({where:{id:${JSON.stringify(id)}}});
            await tx.streamHealth.deleteMany({});
            const snapshot=${JSON.stringify(snapshot)};
            for(const row of snapshot.episodes)await tx.episode.update({where:{id:row.id},data:{endedAt:row.endedAt,status:row.status}});
            for(const row of snapshot.stations)await tx.stationSession.update({where:{id:row.id},data:{isActive:row.isActive}});
            for(const row of snapshot.health){for(const key of ['lastHeartbeatAt','lastSegmentAt','lastPublishedAt','sourceStaleSince','degradedSince','updatedAt'])if(row[key])row[key]=new Date(row[key]); await tx.streamHealth.create({data:row});}
          }, {timeout:15000});
          await p.$disconnect();
        } main().catch(e=>{console.error(e);process.exit(1)});`);
    }
    const resolvedSnapshot = path.resolve(snapshotDir);
    if (path.dirname(resolvedSnapshot) !== snapshotRoot || !path.basename(resolvedSnapshot).startsWith('wildcat-e2e-hls-')) {
      throw new Error('Refusing to remove a snapshot outside the owned temporary directory');
    }
    rmSync(resolvedSnapshot, { recursive: true });
    if (heartbeatError) throw heartbeatError;
  };
  try {
    execBackendTsx(`import { createHash } from 'node:crypto'; import { writeFileSync } from 'node:fs'; import { PrismaService } from './src/prisma/prisma.service';
      const p=new PrismaService(); async function main(){
        await p.$transaction(async tx => {
        const episodes=await tx.episode.findMany({where:{startedAt:{not:null},endedAt:null}});
        const health=await tx.streamHealth.findMany();
        const stations=await tx.stationSession.findMany({where:{isActive:true},select:{id:true,isActive:true}});
        writeFileSync(${JSON.stringify(snapshotPath)},JSON.stringify({owner:${JSON.stringify(id)},episodes,health,stations}));
        await tx.episode.updateMany({where:{id:{in:episodes.map(e=>e.id)}},data:{endedAt:new Date(),status:'OFF_AIR'}});
        await tx.streamHealth.deleteMany({});
        await tx.rosterEntry.create({data:{id:${JSON.stringify(id)},displayName:'Local HLS fixture',isActive:true}});
        await tx.stationSession.updateMany({where:{id:{in:stations.map(s=>s.id)}},data:{isActive:false}});
        await tx.stationSession.create({data:{id:${JSON.stringify(id)},deviceId:${JSON.stringify(id)},label:'Local HLS fixture',tokenHash:createHash('sha256').update(${JSON.stringify(token)}).digest('hex'),generation:1}});
        }, {timeout:15000});
        await p.$disconnect();
      } main().catch(e=>{console.error(e);process.exit(1)});`);
    const leaseResponse = await stationPost('stream/publisher-lease');
    expect(leaseResponse.ok(), await leaseResponse.text()).toBe(true);
    const lease = await leaseResponse.json() as { stationId: string; generation: number; prefix: string; ttlMs: number };
    expect(lease.stationId).toBe(id);
    expect(lease.generation).toBe(1);
    expect(lease.prefix).toBe(`stations/${id}/1/`);
    expect(lease.ttlMs).toBeGreaterThan(0);
    const timeIn = await stationPost('studio/time-in', { rosterId: id });
    expect(timeIn.ok(), await timeIn.text()).toBe(true);
    episodeId = (await timeIn.json()).episodeId;
    const beat = async () => {
      const now = new Date().toISOString();
      const response = await stationPost('stream/heartbeat', { sourceConnected: true, lastSegmentAt: now, lastPublishedAt: now, publisherGeneration: lease.generation });
      expect(response.ok(), await response.text()).toBe(true);
      const body = await response.json();
      expect(body.publisherLease.stationId).toBe(id);
      expect(body.status).toBe('LIVE');
    };
    await beat();
    timer = setInterval(() => {
      pendingBeat = pendingBeat.then(beat).catch((error: Error) => { heartbeatError = error; });
    }, 4_000);
    const manifestResponse = await request.get(`${API_BASE}/api/stream/manifest`);
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json();
    expect(manifest.status).toBe('LIVE');
    expect(manifest.episodeId).toBe(episodeId);
    expect(manifest.url).toBe(`${services.delivery}/${lease.prefix}live.m3u8`);
    return { episodeId: episodeId!, manifestUrl: manifest.url as string, services, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
