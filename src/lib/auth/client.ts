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
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
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

export const { useSession, signIn, signUp, signOut } = authClient;
