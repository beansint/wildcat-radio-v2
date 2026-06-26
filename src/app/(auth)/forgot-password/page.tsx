"use client";

/**
 * /forgot-password — email input → calls Better Auth forget-password → "check inbox"
 */
import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, MailCheck } from 'lucide-react';
import { z } from 'zod/v4';
import { authClient } from '@/lib/auth/client';
import { AuthBrandPane } from '@/components/auth/auth-brand-pane';

const schema = z.object({
  email: z.email('Please enter a valid email'),
});

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('');
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wc-auth-grid">
      <AuthBrandPane variant="login" />
      <main className="wc-auth-form">
        <div className="wc-auth-formcard">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-sm font-semibold wc-muted hover:text-foreground mb-6"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            Back to sign in
          </Link>

          {sent ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full mx-auto mb-4 grid place-items-center"
                style={{ background: 'color-mix(in srgb,var(--success) 12%,transparent)', color: 'var(--success)' }}>
                <MailCheck className="w-7 h-7" aria-hidden="true" />
              </div>
              <h1 className="text-2xl font-extrabold mb-2">Check your inbox</h1>
              <p className="wc-muted text-sm">
                If that email has an account, we&apos;ve sent a reset link. Check your spam folder too.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold">Forgot your password?</h1>
              <p className="wc-muted text-sm mt-1 mb-6">
                Enter your email and we&apos;ll send you a reset link.
              </p>

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

                <label className="wc-label" htmlFor="fp-email">Email</label>
                <input
                  id="fp-email"
                  type="email"
                  autoComplete="email"
                  className="wc-input mb-4"
                  placeholder="you@cit.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />

                <button
                  type="submit"
                  className="wc-btn wc-btn-primary wc-btn-block"
                  disabled={loading}
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
