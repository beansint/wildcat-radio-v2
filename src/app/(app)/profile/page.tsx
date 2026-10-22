"use client";

/**
 * /profile — account basics and an optional audience survey.
 * Verification and moderation standing are separate; handles remain editable.
 * Survey values and intentional consent changes share one profile PATCH;
 * clearing fields never requires consent. Anonymous age contribution is a
 * separate one-time request with explicit partial-failure feedback.
 * Notification preferences save independently from survey edits.
 */
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Save,
  Shield,
  Bell,
  LogOut,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { useSession, signOut, type SessionUser } from '@/lib/auth/client';
import { customFetch } from '@/lib/api/fetcher';
import { ProfileBasics } from '@/components/auth/profile-basics';
import { VerificationResend } from '@/components/auth/verification-resend';
import { hasDemographicsConsent, normalizeGender } from '@/lib/auth/account-flows';
import { useListMyConsents, getListMyConsentsQueryKey } from '@/lib/api/endpoints/compliance/compliance';
import type { ConsentRecordDto } from '@/lib/api/model';
import {
  useUsersControllerGetMe,
  usersControllerUpdateMe,
  getUsersControllerGetMeQueryKey,
} from '@/lib/api/endpoints/users/users';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/* ------------------------------------------------------------------ types */

type AgeBucket = '18-20' | '21-23' | '24+' | 'prefer-not-to-say';
type Gender = 'female' | 'male' | 'nonbinary' | 'other' | 'prefer-not-to-say';

const AGE_BUCKETS: { label: string; value: AgeBucket }[] = [
  { label: '18–20', value: '18-20' },
  { label: '21–23', value: '21-23' },
  { label: '24+',   value: '24+' },
  { label: 'Prefer not to say', value: 'prefer-not-to-say' },
];

const GENDERS: { value: Gender; label: string }[] = [{ value: 'female', label: 'Woman' }, { value: 'male', label: 'Man' }, { value: 'nonbinary', label: 'Non-binary' }, { value: 'other', label: 'Other' }, { value: 'prefer-not-to-say', label: 'Prefer not to say' }];

const COLLEGES = [
  'CCS — Computer Studies',
  'COE — Engineering & Architecture',
  'CASE — Arts, Sciences & Education',
  'CMBA — Management, Business & Accountancy',
  'CNAHS — Nursing & Allied Health Sciences',
  'CCJ — Criminal Justice',
] as const;

/* ------------------------------------------------------------------ component */

export default function ProfilePage() {
  const { data: sessionData } = useSession();
  const sessionUser = sessionData?.user as SessionUser | undefined;
  const router = useRouter();
  const queryClient = useQueryClient();

  // Fetch the full user profile (editable projection)
  const { data: profile, isLoading, isError, error, refetch } = useUsersControllerGetMe({ query: { retry: false } });
  const consentsQuery = useListMyConsents<ConsentRecordDto[]>();

  /* ---- about-you form state ---- */
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [yearLevel, setYearLevel] = useState<string>('');
  const [college,   setCollege]   = useState<string>('');
  const [ageBucket, setAgeBucket] = useState<AgeBucket | ''>('');
  const [gender,    setGender]    = useState<Gender | ''>('');
  const [consent,   setConsent]   = useState(false);

  /* ---- notifications state ---- */
  const [notifyInApp, setNotifyInApp] = useState(true);
  const [notificationSaved, setNotificationSaved] = useState(false);

  /* ---- save state ---- */
  const [saving,          setSaving]          = useState(false);
  const [saveError,       setSaveError]       = useState<string | null>(null);
  const [ageBucketFired,  setAgeBucketFired]  = useState(false);
  const [surveySaved, setSurveySaved] = useState(false);

  // Hydrate form from profile on load (valid one-shot sync from server state — not cascading)
  useEffect(() => {
    if (!profile) return;
    // Mount controlled selects only after persisted values have been hydrated.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- valid form hydration from server state
    setYearLevel(profile.yearLevel ?? '');
    setCollege(profile.college ?? '');
    setGender(normalizeGender(profile.gender) as Gender | '');
    setAgeBucketFired(profile.ageBucketContributed);
    setNotifyInApp(profile.notifyInApp);
    setHydratedId(profile.id);
  }, [profile]);
  useEffect(() => {
    if (!consentsQuery.data) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the persisted privacy choice
    setConsent(hasDemographicsConsent(consentsQuery.data));
  }, [consentsQuery.data]);

  const isCampus = (profile?.class ?? sessionUser?.class) === 'CAMPUS';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSurveySaved(false);
    setSaving(true);

    try {
      // Profile and consent commit together; withdrawal never requires a grant.
      await usersControllerUpdateMe({
        yearLevel: yearLevel ? Number(yearLevel) : null,
        college: college || null,
        gender: gender || null,
        ...(consent !== hasDemographicsConsent(consentsQuery.data) ? {
          demographicsConsent: consent,
          expectedDemographicsConsent: hasDemographicsConsent(consentsQuery.data),
        } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: getListMyConsentsQueryKey() });

      // 3. POST age-bucket (once per user; disable re-fire after success)
      if (consent && ageBucket && !ageBucketFired) {
        try {
          await customFetch('/api/analytics/age-bucket', {
            method: 'POST',
            body: JSON.stringify({ bucket: ageBucket }),
          });
          setAgeBucketFired(true);
        } catch (error) {
          await queryClient.invalidateQueries({ queryKey: getUsersControllerGetMeQueryKey() });
          setSaveError(`Your profile and consent were saved, but the age sample could not be confirmed. ${error instanceof Error ? error.message : 'Please try again.'}`);
          return;
        }
      }

      // Invalidate getMe query so nav/session reflects changes
      await queryClient.invalidateQueries({ queryKey: getUsersControllerGetMeQueryKey() });
      setSurveySaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleNotifSave() {
    setSaveError(null);
    setNotificationSaved(false);
    setSaving(true);
    try {
      await usersControllerUpdateMe({ notifyInApp });
      setNotificationSaved(true);
      await queryClient.invalidateQueries({ queryKey: getUsersControllerGetMeQueryKey() });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/');
  }

  const emailVerified = profile?.emailVerified ?? sessionUser?.emailVerified ?? true;
  const handle = profile?.handle ?? sessionUser?.handle ?? sessionUser?.name ?? '—';
  const userClass = (profile?.class ?? sessionUser?.class ?? 'GUEST') as string;

  if (isError || (!isLoading && !profile)) {
    return (
      <main className="wc-container py-6">
        <div role="alert" className="wc-card wc-card-pad">
          <p>Could not load your profile.</p>
          <p>{error instanceof Error ? error.message : 'Please try again.'}</p>
          <Button className="mt-3" onClick={() => refetch()}>Try again</Button>
        </div>
      </main>
    );
  }

  if (isLoading || hydratedId !== profile?.id) {
    return (
      <main className="wc-container py-6" style={{ background: 'var(--muted)' }}>
        <div className="h-8 w-48 rounded-full bg-muted animate-pulse mb-4" />
        <div className="wc-card wc-card-pad mb-4 flex items-center gap-4">
          <div className="wc-avatar h-16 w-16 flex-none animate-pulse" />
          <div className="space-y-2">
            <div className="h-5 w-32 rounded-full bg-muted animate-pulse" />
            <div className="h-4 w-20 rounded-full bg-muted animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="wc-container py-6 pb-28" style={{ background: 'var(--muted)' }}>
      <h1 className="text-2xl font-extrabold mb-4">Your profile</h1>

      {/* ── VERIFICATION BANNER ── */}
      {!emailVerified && (
        <div
          className="wc-card wc-card-pad flex items-start gap-3 mb-4"
          style={{ background: 'color-mix(in srgb,var(--amber) 12%,var(--card))', borderColor: 'color-mix(in srgb,var(--amber) 40%,var(--border))' }}
          data-testid="profile-verify-banner"
        >
          <AlertTriangle className="w-5 h-5 flex-none mt-0.5" style={{ color: 'var(--amber)' }} aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Verify your email to join the chat</p>
            <p className="wc-help mt-0">Check your inbox for the verification link.</p>
          </div>
          <VerificationResend email={profile?.email ?? sessionUser?.email} />
        </div>
      )}

      {/* ── PROFILE CARD ── */}
      <div className="wc-card wc-card-pad flex items-center gap-4 mb-4">
        <div
          className="wc-avatar h-16 w-16 flex-none"
          style={profile?.avatarUrl ? { backgroundImage: `url(${profile.avatarUrl})`, backgroundSize: 'cover' } : undefined}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="text-xl font-extrabold truncate" data-testid="profile-handle">
            @{handle}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="wc-chip-ghost">{userClass}</span>
          </div>
        </div>
      </div>

      <ProfileBasics handle={handle} email={profile.email} emailVerified={emailVerified} userClass={userClass} />

      {/* ── ABOUT YOU ── */}
      <form className="wc-card wc-card-pad mb-4" onSubmit={handleSave}>
        <h2 className="text-lg font-extrabold mb-1">
          About you <span className="wc-muted font-normal text-sm">(optional)</span>
        </h2>
        <p className="wc-help mb-4">
          Optional audience survey. Details stay on your profile and are counted only with your consent. Your identity is never published in reports.
        </p>

        {saveError && (
          <div role="alert" className="mb-4 p-3 rounded-xl text-sm font-semibold"
            style={{ background: 'color-mix(in srgb,var(--destructive) 10%,transparent)', color: 'var(--destructive)' }}>
            {saveError}
          </div>
        )}

        {!isCampus && <p className="wc-help mb-3">Year level and college are for verified campus accounts. You can leave or clear these optional details.</p>}
        <div className={`grid sm:grid-cols-2 gap-4 mb-4 ${isCampus ? '' : 'hidden'}`}>
          <div>
            <Label htmlFor="yearLevel">Year level</Label>
            {/* Radix Select forbids an empty-string SelectItem, so use a sentinel
                to restore the native <option value=""> "clear" path. */}
            <Select
              value={yearLevel}
              onValueChange={(v) => setYearLevel(v === '__none__' ? '' : v)}
              disabled={!isCampus}
            >
              <SelectTrigger id="yearLevel" data-testid="profile-year">
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select year</SelectItem>
                {[1,2,3,4,5].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y === 1 ? '1st' : y === 2 ? '2nd' : y === 3 ? '3rd' : `${y}th`} year
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="college">College</Label>
            <Select
              value={college}
              onValueChange={(v) => setCollege(v === '__none__' ? '' : v)}
              disabled={!isCampus}
            >
              <SelectTrigger id="college" data-testid="profile-college">
                <SelectValue placeholder="Select college" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select college</SelectItem>
                {COLLEGES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mb-4">
          <span className="wc-label">Age range</span>
          <div className="flex flex-wrap gap-2">
            {AGE_BUCKETS.map(({ label, value }) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={ageBucket === value ? 'maroon' : 'outline'}
                aria-pressed={ageBucket === value}
                onClick={() => setAgeBucket(ageBucket === value ? '' : value)}
                data-testid="profile-age"
                disabled={ageBucketFired}
              >
                {label}
              </Button>
            ))}
          </div>
          <p className="wc-help">{ageBucketFired ? 'Your one-time anonymous age sample has already been recorded.' : 'Age is an anonymous one-time sample, not a saved profile field. After contribution, it cannot be linked back to you, changed, or withdrawn.'}</p>
        </div>

        <div className="mb-4">
          <span className="wc-label">Gender</span>
          <div className="flex flex-wrap gap-2">
            {GENDERS.map(({ value: g, label }) => (
              <Button
                key={g}
                type="button"
                size="sm"
                variant={gender === g ? 'maroon' : 'outline'}
                aria-pressed={gender === g}
                onClick={() => setGender(gender === g ? '' : g)}
                data-testid="profile-gender"
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Consent checkbox — gates Save */}
        <label className="flex items-start gap-2 text-sm wc-muted mb-4">
          <Checkbox
            checked={consent}
            disabled={consentsQuery.isLoading || consentsQuery.isError}
            onCheckedChange={(v) => setConsent(v === true)}
            data-testid="profile-consent"
            className="mt-1 flex-none"
          />
          <span>
            Count my optional details in anonymous audience reports. Uncheck and save to withdraw consent; you can also clear the fields below.
          </span>
        </label>

        <Button
          type="submit"
          variant="default"
          disabled={saving || consentsQuery.isLoading || consentsQuery.isError}
          data-testid="profile-save"
        >
          <Save className="w-4 h-4" aria-hidden="true" />
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="outline" className="ml-2" disabled={saving} onClick={() => { setYearLevel(''); setCollege(''); setGender(''); setAgeBucket(''); setConsent(false); setSurveySaved(false); }}>Clear optional fields</Button>
        {consentsQuery.isError && <p role="alert" className="wc-help text-destructive">Could not load your consent. <Button type="button" variant="outline" size="sm" onClick={() => void consentsQuery.refetch()}>Try again</Button></p>}
        {surveySaved && <p role="status" className="wc-help">Optional details saved. {consent ? 'Consent is active.' : 'Consent is withdrawn.'}</p>}
        <p className="wc-help">Clear prepares the form; Save applies it. <Link href="/my-data" className="underline">Manage your data and consent history</Link>.</p>
      </form>

      {/* ── NOTIFICATIONS ── */}
      <div className="wc-card wc-card-pad mb-4">
        <h2 className="text-lg font-extrabold mb-3">Notifications</h2>
        <div className="wc-stack">
          <label className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="font-semibold block">In-app receipts</span>
              <span className="wc-help mt-0 block">Show updates when a DJ queues or airs my request or dedication.</span>
            </span>
            <Switch
              checked={notifyInApp}
              onCheckedChange={(v) => { setNotifyInApp(v); setNotificationSaved(false); }}
              aria-label="In-app receipts"
              data-testid="notif-inapp"
            />
          </label>
        </div>
        <Button
          type="button"
          variant="default"
          data-testid="profile-notification-save"
          onClick={handleNotifSave}
          disabled={saving}
          className="mt-4"
        >
          <Save className="w-4 h-4" aria-hidden="true" />
          Save
        </Button>
      </div>

      {notificationSaved && <p role="status" data-testid="profile-notification-saved" className="mb-4">Notification preferences saved.</p>}

      {/* ── QUICK LINKS ── */}
      <div className="wc-card divide-y">
        <Link
          href="/profile/standing"
          className="wc-card-pad flex items-center gap-3 hover:bg-[var(--muted)]"
        >
          <Shield className="w-5 h-5 text-maroon flex-none" aria-hidden="true" />
          <span className="flex-1 font-semibold">View my standing</span>
          <ChevronRight className="w-5 h-5 wc-muted" aria-hidden="true" />
        </Link>
        <Link
          href="/notifications"
          className="wc-card-pad flex items-center gap-3 hover:bg-[var(--muted)]"
        >
          <Bell className="w-5 h-5 text-maroon flex-none" aria-hidden="true" />
          <span className="flex-1 font-semibold">My notifications</span>
          <ChevronRight className="w-5 h-5 wc-muted" aria-hidden="true" />
        </Link>
        <button
          type="button"
          className="wc-card-pad flex items-center gap-3 hover:bg-[var(--muted)] w-full text-left"
          onClick={handleSignOut}
          data-testid="profile-signout"
        >
          <LogOut className="w-5 h-5 wc-muted flex-none" aria-hidden="true" />
          <span className="flex-1 font-semibold">Sign out</span>
          <ChevronRight className="w-5 h-5 wc-muted" aria-hidden="true" />
        </button>
      </div>
    </main>
  );
}
