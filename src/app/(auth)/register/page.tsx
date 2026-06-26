"use client";

/**
 * /register — 1:1 from docs/frontend-design-basis-prototype/public/register.html
 *
 * - Email + handle + password + confirm + terms checkbox
 * - CIT account button rendered DISABLED with "coming soon" (Gate B/M9)
 * - On success: show "check your inbox" banner (user is already logged in)
 * - Client-side zod validation
 */
import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Building2, CheckCheck } from 'lucide-react';
import { z } from 'zod/v4';
import { signUp } from '@/lib/auth/client';
import { AuthBrandPane } from '@/components/auth/auth-brand-pane';

const registerSchema = z
  .object({
    email:    z.email('Please enter a valid email'),
    handle:   z.string().min(2, 'Handle must be at least 2 characters').max(30, 'Handle too long').regex(/^[a-zA-Z0-9_]+$/, 'Handle can only contain letters, numbers, and underscores'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm:  z.string(),
    terms:    z.boolean().refine((v) => v, 'You must accept the terms'),
  })
  .refine((d) => d.password === d.confirm, {
    path: ['confirm'],
    message: "Passwords don't match",
  });

export default function RegisterPage() {
  const [email,    setEmail]    = useState('');
  const [handle,   setHandle]   = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [terms,    setTerms]    = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = registerSchema.safeParse({ email, handle, password, confirm, terms });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      const result = await signUp.email({
        email,
        password,
        name: handle,
        // additional fields expected by inferAdditionalFields config
        handle,
        class: 'GUEST' as const,
        role: 'LISTENER' as const,
        callbackURL: '/',
      } as Parameters<typeof signUp.email>[0]);
      if (result.error) {
        setError(result.error.message ?? 'Registration failed. Please try again.');
      } else {
        setDone(true);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wc-auth-grid">
      <AuthBrandPane variant="register" />

      <main className="wc-auth-form">
        <div className="wc-auth-formcard">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm font-semibold wc-muted hover:text-foreground mb-6"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            Back to site
          </Link>

          {done ? (
            /* Verify email state — user is already logged in */
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full mx-auto mb-4 grid place-items-center"
                style={{ background: 'color-mix(in srgb,var(--success) 12%,transparent)', color: 'var(--success)' }}>
                <CheckCheck className="w-7 h-7" aria-hidden="true" />
              </div>
              <h1 className="text-2xl font-extrabold mb-2">Welcome, wildcat!</h1>
              <p className="wc-muted text-sm mb-4">
                Your account is active. Check your inbox to verify your email — you can still browse and react while you wait.
              </p>
              <Link href="/" className="wc-btn wc-btn-primary wc-btn-block">
                Go to the station
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold">Create your account</h1>
              <p className="wc-muted text-sm mt-1 mb-6">
                Takes a minute — then you&apos;re in the chat, mga &apos;dong.
              </p>

              {/* CIT account — coming soon */}
              <button
                type="button"
                className="wc-btn wc-btn-maroon wc-btn-block opacity-50 cursor-not-allowed"
                disabled
                aria-disabled="true"
                title="Campus sign-up coming soon (Gate B / M9)"
                data-testid="auth-cit-btn"
              >
                <Building2 className="w-5 h-5" aria-hidden="true" />
                Sign up with your CIT account
              </button>
              <p className="wc-help text-center">
                Recommended for verified CIT-U students — coming soon.
              </p>

              <div className="wc-divider my-5">or guest sign up</div>

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

                <label className="wc-label" htmlFor="reg-email">Email</label>
                <input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  className="wc-input mb-3"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="auth-email"
                />

                <label className="wc-label" htmlFor="reg-handle">Public handle</label>
                <input
                  id="reg-handle"
                  type="text"
                  autoComplete="username"
                  className="wc-input mb-1"
                  placeholder="wildcat_juan"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  required
                  data-testid="auth-handle"
                />
                <p className="wc-help mb-3">
                  This is what shows in the chat — keep it clean, mga &apos;dong.
                </p>

                <label className="wc-label" htmlFor="reg-pass">Password</label>
                <input
                  id="reg-pass"
                  type="password"
                  autoComplete="new-password"
                  className="wc-input mb-3"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="auth-password"
                />

                <label className="wc-label" htmlFor="reg-confirm">Confirm password</label>
                <input
                  id="reg-confirm"
                  type="password"
                  autoComplete="new-password"
                  className="wc-input mb-3"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  data-testid="auth-confirm"
                />

                <label className="flex items-start gap-2 text-sm wc-muted mb-4">
                  <input
                    type="checkbox"
                    className="mt-1 flex-none"
                    checked={terms}
                    onChange={(e) => setTerms(e.target.checked)}
                    required
                    data-testid="auth-terms"
                  />
                  <span>
                    I agree to the Wildcat Radio{' '}
                    <a href="#" className="font-semibold text-maroon">Terms</a> and{' '}
                    <a href="#" className="font-semibold text-maroon">Community Guidelines</a>.
                  </span>
                </label>

                <button
                  type="submit"
                  className="wc-btn wc-btn-primary wc-btn-block"
                  disabled={loading}
                  data-testid="auth-submit"
                >
                  {loading ? 'Creating account…' : 'Create account'}
                </button>
              </form>

              <p className="text-center text-sm wc-muted mt-6">
                Already have an account?{' '}
                <Link href="/login" className="font-semibold text-maroon">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
