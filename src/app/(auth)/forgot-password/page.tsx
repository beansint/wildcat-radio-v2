"use client";

/**
 * /forgot-password — email input → calls Better Auth forget-password → "check inbox"
 */
import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, MailCheck } from 'lucide-react';
import { z } from 'zod/v4';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { authClient } from '@/lib/auth/client';
import { AuthBrandPane } from '@/components/auth/auth-brand-pane';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  email: z.email('Please enter a valid email'),
});

type FPValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [formError, setFormError] = useState<string | null>(null);
  const [sent,      setSent]      = useState(false);

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<FPValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(
    async (values) => {
      setFormError(null);
      try {
        // Anti-enumeration: Better Auth resolves successfully for unknown emails, so
        // "check your inbox" is shown regardless. We only surface genuine transport
        // failures (rate-limit / server error) — never "account doesn't exist".
        const { error } = await authClient.requestPasswordReset({ email: values.email, redirectTo: '/reset-password' });
        if (error) {
          setFormError(error.message ?? 'Something went wrong. Please try again.');
          return;
        }
        setSent(true);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Something went wrong.');
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

                <Label htmlFor="fp-email">Email</Label>
                <Input
                  id="fp-email"
                  type="email"
                  autoComplete="email"
                  className="mb-4"
                  placeholder="you@cit.edu"
                  {...register('email')}
                />

                <Button
                  type="submit"
                  className="wc-btn-block"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Sending…' : 'Send reset link'}
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
