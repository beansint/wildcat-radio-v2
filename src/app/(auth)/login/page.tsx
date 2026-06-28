"use client";

/**
 * /login — 1:1 from docs/frontend-design-basis-prototype/public/login.html
 *
 * - Email + password sign-in via Better Auth
 * - CIT account (Entra) button rendered DISABLED with "coming soon" affordance (Gate B/M9)
 * - On success: redirects to ?next= or /
 * - react-hook-form + zod validation
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ChevronLeft, Building2 } from 'lucide-react';
import { z } from 'zod/v4';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signIn } from '@/lib/auth/client';
import { AuthBrandPane } from '@/components/auth/auth-brand-pane';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const loginSchema = z.object({
  email:    z.email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const nextUrl      = searchParams.get('next') ?? '/';

  const [formError, setFormError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(
    async (values) => {
      setFormError(null);
      try {
        const result = await signIn.email({ email: values.email, password: values.password });
        if (result.error) {
          setFormError(result.error.message ?? 'Sign-in failed. Please try again.');
        } else {
          router.replace(nextUrl);
        }
      } catch {
        setFormError('Something went wrong. Please try again.');
      }
    },
    (errors) => {
      setFormError(
        (Object.values(errors)[0] as { message?: string } | undefined)?.message
          ?? 'Please check the form',
      );
    },
  );

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
      <Button
        type="button"
        variant="maroon"
        className="wc-btn-block opacity-50 cursor-not-allowed"
        disabled
        aria-disabled="true"
        title="Campus sign-in coming soon (Gate B / M9)"
        data-testid="auth-cit-btn"
      >
        <Building2 className="w-5 h-5" aria-hidden="true" />
        Sign in with your CIT account
      </Button>
      <p className="wc-help text-center">
        Campus (Microsoft Entra) sign-in — coming soon.
      </p>

      <div className="wc-divider my-5">or</div>

      {/* Email / password */}
      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-xl text-sm font-semibold"
            style={{ background: 'color-mix(in srgb,var(--destructive) 10%,transparent)', color: 'var(--destructive)' }}
          >
            {formError}
          </div>
        )}

        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          className="mb-3"
          placeholder="you@cit.edu"
          data-testid="auth-email"
          {...register('email')}
        />

        <Label htmlFor="login-pass">Password</Label>
        <Input
          id="login-pass"
          type="password"
          autoComplete="current-password"
          className="mb-2"
          placeholder="••••••••"
          data-testid="auth-password"
          {...register('password')}
        />

        <div className="flex justify-end mb-4">
          <Link href="/forgot-password" className="text-sm font-semibold text-maroon">
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          className="wc-btn-block"
          disabled={isSubmitting}
          data-testid="auth-submit"
        >
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
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
