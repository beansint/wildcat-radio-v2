/**
 * Better Auth client for Wildcat Radio v2.
 *
 * baseURL = the backend API (not this Next.js app).
 * credentials:'include' ensures the httpOnly session cookie is sent on every request.
 * inferAdditionalFields exposes the extra user columns the backend adds
 * (class, role, handle) in the session type without importing server types.
 */
import { createAuthClient } from 'better-auth/react';
import { getGlobalBroadcastChannel } from 'better-auth/client';
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
  fetchOptions: {
    credentials: 'include' as RequestCredentials,
    onSuccess: ({ request }) => {
      // Better Auth broadcasts sign-out/update-user, but 1.6 does not broadcast sign-in.
      // Reuse its session channel so every tab resolves the new cookie owner.
      const path = new URL(request.url).pathname;
      if (path === '/api/auth/sign-in/email' || path === '/api/auth/sign-up/email') {
        getGlobalBroadcastChannel().post({
          event: 'session', data: { trigger: 'getSession' }, clientId: crypto.randomUUID(),
        });
      }
    },
  },
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

const { useSession, signIn, signUp, signOut } = authClient;

export { useSession, signIn, signUp, signOut };
