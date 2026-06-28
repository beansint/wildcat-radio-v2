"use client";

/**
 * /verify-email — reads ?token= via useSearchParams inside <Suspense>
 * Calls Better Auth's verify-email endpoint; shows success / error + resend link.
 */
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCheck, XCircle, Loader2 } from 'lucide-react';
import { authClient, useSession } from '@/lib/auth/client';
import { AuthBrandPane } from '@/components/auth/auth-brand-pane';
import { Button } from '@/components/ui/button';

type Status = 'pending' | 'verifying' | 'success' | 'error';

function VerifyContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const { data: session } = useSession();

  const [status,  setStatus]  = useState<Status>(token ? 'verifying' : 'pending');
  const [errMsg,  setErrMsg]  = useState('');
  const [resent,  setResent]  = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        // Better Auth's email verification endpoint — check result.error (BA doesn't always throw)
        const result = await authClient.verifyEmail({ query: { token } });
        if (cancelled) return;
        if (result?.error) {
          setStatus('error');
          setErrMsg(result.error.message ?? 'Verification failed.');
        } else {
          setStatus('success');
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrMsg(err instanceof Error ? err.message : 'Verification failed.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function handleResend() {
    const email = session?.user?.email;
    if (!email) {
      setErrMsg('Please sign in again so we can resend your verification email.');
      return;
    }
    setSending(true);
    try {
      const { error } = await authClient.sendVerificationEmail({ email, callbackURL: '/' });
      if (error) {
        setErrMsg(error.message ?? 'Could not resend. Please try again in a moment.');
        return;
      }
      setResent(true);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Could not resend. Please try again in a moment.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="wc-auth-formcard text-center py-6">
      {status === 'verifying' && (
        <>
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-maroon" aria-hidden="true" />
          <h1 className="text-2xl font-extrabold mb-2">Verifying…</h1>
          <p className="wc-muted text-sm">Hang on, confirming your email.</p>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="w-14 h-14 rounded-full mx-auto mb-4 grid place-items-center"
            style={{ background: 'color-mix(in srgb,var(--success) 12%,transparent)', color: 'var(--success)' }}>
            <CheckCheck className="w-7 h-7" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-extrabold mb-2">Email verified!</h1>
          <p className="wc-muted text-sm mb-6">You&apos;re all set — you can now join the live chat.</p>
          <Link href="/" className="wc-btn wc-btn-primary wc-btn-block">
            Go to the station
          </Link>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="w-14 h-14 rounded-full mx-auto mb-4 grid place-items-center"
            style={{ background: 'color-mix(in srgb,var(--destructive) 12%,transparent)', color: 'var(--destructive)' }}>
            <XCircle className="w-7 h-7" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-extrabold mb-2">Link expired or invalid</h1>
          <p className="wc-muted text-sm mb-4">{errMsg || 'The verification link may have expired.'}</p>
          {resent ? (
            <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
              New link sent — check your inbox.
            </p>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="wc-btn-block"
              onClick={handleResend}
              disabled={sending}
            >
              {sending ? 'Sending…' : 'Resend verification email'}
            </Button>
          )}
          <Link href="/login" className="block text-sm font-semibold text-maroon mt-4">
            ← Back to sign in
          </Link>
        </>
      )}

      {status === 'pending' && (
        <>
          <h1 className="text-2xl font-extrabold mb-2">Check your inbox</h1>
          <p className="wc-muted text-sm mb-4">
            We sent you a verification link. Click it to activate your account.
          </p>
          <Link href="/login" className="text-sm font-semibold text-maroon">
            ← Back to sign in
          </Link>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="wc-auth-grid">
      <AuthBrandPane variant="login" />
      <main className="wc-auth-form">
        <Suspense
          fallback={
            <div className="wc-auth-formcard flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-maroon" aria-hidden="true" />
            </div>
          }
        >
          <VerifyContent />
        </Suspense>
      </main>
    </div>
  );
}
