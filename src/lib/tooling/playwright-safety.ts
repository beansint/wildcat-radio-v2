/** Fail before Playwright collects specs: fixtures can mutate the database at import time. */
export function assertLocalPlaywrightEnvironment(env: Record<string, string | undefined>): void {
  const fail = (name: string): never => { throw new Error(`Unsafe Playwright target: ${name}. Set explicit loopback URLs and PLAYWRIGHT_DATABASE_NAME for an isolated database.`); };
  const url = (name: string) => {
    try { return new URL(env[name] || ''); } catch { return fail(name); }
  };
  const local = (target: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
  // libpq can combine URI host with an inherited hostaddr/service. Reject
  // these before collection; a loopback URI alone does not constrain psql.
  for (const key of ['PGHOSTADDR', 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGSERVICE', 'PGSERVICEFILE', 'PGSYSCONFDIR']) {
    if (env[key]) fail(key);
  }
  const db = url('DATABASE_URL');
  const name = env.PLAYWRIGHT_DATABASE_NAME;
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || !local(db) || db.search ||
      !name || !/^[a-z][a-z0-9_]*$/.test(name) || !/(^|_)(test|e2e|browser)(_|$)/.test(name) ||
      db.pathname !== `/${name}`) fail('DATABASE_URL / PLAYWRIGHT_DATABASE_NAME');
  for (const key of ['PLAYWRIGHT_BASE_URL', 'PLAYWRIGHT_API_URL', 'NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SITE_URL']) {
    const target = url(key);
    if (!local(target) || target.protocol !== 'http:' || target.username || target.password || target.search || target.hash || target.pathname !== '/') fail(key);
  }
  if (url('NEXT_PUBLIC_API_URL').origin !== url('PLAYWRIGHT_API_URL').origin) fail('NEXT_PUBLIC_API_URL');
  if (url('NEXT_PUBLIC_SITE_URL').origin !== url('PLAYWRIGHT_BASE_URL').origin) fail('NEXT_PUBLIC_SITE_URL');
  if (env.PLAYWRIGHT_API_BASE_URL && env.PLAYWRIGHT_API_BASE_URL !== env.PLAYWRIGHT_API_URL) fail('PLAYWRIGHT_API_BASE_URL');
  if (env.SHOW_TRANSITIONS_DATABASE_URL && env.SHOW_TRANSITIONS_DATABASE_URL !== env.DATABASE_URL) fail('SHOW_TRANSITIONS_DATABASE_URL');
}

/** Preserve explicit test settings without inherited libpq connection defaults. */
export function playwrightSubprocessEnvironment(env: Record<string, string | undefined>): NodeJS.ProcessEnv {
  assertLocalPlaywrightEnvironment(env);
  return {
    ...Object.fromEntries(Object.entries(env).filter(([key]) => !key.toUpperCase().startsWith('PG'))),
    NODE_ENV: 'test',
  };
}
