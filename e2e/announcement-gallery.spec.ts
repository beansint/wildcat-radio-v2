import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiLoginAs, archiveAnnouncement, createAnnouncement, execBackendTsx, WEB_BASE } from './_fixtures';
import { MEDIA_HOST } from '../src/lib/content/media-host';
import { resolveContentOrigin } from '../src/lib/content/content-origin';

let api: APIRequestContext;
const ids: string[] = [];
const MEDIA = resolveContentOrigin(MEDIA_HOST).origin;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jqRkAAAAASUVORK5CYII=', 'base64');

// Production uses Next's optimizer; exact loopback media is loaded directly.
// Intercept only this fixture's approved gallery URLs in either configuration.
function isGalleryImage(url: URL): boolean {
  let source = url;
  if (url.origin === WEB_BASE && url.pathname === '/_next/image') {
    const original = url.searchParams.get('url');
    if (!original) return false;
    try { source = new URL(original); } catch { return false; }
  }
  return source.origin === MEDIA && /^\/gallery-(?:[1-4]|broken)\.png$/.test(source.pathname);
}

test.beforeAll(async () => {
  const db = new URL(process.env.DATABASE_URL ?? '');
  if (db.hostname !== '127.0.0.1' || db.port !== '55432') throw new Error('Gallery fixtures require isolated local PostgreSQL on55432');
  api = await apiLoginAs('moderator');
});
test.afterAll(async () => {
  for (const id of ids) await archiveAnnouncement(api, id);
  await api.dispose();
});

async function published(photos: string[]) {
  const row = await createAnnouncement(api, { title: 'Gallery regression', content: 'All attached photos should be visible.' });
  ids.push(row.id);
  execBackendTsx(`import { PrismaService } from './src/prisma/prisma.service';
    const prisma = new PrismaService();
    async function main() {
      await prisma.announcementPhoto.createMany({ data: ${JSON.stringify(photos.map((url, order) => ({ announcementId: row.id, url, order })))} });
      await prisma.$disconnect();
    }
    main().catch((error) => { console.error(error); process.exit(1); });`);
  expect((await api.post(`/api/announcements/${row.id}/publish`, { data: {} })).ok()).toBeTruthy();
  return `/announcements/${row.slug}-${row.publicId}`;
}

test('AC-1: all four photos render once at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fetched = new Set<string>();
  await page.route(isGalleryImage, route => {
    fetched.add(route.request().url());
    return route.fulfill({ contentType: 'image/png', body: PNG });
  });
  await page.goto(await published([1, 2, 3, 4].map(i => `${MEDIA}/gallery-${i}.png`)));
  const images = page.locator('article img');
  await expect(images).toHaveCount(4);
  for (const image of await images.all()) await image.scrollIntoViewIfNeeded();
  await expect(images.last()).toBeVisible();
  await expect.poll(() => fetched.size).toBe(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('AC-2: unavailable photo gives a readable fallback', async ({ page }) => {
  let failedRequests = 0;
  await page.route(isGalleryImage, route => { failedRequests += 1; return route.abort(); });
  await page.goto(await published([`${MEDIA}/gallery-broken.png`]));
  const fallback = page.getByTestId('announcement-photo-unavailable');
  await expect(fallback).toBeVisible();
  expect(failedRequests).toBeGreaterThan(0);
  const contrasts = await fallback.evaluate(element => {
    const luminance = (rgb: number[]) => rgb.slice(0, 3).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const text = getComputedStyle(element.querySelector('span')!).color.match(/[\d.]+/g)!.map(Number);
    const foreground = luminance(text);
    return [...getComputedStyle(element).backgroundImage.matchAll(/rgba?\(([^)]+)\)/g)].map(match => {
      const background = luminance(match[1].split(',').map(Number));
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
  });
  expect(contrasts.length).toBeGreaterThan(0);
  expect(Math.min(...contrasts)).toBeGreaterThanOrEqual(4.5);
});

test('AC-3: an unapproved photo host is never requested', async ({ page }) => {
  const outbound: string[] = [];
  page.on('request', request => { if (request.url().includes('unapproved.invalid')) outbound.push(request.url()); });
  await page.goto(await published(['https://unapproved.invalid/photo.png']));
  await expect(page.getByTestId('public-announcement-body')).toBeVisible();
  await expect(page.locator('article img')).toHaveCount(0);
  expect(outbound).toEqual([]);
});
