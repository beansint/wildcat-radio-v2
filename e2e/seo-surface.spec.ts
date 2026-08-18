import { test, expect } from '@playwright/test';
import { WEB_BASE } from './_fixtures';

/**
 * FE#37 / BEA-164 — the SEO surface.
 *
 * Browser-verified regression before this landed: `robots.txt`,
 * `sitemap.xml` and the web manifest all 404'd, all 7 public routes shared
 * the identical root `<title>` (og=0, twitter=0), and `/shows` shipped 364
 * characters of visible text server-side (30 of 34 page files were
 * `"use client"`, so nothing meaningful rendered on the server).
 *
 * This spec asserts the fix at the HTTP/HTML level — no page interaction —
 * so it doubles as a regression guard against any future page silently
 * losing its server-rendered metadata.
 */

const PUBLIC_ROUTES = [
  '/',
  '/listen',
  '/shows',
  '/djs',
  '/schedule',
  '/charts',
  '/announcements',
] as const;

test.describe('robots.txt', () => {
  test('is served, allows the public site, and disallows staff/auth routes', async ({ request }) => {
    const res = await request.get(`${WEB_BASE}/robots.txt`);
    expect(res.status()).toBe(200);

    const body = await res.text();
    for (const disallowed of [
      '/mod',
      '/admin',
      '/studio',
      '/profile',
      '/notifications',
      '/my-data',
      '/login',
      '/register',
      '/reset-password',
      '/verify-email',
      '/forgot-password',
    ]) {
      expect(body).toContain(`Disallow: ${disallowed}`);
    }
    expect(body).toMatch(/Sitemap:\s*\S*\/sitemap\.xml/);
  });
});

test.describe('sitemap.xml', () => {
  test('is served as valid XML and lists every public route', async ({ request }) => {
    const res = await request.get(`${WEB_BASE}/sitemap.xml`);
    expect(res.status()).toBe(200);

    const contentType = res.headers()['content-type'] ?? '';
    expect(contentType).toContain('xml');

    const body = await res.text();
    expect(body).toContain('<urlset');

    for (const path of [
      '/',
      '/listen',
      '/shows',
      '/djs',
      '/schedule',
      '/charts',
      '/announcements',
      '/legal/privacy',
      '/legal/terms',
      '/attribution',
    ]) {
      // `/` renders as the bare origin with no trailing path segment.
      const needle = path === '/' ? `<loc>${WEB_BASE}/</loc>` : `${WEB_BASE}${path}</loc>`;
      expect(body, `sitemap.xml should list ${path}`).toContain(needle);
    }
  });
});

test.describe('manifest', () => {
  test('web manifest is served as valid JSON', async ({ request }) => {
    const res = await request.get(`${WEB_BASE}/manifest.webmanifest`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.name).toContain('Wildcat Radio');
    expect(body.start_url).toBe('/');
    expect(body.display).toBe('standalone');
    expect(Array.isArray(body.icons)).toBe(true);
    expect(body.icons.length).toBeGreaterThan(0);
  });
});

test.describe('per-route metadata', () => {
  test('every public route has a unique <title>', async ({ page }) => {
    const titles = new Set<string>();

    for (const route of PUBLIC_ROUTES) {
      await page.goto(`${WEB_BASE}${route}`);
      const title = await page.title();
      expect(title, `${route} should have a non-empty title`).toBeTruthy();
      titles.add(title);
    }

    // This is the exact regression that was measured: all 7 public routes
    // previously shared the identical root title.
    expect(titles.size).toBe(PUBLIC_ROUTES.length);
  });

  for (const route of PUBLIC_ROUTES) {
    test(`${route} has non-empty og:title, og:description, og:image`, async ({ page }) => {
      await page.goto(`${WEB_BASE}${route}`);

      const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
      const ogDescription = await page
        .locator('meta[property="og:description"]')
        .getAttribute('content');
      const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');

      expect(ogTitle, `${route} og:title`).toBeTruthy();
      expect(ogDescription, `${route} og:description`).toBeTruthy();
      expect(ogImage, `${route} og:image`).toBeTruthy();
    });
  }
});

test.describe('staff routes are not indexable', () => {
  test('/mod/roster emits a noindex robots meta tag on the page a crawler lands on', async ({ page }) => {
    await page.goto(`${WEB_BASE}/mod/roster`);

    // An unauthenticated visitor is redirected to /login?next=... before any
    // /mod markup renders (see e2e/mod-access.spec.ts) — /login itself
    // carries `noindex` via the (auth) route-group layout, so the page a
    // crawler that never authenticates actually lands on is still noindex.
    await expect(page).toHaveURL(/\/login\?next=/, { timeout: 8_000 });
    const robotsMeta = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robotsMeta, 'expected a noindex robots meta tag on the page a crawler actually lands on').toContain(
      'noindex',
    );
  });
});
