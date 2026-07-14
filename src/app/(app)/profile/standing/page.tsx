"use client";

/**
 * /profile/standing — listener-facing "your standing" page (strikes, mute/
 * ban state, appeal a strike, reinstatement request), 1:1 with
 * docs/frontend-design-basis-prototype/listener/standing.html.
 *
 * Lives in `(app)` (session-gated, gets the public top-nav/player chrome) —
 * light register, does NOT force dark like the `/mod` staff shell.
 *
 * Data: useUsersControllerGetMeStanding → MeStandingDto. Strikes are
 * "active" when `expiresAt` is still in the future — that count drives the
 * "N of 3 strikes" stat and gates whether the appeal card shows a real form.
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useUsersControllerGetMeStanding } from "@/lib/api/endpoints/users/users";
import { StatusSummaryCard } from "@/components/standing/status-summary-card";
import { StrikeHistoryCard } from "@/components/standing/strike-history-card";
import { AppealCard } from "@/components/standing/appeal-card";
import { ReinstatementCard } from "@/components/standing/reinstatement-card";
import { isFuture } from "@/components/standing/format";

export default function StandingPage() {
  const { data: standing, isLoading } = useUsersControllerGetMeStanding();

  const strikes = standing?.strikes ?? [];
  const activeStrikes = strikes.filter((s) => isFuture(s.expiresAt));
  // `mutedUntil` isn't nulled once it lapses — an expired mute must read as
  // not-muted, so gate on it still being in the future (matches
  // `src/components/mod/users/status.ts`'s `userStatus`).
  const isMuted = !!standing?.mutedUntil && isFuture(standing.mutedUntil);
  const isBanned = !!standing?.bannedAt;

  // Most recently-issued active strike — the appeal form attaches to this one.
  const latestActiveStrike = [...activeStrikes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];

  const hasSomethingToAppeal = activeStrikes.length > 0 || isMuted || isBanned;

  return (
    <main className="wc-container py-6 pb-28" style={{ background: "var(--muted)" }}>
      <Link
        href="/profile"
        className="inline-flex items-center gap-1 text-sm font-semibold wc-muted hover:text-foreground mb-4"
        data-testid="standing-back"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        Back to profile
      </Link>

      <h1 className="text-2xl font-extrabold mb-4">Your standing</h1>

      {isLoading || !standing ? (
        <div className="wc-card wc-card-pad mb-4">
          <div className="h-6 w-40 rounded-full bg-muted animate-pulse mb-3" />
          <div className="h-8 w-24 rounded-full bg-muted animate-pulse" />
        </div>
      ) : (
        <>
          <StatusSummaryCard standing={standing} activeStrikes={activeStrikes} />
          <StrikeHistoryCard strikes={strikes} />
          <AppealCard
            subjectStrikeId={latestActiveStrike?.id}
            hasSomethingToAppeal={hasSomethingToAppeal}
          />
          <ReinstatementCard isBanned={isBanned} />
        </>
      )}
    </main>
  );
}
