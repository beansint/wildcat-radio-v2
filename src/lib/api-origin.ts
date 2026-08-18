/**
 * FE#54 — the single source of truth for the backend origin.
 *
 * Three modules used to resolve this independently (`api/fetcher.ts`,
 * `auth/client.ts`, `realtime/socket.ts`) and all three fell back to
 * `http://localhost:3001` — the *wrong* port; the API runs on 3010. A dev who
 * forgot `.env.local` got three silently-dead origins, and in production a
 * missing env var would point the whole app at a non-existent localhost rather
 * than failing loudly.
 *
 * `NEXT_PUBLIC_*` values are inlined at build time, so in a production build a
 * missing value is a *build/deploy* misconfiguration that should stop the line
 * — hence the throw rather than a fallback.
 */

/** Local backend dev port. Not 3000 (that's the web app) and not 3001 (stale). */
export const DEV_API_ORIGIN = 'http://localhost:3010';

/**
 * Pure so it is unit-testable without mutating `process.env`.
 *
 * @param envValue the raw `NEXT_PUBLIC_API_URL` value
 * @param isProduction whether this is a production build
 * @throws when running in production with no configured origin
 */
export function resolveApiOrigin(
  envValue: string | undefined,
  isProduction: boolean,
): string {
  const trimmed = envValue?.trim();
  if (trimmed) return trimmed.replace(/\/+$/, '');

  if (isProduction) {
    throw new Error(
      'NEXT_PUBLIC_API_URL is not set. The frontend cannot reach the API without it. ' +
        'Set it to the backend origin (e.g. https://api.example.com) and rebuild.',
    );
  }
  return DEV_API_ORIGIN;
}

/** The resolved backend origin, with no trailing slash. */
export const API_ORIGIN = resolveApiOrigin(
  process.env.NEXT_PUBLIC_API_URL,
  process.env.NODE_ENV === 'production',
);
