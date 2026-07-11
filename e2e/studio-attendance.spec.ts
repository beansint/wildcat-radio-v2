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
});
