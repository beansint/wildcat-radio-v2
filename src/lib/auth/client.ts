/**
 * Better Auth client for Wildcat Radio v2.
 *
 * baseURL = the backend API (not this Next.js app).
 * credentials:'include' ensures the httpOnly session cookie is sent on every request.
 * inferAdditionalFields exposes the extra user columns the backend adds
 * (class, role, handle) in the session type without importing server types.
 */
import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { API_ORIGIN } from '@/lib/api-origin';

export type UserClass = 'CAMPUS' | 'GUEST';
export type UserRole = 'CUSTODIAN' | 'MODERATOR' | 'LISTENER';

/** Shape of the session user object (core + additional fields). */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image?: string | null;
  /** backend additional field */
  class?: UserClass | string;
  /** backend additional field */
  role?: UserRole | string;
  /** backend additional field */
  handle?: string;
}

export const authClient = createAuthClient({
  baseURL: API_ORIGIN,
  fetchOptions: { credentials: 'include' as RequestCredentials },
  plugins: [
    inferAdditionalFields({
      user: {
        class:  { type: 'string' },
        role:   { type: 'string' },
        handle: { type: 'string' },
      },
    }),
  ],
});

const { useSession: _useSession, signIn, signUp, signOut } = authClient;

// ---------------------------------------------------------------------------
// Demo mode — NEXT_PUBLIC_DEMO_MODE=true bypasses the backend session check
// and returns a fake CUSTODIAN user so staff screens render on Vercel without
// a running API. UX gate only; the real RBAC lives in the backend RolesGuard.
// ---------------------------------------------------------------------------
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

const DEMO_SESSION = {
  data: {
    session: {
      id: 'demo-session',
      userId: 'demo-user',
      token: 'demo-token',
      expiresAt: new Date(Date.now() + 86_400_000),
    },
    user: {
      id: 'demo-user',
      email: 'demo@wildcat.radio',
      name: 'Demo Custodian',
      emailVerified: true,
      image: null,
      class: 'CAMPUS',
      role: 'CUSTODIAN',
      handle: 'demo',
    } satisfies SessionUser,
  },
  isPending: false,
  error: null,
} as const;

function useDemoSession() {
  return DEMO_SESSION;
}

const useSession = DEMO_MODE ? useDemoSession : _useSession;

export { useSession, signIn, signUp, signOut };
