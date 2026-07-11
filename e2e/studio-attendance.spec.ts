import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from '@playwright/test';

// FE#5 studio golden path (AC-6): /studio defaults to the Attendance segment,
// a slot-roster row's `studio-timein` flips it to a timed-in pill, and the
// segmented control toggles to Console and back.
//
// `GET /api/studio/today`'s `slotRoster` is only populated when there is an
// *open* Episode row pointing at a Show (see
// wildcat-radio-v2-backend apps/api/src/stream/stream-state.service.ts
// `getStudioToday()`). There is no public API to create that Episode — the
// mod `POST /api/shows` endpoint only creates `Show` rows, and
// `POST /studio/time-in` only ever creates an `unscheduled: true` ad-hoc
// episode (which yields an empty `slotRoster`). So, same as
// `e2e/engagement.spec.ts`'s `runBackendFixture()`, we open (and later close)
// an Episode row directly via a small Prisma script against the seeded
// "Afternoon Vibes" show / "DJ Carla" roster entry.

const WEB_BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const STATION_TOKEN = process.env.STATION_DEVICE_TOKEN ?? 'dev-studio-token-change-me';
const BACKEND_DIR = process.env.WILDCAT_BACKEND_DIR ?? path.resolve(process.cwd(), '../wildcat-radio-v2-backend');
const SHOW_ID = 'seed-show-av';
const EPISODE_ID = 'e2e-fe5-episode-studio';

function runBackendScript(script: string) {
  try {
    execFileSync('pnpm', ['--dir', BACKEND_DIR, '--filter', '@wildcat/api', 'exec', 'tsx', '-e', script], {
      stdio: 'pipe',
    });
  } catch (error) {
    const details =
      error instanceof Error && 'stderr' in error
        ? String((error as Error & { stderr?: Buffer }).stderr)
        : String(error);
    throw new Error(`Backend fixture failed: ${details}`);
  }
}

/** Opens (or resets) an Episode pointing at the seeded "Afternoon Vibes" show, with no attendance yet. */
function openSlotEpisode() {
  const script = `
    import * as dotenv from 'dotenv';
    import { PrismaPg } from '@prisma/adapter-pg';
    import { PrismaClient } from '@prisma/client';
    async function main() {
      dotenv.config({ path: ${JSON.stringify(path.join(BACKEND_DIR, 'apps/api/.env'))} });
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
      const prisma = new PrismaClient({ adapter });
      const now = new Date();
      await prisma.episode.upsert({
        where: { id: ${JSON.stringify(EPISODE_ID)} },
        update: { showId: ${JSON.stringify(SHOW_ID)}, unscheduled: false, status: 'OFF_AIR', startedAt: now, endedAt: null, scheduledFor: now },
        create: { id: ${JSON.stringify(EPISODE_ID)}, showId: ${JSON.stringify(SHOW_ID)}, unscheduled: false, status: 'OFF_AIR', startedAt: now, endedAt: null, scheduledFor: now },
      });
      await prisma.attendanceRecord.deleteMany({ where: { episodeId: ${JSON.stringify(EPISODE_ID)} } });
      await prisma.$disconnect();
    }
    main().catch((error) => { console.error(error); process.exit(1); });
  `;
  runBackendScript(script);
}

/** Closes the fixture episode so it stops being the "open episode" for later runs/specs. */
function closeSlotEpisode() {
  const script = `
    import * as dotenv from 'dotenv';
    import { PrismaPg } from '@prisma/adapter-pg';
    import { PrismaClient } from '@prisma/client';
    async function main() {
      dotenv.config({ path: ${JSON.stringify(path.join(BACKEND_DIR, 'apps/api/.env'))} });
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
      const prisma = new PrismaClient({ adapter });
      await prisma.episode.updateMany({ where: { id: ${JSON.stringify(EPISODE_ID)} }, data: { endedAt: new Date() } });
      await prisma.$disconnect();
    }
    main().catch((error) => { console.error(error); process.exit(1); });
  `;
  runBackendScript(script);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  openSlotEpisode();
});

test.afterAll(() => {
  closeSlotEpisode();
});

/**
 * Seeds an extra, active roster entry not on any show's roster — used by the
 * sub/guest time-in test so it can search for a real DJ who has no slot.
 */
function seedSubRoster(rosterId: string, displayName: string) {
  const script = `
    import * as dotenv from 'dotenv';
    import { PrismaPg } from '@prisma/adapter-pg';
    import { PrismaClient } from '@prisma/client';
    async function main() {
      dotenv.config({ path: ${JSON.stringify(path.join(BACKEND_DIR, 'apps/api/.env'))} });
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
      const prisma = new PrismaClient({ adapter });
      await prisma.rosterEntry.upsert({
        where: { id: ${JSON.stringify(rosterId)} },
        update: { displayName: ${JSON.stringify(displayName)}, isActive: true },
        create: { id: ${JSON.stringify(rosterId)}, displayName: ${JSON.stringify(displayName)}, isActive: true },
      });
      await prisma.$disconnect();
    }
    main().catch((error) => { console.error(error); process.exit(1); });
  `;
  runBackendScript(script);
}

/** Closes any open (endedAt: null) episode this roster id is attending, and removes the roster entry. */
function cleanupSubRoster(rosterId: string) {
  const script = `
    import * as dotenv from 'dotenv';
    import { PrismaPg } from '@prisma/adapter-pg';
    import { PrismaClient } from '@prisma/client';
    async function main() {
      dotenv.config({ path: ${JSON.stringify(path.join(BACKEND_DIR, 'apps/api/.env'))} });
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
      const prisma = new PrismaClient({ adapter });
      const openEpisodeIds = (await prisma.attendanceRecord.findMany({
        where: { rosterId: ${JSON.stringify(rosterId)} },
        select: { episodeId: true },
      })).map((r) => r.episodeId);
      await prisma.episode.updateMany({
        where: { id: { in: openEpisodeIds }, endedAt: null, unscheduled: true },
        data: { endedAt: new Date() },
      });
      await prisma.attendanceRecord.deleteMany({ where: { rosterId: ${JSON.stringify(rosterId)} } });
      await prisma.rosterEntry.deleteMany({ where: { id: ${JSON.stringify(rosterId)} } });
      await prisma.$disconnect();
    }
    main().catch((error) => { console.error(error); process.exit(1); });
  `;
  runBackendScript(script);
}

test.describe('studio attendance', () => {
  test('AC-6 golden: attendance is default, time-in flips the pill, segments toggle', async ({ page }) => {
    await page.goto(`${WEB_BASE}/studio`);

    await page.getByTestId('studio-token-input').fill(STATION_TOKEN);
    await page.getByTestId('studio-token-save').click();

    // Attendance is the default segment once unlocked.
    const attendanceTab = page.getByTestId('studio-seg-attendance');
    await expect(attendanceTab).toBeVisible({ timeout: 15_000 });
    await expect(attendanceTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('studio-seg-console')).toHaveAttribute('aria-selected', 'false');

    const carlaRow = page.getByTestId('studio-slot-row').filter({ hasText: 'DJ Carla' });
    await expect(carlaRow).toBeVisible({ timeout: 15_000 });
    await expect(carlaRow.getByTestId('studio-timein')).toBeVisible();

    await carlaRow.getByTestId('studio-timein').click();

    await expect(carlaRow.getByTestId('studio-timedin-pill')).toBeVisible({ timeout: 10_000 });
    await expect(carlaRow.getByTestId('studio-timedin-pill')).toContainText(/Timed in/i);
    await expect(carlaRow.getByTestId('studio-timein')).toHaveCount(0);

    // Toggle to Console and back — Attendance content survives the round-trip.
    await page.getByTestId('studio-seg-console').click();
    await expect(page.getByTestId('studio-seg-console')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Studio console' })).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('studio-seg-attendance').click();
    await expect(page.getByTestId('studio-seg-attendance')).toHaveAttribute('aria-selected', 'true');
    await expect(carlaRow.getByTestId('studio-timedin-pill')).toBeVisible({ timeout: 10_000 });
  });

  test('edge: time in a sub/guest DJ not on any show roster', async ({ page }) => {
    // `slotRoster` (the left check-in card) only ever lists the *open
    // episode's own show roster* (stream-state.service.ts `getStudioToday()`
    // merges `show.roster`, not "whoever tapped in") — so a genuine
    // sub/guest who isn't on Afternoon Vibes's roster will never appear
    // there. Close the fixture's slot episode first so there's no open
    // episode, then use "Time in a sub / guest DJ" to open a fresh ad-hoc
    // episode for them — that's the `attendees` branch, which is exactly
    // where a sub with no slot shows up as timed-in.
    closeSlotEpisode();

    const runId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const subRosterId = `e2e-fe5-sub-roster-${runId}`;
    const subName = `E2E Sub DJ ${runId}`;
    seedSubRoster(subRosterId, subName);

    try {
      await page.goto(`${WEB_BASE}/studio`);
      await page.getByTestId('studio-token-input').fill(STATION_TOKEN);
      await page.getByTestId('studio-token-save').click();
      await expect(page.getByTestId('studio-seg-attendance')).toBeVisible({ timeout: 15_000 });

      // No open episode yet, so the "no slot" empty state shows first.
      await expect(page.getByTestId('studio-attendance-empty')).toBeVisible({ timeout: 10_000 });

      await page.getByTestId('studio-timein-sub').click();
      await page.getByTestId('studio-timein-sub-search').fill(subName);
      const option = page.getByTestId('studio-timein-sub-option').filter({ hasText: subName });
      await expect(option).toHaveCount(1, { timeout: 10_000 });
      await option.click();

      // Dialog closes; the ad-hoc episode's attendee list now shows them
      // timed in (no show roster to merge, so this is the `attendees` path,
      // with its guidance copy, not a `studio-slot-row`).
      await expect(page.getByTestId('studio-timein-sub-search')).toHaveCount(0, { timeout: 10_000 });
      await expect(page.getByTestId('studio-attendance-guidance')).toBeVisible({ timeout: 10_000 });
      const subRow = page.getByTestId('studio-attendee-row').filter({ hasText: subName });
      await expect(subRow).toBeVisible({ timeout: 10_000 });
      await expect(subRow).toContainText(/Timed in/i);
    } finally {
      cleanupSubRoster(subRosterId);
    }
  });
});
