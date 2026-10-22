"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { authClient, useSession } from '@/lib/auth/client';
import { verificationState } from '@/lib/auth/account-flows';
import { AuthBrandPane } from '@/components/auth/auth-brand-pane';
import { VerificationResend } from '@/components/auth/verification-resend';
import { Button } from '@/components/ui/button';

function VerifyContent() {
  const params = useSearchParams();
  const token = params.get('token');
  const returned = params.get('returned') === '1';
  const callbackError = params.get('error');
  const { data: session, isPending, refetch } = useSession();
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState<{ token: string; error?: string; verified?: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (token) {
        try {
          const result = await authClient.verifyEmail({ query: { token } });
          if (cancelled) return;
          setAttempt({ token, ...(result.error ? { error: result.error.message ?? 'Link expired or invalid.' } : { verified: true }) });
        } catch { if (!cancelled) setAttempt({ token, error: 'Could not verify this link. Please try again.' }); }
      }
      if (token || returned) {
        await refetch();
        await queryClient.invalidateQueries();
      }
    }
    void refresh();
    return () => { cancelled = true; };
  }, [token, returned, refetch, queryClient]);

  const loading = isPending || !!(token && attempt?.token !== token);
  const error = callbackError || attempt?.error;
  const state = verificationState({ returned, signedIn: !!session, emailVerified: session?.user.emailVerified === true || attempt?.verified === true, error });
  return <div className="wc-auth-formcard text-center py-6">
    {loading ? <><Loader2 className="w-10 h-10 mx-auto animate-spin" aria-hidden="true" /><h1 className="text-2xl font-extrabold mt-4">Checking verification…</h1></> : <>
      <h1 className="text-2xl font-extrabold mb-3">{state === 'success' ? 'Email verified!' : state === 'error' ? 'Link expired or invalid' : state === 'signed-out' ? 'Sign in to confirm verification' : 'Verify your email'}</h1>
      <p className="wc-muted text-sm mb-5">{state === 'success'
        ? (session ? 'Your email is verified. You can join written participation while your account is in good standing.' : 'Your email is verified. Sign in to join the chat.')
        : state === 'error' ? 'This link could not verify your email. Request a fresh link; links expire after one hour.'
          : state === 'signed-out' ? 'The verification link returned you here. Sign in to check your account and continue.'
            : 'Follow the verification link in your inbox. If no email arrives, request a new link below. You can listen and react while you wait.'}</p>
      {state !== 'success' && <VerificationResend email={session?.user.email} />}
      <Button asChild className="mt-5 wc-btn-block"><Link href={session ? '/listen' : '/login'}>{session ? 'Go to the station' : 'Sign in'}</Link></Button>
      {session && <Link href="/profile" className="block mt-4 text-sm underline">Back to your profile</Link>}
    </>}
  </div>;
}

export default function VerifyEmailPage() {
  return <div className="wc-auth-grid"><AuthBrandPane variant="login" /><main className="wc-auth-form"><Suspense fallback={<p>Loading verification…</p>}><VerifyContent /></Suspense></main></div>;
}
