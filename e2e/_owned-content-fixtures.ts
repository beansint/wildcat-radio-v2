import { fixtureSql } from './_sql';

const quoted = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** These users cannot log in: they exist only to fill an owned pagination result. */
export function createStaffPaginationFixture(prefix: string): () => void {
  const ids = Array.from({ length: 21 }, (_, index) => `${prefix}_${String(index).padStart(2, '0')}`);
  fixtureSql(`INSERT INTO users (id, email, name, handle, role, class, "emailVerified", "notifyEmail", "updatedAt") VALUES
    ${ids.map(id => `(${quoted(id)}, ${quoted(`${id}@cit.edu`)}, ${quoted(id)}, ${quoted(id)}, 'MODERATOR', 'CAMPUS', true, false, now())`).join(',')}`);
  return () => {
    fixtureSql(`DELETE FROM users WHERE id IN (${ids.map(quoted).join(',')})`);
    const remaining = fixtureSql(`SELECT count(*) FROM users WHERE id IN (${ids.map(quoted).join(',')})`);
    if (remaining !== '0') throw new Error('Staff pagination fixture cleanup left owned rows');
  };
}

/** Monday is selected explicitly, so the links never depend on the wall-clock day. */
export function createScheduleLinkFixture(show: { slug: string; name: string }): () => void {
  const rosterId = `${show.slug}-dj`;
  fixtureSql(`BEGIN;
    INSERT INTO roster_entries (id, "displayName") VALUES (${quoted(rosterId)}, 'E2E schedule link host');
    INSERT INTO shows (id, name, slug, description, cadence, "updatedAt") VALUES (
      ${quoted(show.slug)}, ${quoted(show.name)}, ${quoted(show.slug)}, 'Owned schedule navigation fixture',
      '{"kind":"WEEKLY","days":["MON"],"start":"10:00","end":"11:00"}'::jsonb, now());
    INSERT INTO show_roster_entries ("showId", "rosterId") VALUES (${quoted(show.slug)}, ${quoted(rosterId)});
    COMMIT;`);
  return () => {
    fixtureSql(`BEGIN;
      DELETE FROM show_roster_entries WHERE "showId" = ${quoted(show.slug)} AND "rosterId" = ${quoted(rosterId)};
      DELETE FROM shows WHERE id = ${quoted(show.slug)};
      DELETE FROM roster_entries WHERE id = ${quoted(rosterId)};
      COMMIT;`);
    const remaining = fixtureSql(`SELECT
      (SELECT count(*) FROM shows WHERE id = ${quoted(show.slug)}) +
      (SELECT count(*) FROM roster_entries WHERE id = ${quoted(rosterId)})`);
    if (remaining !== '0') throw new Error('Schedule link fixture cleanup left owned rows');
  };
}
