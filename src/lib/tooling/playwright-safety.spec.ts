import { describe, expect, it } from 'vitest';
import { assertLocalPlaywrightEnvironment, playwrightSubprocessEnvironment } from './playwright-safety';
const safe = {
  DATABASE_URL: 'postgresql://audit@127.0.0.1:55432/wildcat_browser_full',
  PLAYWRIGHT_DATABASE_NAME: 'wildcat_browser_full',
  PLAYWRIGHT_BASE_URL: 'http://localhost:3011',
  PLAYWRIGHT_API_URL: 'http://localhost:3010',
  NEXT_PUBLIC_API_URL: 'http://localhost:3010',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3011',
};
describe('Playwright mutation safety', () => {
  it('accepts an explicitly named isolated local database and local origins', () => {
    expect(() => assertLocalPlaywrightEnvironment(safe)).not.toThrow();
  });
  it.each(['DATABASE_URL', 'PLAYWRIGHT_DATABASE_NAME', 'PLAYWRIGHT_BASE_URL', 'PLAYWRIGHT_API_URL', 'NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SITE_URL'])('rejects missing %s before collection', key => {
    expect(() => assertLocalPlaywrightEnvironment({ ...safe, [key]: '' })).toThrow();
  });
  it.each([
    { DATABASE_URL: 'postgresql://audit@remote.invalid/wildcat_browser_full' },
    { DATABASE_URL: 'postgresql://audit@127.0.0.1:55432/postgres', PLAYWRIGHT_DATABASE_NAME: 'postgres' },
    { DATABASE_URL: 'postgresql://audit@127.0.0.1:55432/station_latest', PLAYWRIGHT_DATABASE_NAME: 'station_latest' },
    { DATABASE_URL: 'postgresql://audit@127.0.0.1:55432/wildcat_browser_full?host=remote.invalid' },
    { PLAYWRIGHT_DATABASE_NAME: 'different_test' },
    { PLAYWRIGHT_BASE_URL: 'https://station.invalid' },
    { PLAYWRIGHT_API_URL: 'https://api.invalid' },
    { PLAYWRIGHT_API_BASE_URL: 'https://api.invalid' },
    { NEXT_PUBLIC_API_URL: 'https://api.invalid' },
    { NEXT_PUBLIC_API_URL: 'http://localhost:3314' },
    { NEXT_PUBLIC_SITE_URL: 'https://station.invalid' },
    { SHOW_TRANSITIONS_DATABASE_URL: 'postgresql://audit@remote.invalid/wildcat_browser_full' },
  ])('rejects unsafe or conflicting targets: %j', override => {
    expect(() => assertLocalPlaywrightEnvironment({ ...safe, ...override })).toThrow();
  });
  it.each(['PGHOSTADDR', 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGSERVICE', 'PGSERVICEFILE', 'PGSYSCONFDIR'])('rejects inherited libpq override %s', key => {
    expect(() => assertLocalPlaywrightEnvironment({ ...safe, [key]: 'inherited-value' })).toThrow();
  });
  it('removes all other libpq variables from fixture subprocesses without mutating the caller', () => {
    const original = { ...safe, PGAPPNAME: 'inherited', PGPASSWORD: 'synthetic', CUSTOM_FIXTURE_FLAG: 'retained' };
    const child = playwrightSubprocessEnvironment(original);
    expect(child).not.toHaveProperty('PGAPPNAME');
    expect(child).not.toHaveProperty('PGPASSWORD');
    expect(child.DATABASE_URL).toBe(safe.DATABASE_URL);
    expect(child.CUSTOM_FIXTURE_FLAG).toBe('retained');
    expect(child.NODE_ENV).toBe('test');
    expect(original.PGPASSWORD).toBe('synthetic');
  });
});
