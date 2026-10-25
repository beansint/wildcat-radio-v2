"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod/v4';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { usersControllerUpdateMe, useUsersControllerGetMeStanding } from '@/lib/api/endpoints/users/users';
import { moderationStanding } from '@/lib/auth/account-flows';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getApiErrorMessage } from '@/lib/api/error-message';

const handleSchema = z.object({ handle: z.string().min(3, 'Use at least 3 characters.').max(30, 'Use at most 30 characters.').regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers, or underscores.') });
export function ProfileBasics({ handle, email, emailVerified, userClass }: { handle: string; email: string; emailVerified: boolean; userClass: string }) {
  const standing = useUsersControllerGetMeStanding();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({ resolver: zodResolver(handleSchema), defaultValues: { handle } });
  const submit = handleSubmit(async values => {
    setSaved(false); setError('');
    try {
      await usersControllerUpdateMe(values);
      await authClient.getSession({ query: { disableCookieCache: true } });
      await queryClient.invalidateQueries();
      setSaved(true);
    } catch (error) { setError(getApiErrorMessage(error)); }
  }, errors => { setSaved(false); setError(errors.handle?.message ?? 'Check your handle.'); });
  return <section className="wc-card wc-card-pad mb-4">
    <h2 className="text-lg font-extrabold">Account basics</h2>
    <p className="text-sm mt-2 break-all">{email} · {emailVerified ? 'Email verified' : 'Email not verified'}</p>
    <p className="text-sm mt-2" data-testid="profile-standing">{standing.isLoading ? 'Checking standing…' : moderationStanding(standing.data)}</p>
    <p className="wc-help">{userClass === 'CAMPUS' ? 'Campus status means your current @cit.edu email is verified. It is not proof of enrollment.' : 'Guest is an account class. Verify your email to write in the chat; a verified @cit.edu address qualifies for campus status.'}</p>
    <form onSubmit={submit} className="mt-4" noValidate>
      <Label htmlFor="profile-edit-handle">Handle</Label>
      <Input id="profile-edit-handle" autoComplete="username" {...register('handle')} />
      <p className="wc-help">3–30 lowercase letters, numbers, or underscores. This name is public.</p>
      {error && <p role="alert" className="wc-help text-destructive">{error}</p>}
      {saved && <p role="status" className="wc-help">Handle saved.</p>}
      <Button type="submit" disabled={isSubmitting} className="mt-2">{isSubmitting ? 'Saving…' : 'Save handle'}</Button>
    </form>
    <Link href="/forgot-password" className="inline-block mt-4 underline text-sm">Reset password</Link>
  </section>;
}
