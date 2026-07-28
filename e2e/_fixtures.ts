import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { normalizeFilterWord } from '../src/lib/settings/filter-list';

/**
 * API-driven fixture helpers for FE#9 (public content + /mod/announcements +
 * /mod/settings). Every fixture is created and torn down THROUGH THE REAL
 * BACKEND API — no raw SQL, no Prisma script (unlike the older
 * mod-org-schedule-attendance.spec.ts pattern). Endpoints/DTOs below are
 * transcribed from `.agent/test-suites/fe-m5-public-content/**` and
 * `docs/features/07-fe9-public-content/{feature,qa-plan}.md` — the
 * acceptance contract this suite is written against, not from reading any
 * frontend implementation code.
 *
 * NOTE on cleanup completeness: the announcements API has no hard-delete
 * route (announcements are lifecycled to ARCHIVED, never removed — this is
 * a deliberate backend decision per feature.md). `cleanupAnnouncements`
 * therefore archives every fixture row it created rather than deleting it,
 * and "zero leaked rows" for announcements means "every fixture id is
 * ARCHIVED", not "the row is gone". Shows have a real `DELETE /shows/:id`
 * and are hard-deleted. Roster entries (DJs) have no delete route either —
 * `cleanupRoster` deactivates (`isActive: false`) rather than deletes, which
 * doubles as the "create/deactivate a DJ" fixture the task asks for.
 */

export const API_BASE = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3010';
export const WEB_BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3011';
export const PASSWORD = 'Password123!';

export const ACCOUNTS = {
  moderator: 'mod@example.com',
  custodian: 'custodian@example.com',
  listener: 'campuslistener@example.com',
} as const;

export type Role = keyof typeof ACCOUNTS;

export function uniqueId(): string {
  return `fe9${Date.now()}${Math.floor(Math.random() * 100_000)}`;
}

// ── Sessions ─────────────────────────────────────────────────────────────

/**
 * Signs in as `role` via the real better-auth email/password endpoint and
 * returns an `APIRequestContext` carrying the resulting session cookie for
 * every subsequent call. Caller is responsible for `context.dispose()`.
 */
export async function apiLoginAs(role: Role): Promise<APIRequestContext> {
  const context = await pwRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Origin: WEB_BASE },
  });
  const res = await context.post('/api/auth/sign-in/email', {
    data: { email: ACCOUNTS[role], password: PASSWORD },
  });
  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    await context.dispose();
    throw new Error(`fixture: sign-in as ${role} failed: ${res.status()} ${body}`);
  }
  return context;
}

/** UI login helper — mirrors e2e/mod-users.spec.ts / e2e/mod-access.spec.ts's testid-based flow. */
export async function loginAs(page: Page, role: Role): Promise<void> {
  await page.goto(`${WEB_BASE}/login`);
  await page.getByTestId('auth-email').fill(ACCOUNTS[role]);
  await page.getByTestId('auth-password').fill(PASSWORD);
  await page.getByTestId('auth-submit').click();
  await page.waitForURL(new RegExp(`^${escapeRegExp(WEB_BASE)}(/)?($|\\?)`), { timeout: 10_000 });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function expectOk(res: { ok(): boolean; status(): number; text(): Promise<string> }, what: string) {
  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    throw new Error(`fixture: ${what} failed: ${res.status()} ${body}`);
  }
}

// ── Announcements ────────────────────────────────────────────────────────

export interface AnnouncementStaff {
  id: string;
  status: string;
  isPinned: boolean;
  /** Readable address parts (AC-C9): the public URL is `<slug>-<publicId>`. */
  slug: string;
  publicId: string;
  [key: string]: unknown;
}

export async function createAnnouncement(
  api: APIRequestContext,
  overrides: { title?: string; content?: string; scheduledFor?: string; expiresAt?: string } = {},
): Promise<AnnouncementStaff> {
  const id = uniqueId();
  const res = await api.post('/api/announcements', {
    data: {
      title: overrides.title ?? `E2E FE9 announcement ${id}`,
      content: overrides.content ?? `Fixture body for ${id}.`,
      ...(overrides.scheduledFor ? { scheduledFor: overrides.scheduledFor } : {}),
      ...(overrides.expiresAt ? { expiresAt: overrides.expiresAt } : {}),
    },
  });
  await expectOk(res, 'createAnnouncement');
  return res.json();
}

export async function submitAnnouncement(api: APIRequestContext, id: string): Promise<AnnouncementStaff> {
  const res = await api.post(`/api/announcements/${id}/submit`);
  await expectOk(res, `submitAnnouncement(${id})`);
  return res.json();
}

export type ReviewDecision = 'PUBLISH' | 'SCHEDULE' | 'REJECT';

export async function reviewAnnouncement(
  api: APIRequestContext,
  id: string,
  decision: ReviewDecision,
  extra: { rejectionReason?: string; scheduledFor?: string } = {},
): Promise<AnnouncementStaff> {
  const res = await api.post(`/api/announcements/${id}/review`, { data: { decision, ...extra } });
  await expectOk(res, `reviewAnnouncement(${id}, ${decision})`);
  return res.json();
}

/** Convenience: DRAFT -> submit -> review(PUBLISH) in one call, for fixtures that just need a PUBLISHED row. */
export async function createPublishedAnnouncement(
  api: APIRequestContext,
  overrides: Parameters<typeof createAnnouncement>[1] = {},
): Promise<AnnouncementStaff> {
  const created = await createAnnouncement(api, overrides);
  await submitAnnouncement(api, created.id);
  return reviewAnnouncement(api, created.id, 'PUBLISH');
}

export async function pinAnnouncement(api: APIRequestContext, id: string, pinned = true): Promise<AnnouncementStaff> {
  const path = pinned ? 'pin' : 'unpin';
  const res = await api.post(`/api/announcements/${id}/${path}`);
  await expectOk(res, `${path}Announcement(${id})`);
  return res.json();
}

/**
 * Unpins every currently-pinned announcement in the station.
 *
 * The pin cap is a global, cross-row invariant (at most `announcements.pinLimit`
 * PUBLISHED rows pinned at once), so a test that pins and never unpins silently
 * consumes a slot for every later test AND every later run — the suite then
 * fails with "Pin limit reached" on a perfectly correct implementation. Cleanup
 * in `afterAll` is not enough because the cap is exhausted *within* a file, so
 * specs that pin call this in `beforeEach`.
 */
export async function resetPins(api: APIRequestContext): Promise<void> {
  const res = await api.get('/api/announcements/admin?pageSize=100');
  await expectOk(res, 'resetPins(list)');
  const { items } = (await res.json()) as { items: AnnouncementStaff[] };
  for (const item of items.filter((i) => i.isPinned)) {
    const unpin = await api.post(`/api/announcements/${item.id}/unpin`);
    if (!unpin.ok() && unpin.status() !== 409 && unpin.status() !== 404) {
      throw new Error(`resetPins: unpin(${item.id}) failed: ${unpin.status()}`);
    }
  }
}

export async function featureAnnouncement(
  api: APIRequestContext,
  id: string,
  featured = true,
): Promise<AnnouncementStaff> {
  const path = featured ? 'feature' : 'unfeature';
  const res = await api.post(`/api/announcements/${id}/${path}`, featured ? { data: { featured: true } } : undefined);
  await expectOk(res, `${path}Announcement(${id})`);
  return res.json();
}

export async function archiveAnnouncement(api: APIRequestContext, id: string): Promise<AnnouncementStaff> {
  const res = await api.post(`/api/announcements/${id}/archive`);
  await expectOk(res, `archiveAnnouncement(${id})`);
  return res.json();
}

/**
 * Archives every id, swallowing 404 (already gone) and 409 (already
 * archived by the test itself, or by another test file's own cleanup racing
 * on a shared fixture id — this helper is called from every spec file's
 * `afterAll`). NOTE: despite the API's own doc comment describing `archive`
 * as idempotent ("Any non-ARCHIVED status -> ARCHIVED"), the running
 * implementation returns 409 on a second archive of an already-ARCHIVED
 * row rather than 200 — see the discrepancy called out in the final report.
 */
export async function cleanupAnnouncements(api: APIRequestContext, ids: string[]): Promise<void> {
  for (const id of ids) {
    const res = await api.post(`/api/announcements/${id}/archive`);
    if (!res.ok() && res.status() !== 404 && res.status() !== 409) {
      const body = await res.text().catch(() => '');
      throw new Error(`cleanup: failed to archive announcement ${id}: ${res.status()} ${body}`);
    }
  }
}

// ── Shows + roster (DJs) ─────────────────────────────────────────────────

export interface RosterEntry {
  id: string;
  displayName: string;
  isActive: boolean;
  [key: string]: unknown;
}

export async function createRosterEntry(
  api: APIRequestContext,
  overrides: { displayName?: string; bio?: string; photoUrl?: string } = {},
): Promise<RosterEntry> {
  const id = uniqueId();
  const res = await api.post('/api/roster', {
    data: {
      displayName: overrides.displayName ?? `E2E FE9 DJ ${id}`,
      ...(overrides.bio ? { bio: overrides.bio } : {}),
      ...(overrides.photoUrl ? { photoUrl: overrides.photoUrl } : {}),
    },
  });
  await expectOk(res, 'createRosterEntry');
  return res.json();
}

export async function setRosterActive(api: APIRequestContext, id: string, isActive: boolean): Promise<RosterEntry> {
  const res = await api.patch(`/api/roster/${id}`, { data: { isActive } });
  await expectOk(res, `setRosterActive(${id}, ${isActive})`);
  return res.json();
}

export interface Show {
  id: string;
  name: string;
  slug: string;
  [key: string]: unknown;
}

export async function createShow(
  api: APIRequestContext,
  rosterIds: string[],
  overrides: { name?: string; description?: string } = {},
): Promise<Show> {
  const id = uniqueId();
  const res = await api.post('/api/shows', {
    data: {
      name: overrides.name ?? `E2E FE9 Show ${id}`,
      description: overrides.description ?? `Fixture show ${id}.`,
      cadence: { kind: 'WEEKLY', days: ['MON', 'WED', 'FRI'], start: '13:00', end: '16:00' },
      rosterIds,
    },
  });
  await expectOk(res, 'createShow');
  return res.json();
}

export async function deleteShow(api: APIRequestContext, id: string): Promise<void> {
  const res = await api.delete(`/api/shows/${id}`);
  if (!res.ok() && res.status() !== 404) {
    const body = await res.text().catch(() => '');
    throw new Error(`cleanup: failed to delete show ${id}: ${res.status()} ${body}`);
  }
}

/** Deactivates every roster id (idempotent, swallows 404). Roster entries have no delete route. */
export async function cleanupRoster(api: APIRequestContext, ids: string[]): Promise<void> {
  for (const id of ids) {
    const res = await api.patch(`/api/roster/${id}`, { data: { isActive: false } });
    if (!res.ok() && res.status() !== 404) {
      const body = await res.text().catch(() => '');
      throw new Error(`cleanup: failed to deactivate roster entry ${id}: ${res.status()} ${body}`);
    }
  }
}

/**
 * Creates a real episode for `rosterId` via the studio station-token
 * time-in/time-out flow (there is no direct "create episode" REST route —
 * episodes are a side effect of studio attendance, same pattern as
 * e2e/engagement.spec.ts). `close: true` also times the DJ out, producing a
 * "recent" (closed) episode instead of an open/"upcoming" one.
 */
export async function createEpisodeViaStudio(
  request: APIRequestContext,
  rosterId: string,
  options: { close?: boolean } = {},
): Promise<void> {
  const stationToken = process.env.STATION_DEVICE_TOKEN ?? 'dev-studio-token-change-me';
  const context = await pwRequest.newContext({ baseURL: API_BASE });
  try {
    const timeIn = await context.post('/api/studio/time-in', {
      headers: { Authorization: `Bearer ${stationToken}` },
      data: { rosterId },
    });
    await expectOk(timeIn, `createEpisodeViaStudio time-in(${rosterId})`);
    if (options.close) {
      const timeOut = await context.post('/api/studio/time-out', {
        headers: { Authorization: `Bearer ${stationToken}` },
        data: { rosterId },
      });
      await expectOk(timeOut, `createEpisodeViaStudio time-out(${rosterId})`);
    }
  } finally {
    await context.dispose();
  }
  void request; // kept in the signature for symmetry with the other fixture helpers; unused directly.
}

// ── Settings ─────────────────────────────────────────────────────────────

export interface SettingRow {
  key: string;
  group: string;
  value: unknown;
}

export async function getAdminSettings(api: APIRequestContext): Promise<SettingRow[]> {
  const res = await api.get('/api/settings/admin');
  await expectOk(res, 'getAdminSettings');
  return res.json();
}

export async function putSetting(api: APIRequestContext, key: string, value: unknown): Promise<SettingRow> {
  const res = await api.put(`/api/settings/${key}`, { data: { value } });
  await expectOk(res, `putSetting(${key})`);
  return res.json();
}

/** Reads a single admin setting's current value, for save/restore-around-a-test patterns. */
export async function getSetting(api: APIRequestContext, key: string): Promise<SettingRow> {
  const res = await api.get(`/api/settings/${key}`);
  await expectOk(res, `getSetting(${key})`);
  return res.json();
}

// ── Moderation filter list ───────────────────────────────────────────────
//
// NOTE: `feature.md`, `qa-plan.md` and every `mod-settings/*.md` catalog file
// document this surface at `GET/POST/DELETE /api/mod/filter`. The
// backend's actual `ModerationController` mounts it at `/api/mod/filter`
// (`apps/api/src/moderation/moderation.controller.ts`) — there is no
// `/api/moderation/*` controller in the current tree. This is flagged in the
// final report as a spec/implementation discrepancy rather than silently
// "corrected" here (this suite is written to the documented contract, per
// this task's black-box instruction); if the implementation agent finds the
// real route really is `/api/mod/filter`, this helper's path is the one line
// to change.

export type FilterTier = 'BLOCK' | 'WATCH';

export async function addFilterTerm(api: APIRequestContext, word: string, tier: FilterTier): Promise<unknown> {
  const res = await api.post('/api/mod/filter', { data: { word, tier } });
  await expectOk(res, `addFilterTerm(${word})`);
  return res.json();
}

export async function listFilterTerms(api: APIRequestContext): Promise<Array<{ id: string; word: string }>> {
  const res = await api.get('/api/mod/filter');
  await expectOk(res, 'listFilterTerms');
  return res.json();
}

export async function removeFilterTerm(api: APIRequestContext, id: string): Promise<void> {
  const res = await api.delete(`/api/mod/filter/${id}`);
  if (!res.ok() && res.status() !== 404) {
    const body = await res.text().catch(() => '');
    throw new Error(`cleanup: failed to remove filter term ${id}: ${res.status()} ${body}`);
  }
}

/**
 * Best-effort cleanup for filter terms created by a test's own fixture
 * words. Matched via `normalizeFilterWord` (mirrors the backend's
 * aggressive leet/separator-stripping normalizer,
 * `apps/api/src/moderation/filter/normalize.ts`) rather than a plain
 * trim+lowercase — the stored `entry.word` is the *normalized* form, which
 * for a raw fixture word containing hyphens or digits (e.g.
 * `e2e-fe9-filterterm-<timestamp>`) never equals a naive trim/lowercase of
 * the input. Matching on the wrong key silently leaked fixture rows.
 */
export async function cleanupFilterTermsByWord(api: APIRequestContext, words: string[]): Promise<void> {
  const normalized = new Set(words.map((word) => normalizeFilterWord(word)));
  const entries = await listFilterTerms(api).catch(() => []);
  for (const entry of entries) {
    if (normalized.has(normalizeFilterWord(entry.word))) {
      await removeFilterTerm(api, entry.id);
    }
  }
}
