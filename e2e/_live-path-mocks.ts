import type { Page, Route, WebSocketRoute } from '@playwright/test';

/**
 * live-path-hardening (#127) — deterministic API + Socket.IO mocks for
 * `live-path-listener.spec.ts` / `live-path-kiosk.spec.ts`. Every backend call
 * the flows make is answered here (route-mocked), so the specs run without a
 * backend and can drive exact failure sequences (one 503, a 20 s rotation
 * blip, a stale encoder) that a live stack cannot produce on demand.
 */

export function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

// ── Socket.IO (engine.io v4, websocket transport) ────────────────────────

export interface SocketMock {
  /** Server → every connected client: `42["event", payload]`. */
  emit(event: string, payload: unknown): void;
  /** Close every open socket (the client reconnects on its own). */
  drop(): void;
  /** Number of sockets that completed the namespace handshake. */
  connections(): number;
  /** Events the client emitted (`episode:join`, …). */
  received(): Array<{ event: string; payload: unknown }>;
}

export async function mockSocket(page: Page): Promise<SocketMock> {
  const open = new Set<WebSocketRoute>();
  const received: Array<{ event: string; payload: unknown }> = [];
  let connections = 0;
  await page.routeWebSocket('**/socket.io/**', (ws) => {
    open.add(ws);
    ws.onClose(() => open.delete(ws));
    // Long ping interval: the client must not time out while a spec fast-forwards the clock.
    ws.send(`0${JSON.stringify({ sid: `eio${Date.now()}`, upgrades: [], pingInterval: 600_000, pingTimeout: 600_000, maxPayload: 1_000_000 })}`);
    ws.onMessage((message) => {
      const text = String(message);
      if (text.startsWith('40')) {
        connections += 1;
        ws.send(`40${JSON.stringify({ sid: `sio${connections}` })}`);
        return;
      }
      const match = text.match(/^42\d*(\[[\s\S]*)$/);
      if (match) {
        const [event, payload] = JSON.parse(match[1]) as [string, unknown];
        received.push({ event, payload });
      }
    });
  });
  return {
    emit(event, payload) {
      for (const ws of open) ws.send(`42${JSON.stringify([event, payload])}`);
    },
    drop() {
      for (const ws of [...open]) void ws.close({ code: 1006, reason: 'test drop' }).catch(() => {});
      open.clear();
    },
    connections: () => connections,
    received: () => [...received],
  };
}

// ── Stream manifest ───────────────────────────────────────────────────────

export interface ManifestBody {
  status: 'LIVE' | 'STATION_ROTATION' | 'OFF_AIR';
  reason: string | null;
  type: 'hls';
  url: string | null;
  dj: string[];
  episodeId: string | null;
  showId: string | null;
  showName: string | null;
  autoEndsAt?: string | null;
}

export function manifestBody(overrides: Partial<ManifestBody> = {}): ManifestBody {
  return {
    status: 'LIVE',
    reason: null,
    type: 'hls',
    url: null,
    dj: ['DJ Blip'],
    episodeId: 'live-path-episode',
    showId: 'live-path-show',
    showName: 'Signal Test Hour',
    ...overrides,
  };
}

export interface ManifestControl {
  /** Body for subsequent polls, or a status code to fail with. */
  set(next: ManifestBody | number): void;
  /** Count of manifest responses that were errors. */
  failures(): number;
  requests(): number;
}

export async function mockManifest(page: Page, initial: ManifestBody | number): Promise<ManifestControl> {
  let current = initial;
  let failures = 0;
  let requests = 0;
  await page.route('**/api/stream/manifest', (route) => {
    requests += 1;
    if (typeof current === 'number') {
      failures += 1;
      return json(route, { message: 'Controlled outage' }, current);
    }
    return json(route, current);
  });
  return {
    set: (next) => {
      current = next;
    },
    failures: () => failures,
    requests: () => requests,
  };
}

// ── Listener session + engagement ─────────────────────────────────────────

export async function mockVerifiedListener(page: Page) {
  const now = new Date().toISOString();
  await page.route('**/api/auth/get-session', (route) =>
    json(route, {
      session: {
        id: 'live-path-session',
        userId: 'live-path-user',
        token: 'test',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        createdAt: now,
        updatedAt: now,
      },
      user: {
        id: 'live-path-user',
        email: 'listener@example.test',
        name: 'Listener',
        handle: 'listener',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    }),
  );
}

export function snapshotBody(episodeId: string, recentChat: unknown[] = []) {
  return {
    episodeId,
    capturedAt: new Date().toISOString(),
    recentChat,
    polls: [],
    pinnedTopic: null,
    reactions: [],
    upNext: [],
  };
}

export async function mockEngagement(page: Page, recentChat: unknown[] = []) {
  await page.route('**/api/episodes/*/polls', (route) => json(route, []));
  await page.route('**/api/episodes/*/engagement-snapshot', (route) => {
    const episodeId = new URL(route.request().url()).pathname.split('/')[3];
    return json(route, snapshotBody(episodeId, recentChat));
  });
}

// ── Audio fixtures ────────────────────────────────────────────────────────

/** 3 minutes of a quiet 220 Hz tone — a real decodable source for Chromium's native pipeline. */
export function toneWav(): Buffer {
  const sampleRate = 8000;
  const sampleCount = sampleRate * 180;
  const wave = Buffer.alloc(44 + sampleCount * 2);
  wave.write('RIFF', 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24); wave.writeUInt32LE(sampleRate * 2, 28);
  wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36);
  wave.writeUInt32LE(sampleCount * 2, 40);
  for (let i = 0; i < sampleCount; i++) wave.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / sampleRate) * 1000), 44 + i * 2);
  return wave;
}

/**
 * Forces the native-HLS (Safari-style) branch so a plain WAV URL is played by
 * Chromium's real decoder: the recovery path under test is the media element's.
 */
export async function forceNativeHls(page: Page) {
  await page.addInitScript(() => {
    MediaSource.isTypeSupported = () => false;
    const original = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (type) {
      return type === 'application/vnd.apple.mpegurl' ? 'probably' : original.call(this, type);
    };
  });
}

export const audioPlaying = (page: Page) =>
  page.getByTestId('player-audio').evaluate((node: HTMLAudioElement) => !node.paused && node.currentTime > 0.05);
export const audioTime = (page: Page) =>
  page.getByTestId('player-audio').evaluate((node: HTMLAudioElement) => node.currentTime);
