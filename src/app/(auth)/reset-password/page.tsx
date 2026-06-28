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
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { authClient } from '@/lib/auth/client';
import { AuthBrandPane } from '@/components/auth/auth-brand-pane';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z
  .object({
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirm:     z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, {
    path: ['confirm'],
    message: "Passwords don't match",
  });

type RPValues = z.infer<typeof schema>;

function ResetForm() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get('token') ?? '';

  const [formError, setFormError] = useState<string | null>(null);
  const [done,      setDone]      = useState(false);

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<RPValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '', confirm: '' },
  });

  const onSubmit = handleSubmit(
    async (values) => {
      setFormError(null);
      if (!token) {
        setFormError('Missing reset token. Please use the link from your email.');
        return;
      }
      try {
        // Better Auth returns { error } without throwing for an expired/used token —
        // must check it, else we'd falsely show "Password updated!" and lock the user out.
        const { error } = await authClient.resetPassword({ newPassword: values.newPassword, token });
        if (error) {
          setFormError(error.message ?? 'Reset failed. The link may have expired.');
          return;
        }
        setDone(true);
        setTimeout(() => router.replace('/login'), 2500);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Reset failed. The link may have expired.');
      }
    },
    (errors) => {
      setFormError(
        (Object.values(errors)[0] as { message?: string } | undefined)?.message
          ?? 'Please check the form',
      );
    },
  );

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

        <Label htmlFor="rp-pass">New password</Label>
        <Input
          id="rp-pass"
          type="password"
          autoComplete="new-password"
          className="mb-3"
          placeholder="••••••••"
          {...register('newPassword')}
        />

        <Label htmlFor="rp-confirm">Confirm password</Label>
        <Input
          id="rp-confirm"
          type="password"
          autoComplete="new-password"
          className="mb-4"
          placeholder="••••••••"
          {...register('confirm')}
        />

        <Button
          type="submit"
          className="wc-btn-block"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Updating…' : 'Update password'}
        </Button>
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
