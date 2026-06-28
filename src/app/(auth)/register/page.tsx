"use client";

/**
 * /register — 1:1 from docs/frontend-design-basis-prototype/public/register.html
 *
 * - Email + handle + password + confirm + terms checkbox
 * - CIT account button rendered DISABLED with "coming soon" (Gate B/M9)
 * - On success: show "check your inbox" banner (user is already logged in)
 * - react-hook-form + zod validation
 */
import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Building2, CheckCheck } from 'lucide-react';
import { z } from 'zod/v4';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signUp } from '@/lib/auth/client';
import { AuthBrandPane } from '@/components/auth/auth-brand-pane';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [formError, setFormError] = useState<string | null>(null);
  const [done,      setDone]      = useState(false);

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', handle: '', password: '', confirm: '', terms: false },
  });

  const onSubmit = handleSubmit(
    async (values) => {
      setFormError(null);
      try {
        const result = await signUp.email({
          email:       values.email,
          password:    values.password,
          name:        values.handle,
          // additional fields expected by inferAdditionalFields config
          handle:      values.handle,
          class:       'GUEST' as const,
          role:        'LISTENER' as const,
          callbackURL: '/',
        } as Parameters<typeof signUp.email>[0]);
        if (result.error) {
          setFormError(result.error.message ?? 'Registration failed. Please try again.');
        } else {
          setDone(true);
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
              <Button
                type="button"
                variant="maroon"
                className="wc-btn-block opacity-50 cursor-not-allowed"
                disabled
                aria-disabled="true"
                title="Campus sign-up coming soon (Gate B / M9)"
                data-testid="auth-cit-btn"
              >
                <Building2 className="w-5 h-5" aria-hidden="true" />
                Sign up with your CIT account
              </Button>
              <p className="wc-help text-center">
                Recommended for verified CIT-U students — coming soon.
              </p>

              <div className="wc-divider my-5">or guest sign up</div>

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

                <Label htmlFor="reg-email">Email</Label>
                <Input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  className="mb-3"
                  placeholder="you@example.com"
                  data-testid="auth-email"
                  {...register('email')}
                />

                <Label htmlFor="reg-handle">Public handle</Label>
                <Input
                  id="reg-handle"
                  type="text"
                  autoComplete="username"
                  className="mb-1"
                  placeholder="wildcat_juan"
                  data-testid="auth-handle"
                  {...register('handle')}
                />
                <p className="wc-help mb-3">
                  This is what shows in the chat — keep it clean, mga &apos;dong.
                </p>

                <Label htmlFor="reg-pass">Password</Label>
                <Input
                  id="reg-pass"
                  type="password"
                  autoComplete="new-password"
                  className="mb-3"
                  placeholder="••••••••"
                  data-testid="auth-password"
                  {...register('password')}
                />

                <Label htmlFor="reg-confirm">Confirm password</Label>
                <Input
                  id="reg-confirm"
                  type="password"
                  autoComplete="new-password"
                  className="mb-3"
                  placeholder="••••••••"
                  data-testid="auth-confirm"
                  {...register('confirm')}
                />

                <label className="flex items-start gap-2 text-sm wc-muted mb-4">
                  <input
                    type="checkbox"
                    className="mt-1 flex-none"
                    data-testid="auth-terms"
                    {...register('terms')}
                  />
                  <span>
                    I agree to the Wildcat Radio{' '}
                    <a href="#" className="font-semibold text-maroon">Terms</a> and{' '}
                    <a href="#" className="font-semibold text-maroon">Community Guidelines</a>.
                  </span>
                </label>

                <Button
                  type="submit"
                  className="wc-btn-block"
                  disabled={isSubmitting}
                  data-testid="auth-submit"
                >
                  {isSubmitting ? 'Creating account…' : 'Create account'}
                </Button>
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
