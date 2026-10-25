"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';
import { requestVerification } from '@/lib/auth/account-flows';

export function VerificationResend({ email }: { email?: string }) {
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState('');
  const [queued, setQueued] = useState(false);
  useEffect(() => {
    if (!remaining) return;
    const timer = window.setTimeout(() => setRemaining(value => Math.max(0, value - 1)), 1_000);
    return () => window.clearTimeout(timer);
  }, [remaining]);
  async function resend() {
    if (!email) return;
    setBusy(true);
    setError('');
    setQueued(false);
    try {
      const result = await requestVerification(email, data => authClient.sendVerificationEmail(data));
      setQueued(true);
      setRemaining(result.retryAfterSeconds);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Email could not be queued. Try again.');
      setRemaining((error as { retryAfterSeconds?: number }).retryAfterSeconds ?? 0);
    } finally { setBusy(false); }
  }
  if (!email) return <Button asChild variant="outline"><Link href="/login?next=/profile">Sign in to resend</Link></Button>;
  return <div className="space-y-2">
    <Button type="button" variant="outline" size="sm" disabled={busy || remaining > 0} onClick={resend}>
      {busy ? 'Queuing…' : remaining > 0 ? `Try again in ${remaining}s` : 'Resend verification email'}
    </Button>
    {queued && <p role="status" className="wc-help">Verification email queued. Delivery may take a few minutes; check spam too.</p>}
    {error && <p role="alert" className="wc-help text-destructive">{error}</p>}
  </div>;
}
