"use client";

/**
 * /reset-password — reads ?token= via useSearchParams in <Suspense>
 * Calls Better Auth reset-password; on success redirects to /login
 */
import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Loader2, CheckCheck } from 'lucide-react';
import { z } from 'zod/v4';
import { authClient } from '@/lib/auth/client';
import { AuthBrandPane } from '@/components/auth/auth-brand-pane';

const schema = z
  .object({
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirm:     z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, {
    path: ['confirm'],
    message: "Passwords don't match",
  });

function ResetForm() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [error,       setError]       = useState<string | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [done,        setDone]        = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ newPassword, confirm });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (!token) {
      setError('Missing reset token. Please use the link from your email.');
      return;
    }
    setLoading(true);
    try {
      await authClient.resetPassword({ newPassword, token });
      setDone(true);
      setTimeout(() => router.replace('/login'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="wc-auth-formcard text-center py-6">
        <h1 className="text-2xl font-extrabold mb-2">Invalid link</h1>
        <p className="wc-muted text-sm mb-4">Use the link from your reset email.</p>
        <Link href="/forgot-password" className="wc-btn wc-btn-outline wc-btn-block">
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="wc-auth-formcard text-center py-6">
        <div className="w-14 h-14 rounded-full mx-auto mb-4 grid place-items-center"
          style={{ background: 'color-mix(in srgb,var(--success) 12%,transparent)', color: 'var(--success)' }}>
          <CheckCheck className="w-7 h-7" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-extrabold mb-2">Password updated!</h1>
        <p className="wc-muted text-sm">Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <div className="wc-auth-formcard">
      <Link
        href="/login"
        className="inline-flex items-center gap-1 text-sm font-semibold wc-muted hover:text-foreground mb-6"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        Back to sign in
      </Link>

      <h1 className="text-2xl font-extrabold">Set a new password</h1>
      <p className="wc-muted text-sm mt-1 mb-6">Choose something strong, wildcat.</p>

      <form onSubmit={handleSubmit} noValidate>
        {error && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-xl text-sm font-semibold"
            style={{ background: 'color-mix(in srgb,var(--destructive) 10%,transparent)', color: 'var(--destructive)' }}
          >
            {error}
          </div>
        )}

        <label className="wc-label" htmlFor="rp-pass">New password</label>
        <input
          id="rp-pass"
          type="password"
          autoComplete="new-password"
          className="wc-input mb-3"
          placeholder="••••••••"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />

        <label className="wc-label" htmlFor="rp-confirm">Confirm password</label>
        <input
          id="rp-confirm"
          type="password"
          autoComplete="new-password"
          className="wc-input mb-4"
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />

        <button
          type="submit"
          className="wc-btn wc-btn-primary wc-btn-block"
          disabled={loading}
        >
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
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
          <ResetForm />
        </Suspense>
      </main>
    </div>
  );
}
