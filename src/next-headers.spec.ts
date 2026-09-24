import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import nextConfig from '../next.config';
import * as authClient from './lib/auth/client';

/**
 * #72 launch-hardening — spec-first cases from .agent/test-suites/launch-hardening.
 * U-1/U-2 assert the CSP contract per environment; the `unsafe-eval` token is
 * production-forbidden and dev-required. U-3/U-4 are regression guards so the
 * coverage exclusions and the demo-mode backdoor removal cannot silently rot.
 */

async function cspFor(nodeEnv: string): Promise<string> {
  vi.stubEnv('NODE_ENV', nodeEnv);
  expect(nextConfig.headers, 'next.config.ts must configure headers()').toBeDefined();
  const routes = await nextConfig.headers!();
  const row = routes
    .flatMap((route) => route.headers)
    .find((h) => h.key === 'Content-Security-Policy');
  expect(row, 'CSP header must be configured').toBeDefined();
  return row!.value;
}

describe('CSP script-src (#72 U-1/U-2)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('production: script-src has no unsafe-eval, keeps unsafe-inline and frame-ancestors none', async () => {
    const csp = await cspFor('production');
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('development: script-src keeps unsafe-eval for the Next dev overlay', async () => {
    const csp = await cspFor('development');
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });
});

describe('coverage config (#72 U-3)', () => {
  it('excludes generated orval output from coverage', () => {
    const config = readFileSync(path.resolve(__dirname, '../vitest.config.ts'), 'utf8');
    expect(config).toContain("provider: 'v8'");
    expect(config).toContain("'src/lib/api/endpoints/**'");
    expect(config).toContain("'src/lib/api/model/**'");
  });
});

describe('auth client exports (#72 U-4)', () => {
  it('exposes only the real better-auth session hook — no demo session remnants', async () => {
    expect(Object.keys(authClient)).toEqual(
      expect.arrayContaining(['authClient', 'useSession', 'signIn', 'signUp', 'signOut']),
    );

    const source = readFileSync(path.resolve(__dirname, 'lib/auth/client.ts'), 'utf8');
    expect(source).not.toMatch(/DEMO_MODE|DEMO_SESSION|useDemoSession|demo@wildcat\.radio/);
  });
});
