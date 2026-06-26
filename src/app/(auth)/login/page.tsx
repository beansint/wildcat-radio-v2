"use client";

/**
 * /login — 1:1 from docs/frontend-design-basis-prototype/public/login.html
 *
 * - Email + password sign-in via Better Auth
 * - CIT account (Entra) button rendered DISABLED with "coming soon" affordance (Gate B/M9)
 * - On success: redirects to ?next= or /
 * - Client-side zod validation
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ChevronLeft, Building2 } from 'lucide-react';
import { z } from 'zod/v4';
import { signIn } from '@/lib/auth/client';
import { AuthBrandPane } from '@/components/auth/auth-brand-pane';

const loginSchema = z.object({
  email:    z.email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const nextUrl      = searchParams.get('next') ?? '/';

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? 'Sign-in failed. Please try again.');
      } else {
        router.replace(nextUrl);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wc-auth-formcard">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm font-semibold wc-muted hover:text-foreground mb-6"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        Back to site
      </Link>

      <h1 className="text-2xl font-extrabold">Welcome back, wildcat</h1>
      <p className="wc-muted text-sm mt-1 mb-6">
        Sign in to request songs, join the chat, at i-save ang favorites mo.
      </p>

      {/* CIT account — coming soon */}
      <button
        type="button"
        className="wc-btn wc-btn-maroon wc-btn-block opacity-50 cursor-not-allowed"
        disabled
        aria-disabled="true"
        title="Campus sign-in coming soon (Gate B / M9)"
        data-testid="auth-cit-btn"
      >
        <Building2 className="w-5 h-5" aria-hidden="true" />
        Sign in with your CIT account
      </button>
      <p className="wc-help text-center">
        Campus (Microsoft Entra) sign-in — coming soon.
      </p>

      <div className="wc-divider my-5">or</div>

      {/* Email / password */}
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

        <label className="wc-label" htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          className="wc-input mb-3"
          placeholder="you@cit.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          data-testid="auth-email"
        />

        <label className="wc-label" htmlFor="login-pass">Password</label>
        <input
          id="login-pass"
          type="password"
          autoComplete="current-password"
          className="wc-input mb-2"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          data-testid="auth-password"
        />

        <div className="flex justify-end mb-4">
          <Link href="/forgot-password" className="text-sm font-semibold text-maroon">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          className="wc-btn wc-btn-primary wc-btn-block"
          disabled={loading}
          data-testid="auth-submit"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-sm wc-muted mt-6">
        New here?{' '}
        <Link href="/register" className="font-semibold text-maroon">
          Create your account →
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="wc-auth-grid">
      <AuthBrandPane variant="login" />
      <main className="wc-auth-form">
        <Suspense fallback={<div className="wc-auth-formcard" />}>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}
