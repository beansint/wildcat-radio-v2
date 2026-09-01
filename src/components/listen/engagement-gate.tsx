"use client";

/**
 * Engagement gate for the /listen page interactive features (chat, requests, dedications, Q&A).
 * Reactions stay open - never gated.
 *
 * Usage:
 *   const gate = useEngagementGate();   // 'anon' | 'unverified' | 'ok'
 *   if (gate !== 'ok') return <EngagementGateNotice gate={gate} />;
 */
import Link from 'next/link';
import { useSession, type SessionUser } from '@/lib/auth/client';
import { usePathname } from 'next/navigation';

export type GateState = 'pending' | 'anon' | 'unverified' | 'ok';

export function useEngagementGate(): GateState {
  const { data, isPending } = useSession();
  // Session still loading is PENDING, not authorized (FE#65): treating it as
  // 'ok' briefly showed the composer to signed-out users, whose first send
  // then failed with an unexplained auth error.
  if (isPending) return 'pending';
  if (!data) return 'anon';
  const user = data.user as SessionUser;
  if (!user.emailVerified) return 'unverified';
  return 'ok';
}

interface EngagementGateNoticeProps {
  gate: GateState;
  /** Current pathname for ?next= redirect */
  next?: string;
}

export function EngagementGateNotice({ gate, next }: EngagementGateNoticeProps) {
  const pathname = usePathname();
  const nextParam = encodeURIComponent(next ?? pathname);

  if (gate === 'pending') {
    // Neutral placeholder while the session resolves — same footprint as the
    // sign-in notice so the layout doesn't jump when the real state lands.
    return <div className="p-2.5 text-sm text-muted-foreground" aria-hidden="true" />;
  }

  if (gate === 'anon') {
    return (
      <div className="flex items-center gap-2 p-2.5 text-sm text-muted-foreground">
        <Link
          href={`/login?next=${nextParam}`}
          className="wc-btn wc-btn-primary wc-btn-sm"
          data-testid="listen-gate-signin"
        >
          Sign in to join the chat
        </Link>
      </div>
    );
  }

  if (gate === 'unverified') {
    return (
      <div className="flex items-center gap-2 p-2.5 text-sm text-muted-foreground">
        <Link
          href="/verify-email"
          className="wc-btn wc-btn-outline wc-btn-sm"
          data-testid="listen-gate-verify"
        >
          Verify your email to chat
        </Link>
      </div>
    );
  }

  return null;
}
