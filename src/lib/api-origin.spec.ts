import { describe, expect, it } from 'vitest';
import { DEV_API_ORIGIN, resolveApiOrigin } from './api-origin';

/**
 * FE#54 — regression guards for the env fail-fast. The bug being locked out:
 * three modules independently fell back to `http://localhost:3001`, which is
 * not the API port, so a missing env var pointed the app at a dead origin
 * instead of failing.
 */
describe('resolveApiOrigin', () => {
  it('uses the configured origin when one is set', () => {
    expect(resolveApiOrigin('https://api.example.com', true)).toBe(
      'https://api.example.com',
    );
  });

  it('strips trailing slashes so callers can concatenate paths safely', () => {
    // Every call site builds `${base}${url}` where url starts with '/', so a
    // trailing slash would produce a double slash.
    expect(resolveApiOrigin('https://api.example.com/', false)).toBe(
      'https://api.example.com',
    );
    expect(resolveApiOrigin('https://api.example.com///', false)).toBe(
      'https://api.example.com',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(resolveApiOrigin('  https://api.example.com  ', false)).toBe(
      'https://api.example.com',
    );
  });

  it('falls back to the backend dev port in development', () => {
    expect(resolveApiOrigin(undefined, false)).toBe(DEV_API_ORIGIN);
    expect(resolveApiOrigin('', false)).toBe(DEV_API_ORIGIN);
    expect(resolveApiOrigin('   ', false)).toBe(DEV_API_ORIGIN);
  });

  it('falls back to 3010 — never the stale 3001 or the web port 3000', () => {
    expect(DEV_API_ORIGIN).toBe('http://localhost:3010');
    expect(DEV_API_ORIGIN).not.toContain('3001');
    expect(DEV_API_ORIGIN).not.toContain('3000');
  });

  it('throws in production rather than silently pointing at localhost', () => {
    expect(() => resolveApiOrigin(undefined, true)).toThrow(
      /NEXT_PUBLIC_API_URL is not set/,
    );
    expect(() => resolveApiOrigin('', true)).toThrow(/NEXT_PUBLIC_API_URL/);
    expect(() => resolveApiOrigin('   ', true)).toThrow(/NEXT_PUBLIC_API_URL/);
  });
});
