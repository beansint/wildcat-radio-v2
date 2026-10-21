import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it('allows exact configured loopback storage and HLS origins in production-build CSP and image patterns', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3010');
  vi.stubEnv('NEXT_PUBLIC_MEDIA_HOST', '127.0.0.1:55991');
  vi.stubEnv('NEXT_PUBLIC_UPLOAD_HOST', '127.0.0.1:55990');
  vi.resetModules();
  const { default: config } = await import('../../../next.config');
  const headers = await config.headers!();
  const csp = headers.flatMap((route) => route.headers).find((header) => header.key === 'Content-Security-Policy')!.value;
  expect(csp).toContain("img-src 'self' data: blob: http://127.0.0.1:55991");
  expect(csp).toContain('http://127.0.0.1:55990');
  expect(csp).toContain("media-src 'self' blob:");
  expect(csp).not.toContain('https://127.0.0.1');
  expect(config.images?.remotePatterns).toEqual([{ protocol: 'http', hostname: '127.0.0.1', port: '55991' }]);
  expect(config.images?.unoptimized).toBe(true);
  expect(config.images?.dangerouslyAllowLocalIP).not.toBe(true);
});
