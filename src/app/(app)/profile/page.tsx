"use client";

/**
 * /profile — 1:1 from docs/frontend-design-basis-prototype/listener/profile.html
 *
 * - Profile card: avatar, @handle, class chip, Active pill
 * - Verification banner when !emailVerified
 * - About you: year level + college selects (CAMPUS = full opacity, GUEST = muted)
 * - Age range + gender as segmented pick buttons (aria-pressed)
 * - Demographics consent checkbox gates About-you Save
 * - On Save: PATCH /users/me, POST /users/me/consent {granted:true}, POST /analytics/age-bucket
 * - Notifications card: wc-switch toggles
 * - Quick links: standing (stub), notifications, sign out
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
  RefreshCw,
  Check,
} from 'lucide-react';
import { useSession, signOut, type SessionUser } from '@/lib/auth/client';
import { customFetch } from '@/lib/api/fetcher';
import {
  useUsersControllerGetMe,
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

interface UserProfile {
  id: string;
  email: string;
  handle?: string;
  name?: string;
  avatarUrl?: string;
  class?: string;
  role?: string;
  emailVerified: boolean;
  notifyEmail?: boolean;
  notifyInApp?: boolean;
  yearLevel?: number;
  college?: string;
  gender?: string;
}

type AgeBucket = '18-20' | '21-23' | '24+' | 'prefer-not-to-say';
type Gender    = 'Woman' | 'Man' | 'Non-binary' | 'Prefer not to say';

const AGE_BUCKETS: { label: string; value: AgeBucket }[] = [
  { label: '18–20', value: '18-20' },
  { label: '21–23', value: '21-23' },
  { label: '24+',   value: '24+' },
  { label: 'Prefer not to say', value: 'prefer-not-to-say' },
];

const GENDERS: Gender[] = ['Woman', 'Man', 'Non-binary', 'Prefer not to say'];

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
  const { data: rawProfile, isLoading } = useUsersControllerGetMe();
  const profile = rawProfile as UserProfile | undefined;

  /* ---- about-you form state ---- */
  const [yearLevel, setYearLevel] = useState<string>('');
  const [college,   setCollege]   = useState<string>('');
  const [ageBucket, setAgeBucket] = useState<AgeBucket | ''>('');
  const [gender,    setGender]    = useState<Gender | ''>('');
  const [consent,   setConsent]   = useState(false);

  /* ---- notifications state ---- */
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyInApp, setNotifyInApp] = useState(true);

  /* ---- save state ---- */
  const [saving,          setSaving]          = useState(false);
  const [saveError,       setSaveError]       = useState<string | null>(null);
  const [ageBucketFired,  setAgeBucketFired]  = useState(false);
  const [resendingVerify, setResendingVerify] = useState(false);
  const [verifySent,      setVerifySent]      = useState(false);

  // Hydrate form from profile on load (valid one-shot sync from server state — not cascading)
  useEffect(() => {
    if (!profile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- valid form hydration from server state
    if (profile.yearLevel) setYearLevel(String(profile.yearLevel));
    if (profile.college)   setCollege(profile.college);
    if (profile.gender)    setGender(profile.gender as Gender);
    setNotifyEmail(profile.notifyEmail ?? true);
    setNotifyInApp(profile.notifyInApp ?? true);
  }, [profile]);

  const isCampus = (profile?.class ?? sessionUser?.class) === 'CAMPUS';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);

    try {
      // 1. PATCH /users/me
      await customFetch('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
          ...(yearLevel ? { yearLevel: parseInt(yearLevel) } : {}),
          ...(college   ? { college }                        : {}),
          ...(gender    ? { gender }                         : {}),
          notifyEmail,
          notifyInApp,
        }),
      });

      // 2. POST consent (if checked)
      if (consent) {
        await customFetch('/api/users/me/consent', {
          method: 'POST',
          body: JSON.stringify({ scope: 'DEMOGRAPHICS', granted: true }),
        });
      }

      // 3. POST age-bucket (once per user; disable re-fire after success)
      if (ageBucket && !ageBucketFired) {
        try {
          await customFetch('/api/analytics/age-bucket', {
            method: 'POST',
            body: JSON.stringify({ bucket: ageBucket }),
          });
          setAgeBucketFired(true);
        } catch {
          // idempotent — already recorded; ignore
          setAgeBucketFired(true);
        }
      }

      // Invalidate getMe query so nav/session reflects changes
      await queryClient.invalidateQueries({ queryKey: getUsersControllerGetMeQueryKey() });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleNotifSave() {
    setSaving(true);
    try {
      await customFetch('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ notifyEmail, notifyInApp }),
      });
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

  async function handleResendVerify() {
    setResendingVerify(true);
    try {
      // Better Auth resend verification — no-op if already verified
      await customFetch('/api/auth/send-verification-email', {
        method: 'POST',
        body: JSON.stringify({ email: sessionUser?.email }),
      });
      setVerifySent(true);
    } catch {
      setVerifySent(true); // show success regardless to avoid enumeration
    } finally {
      setResendingVerify(false);
    }
  }

  const emailVerified = profile?.emailVerified ?? sessionUser?.emailVerified ?? true;
  const handle = profile?.handle ?? sessionUser?.handle ?? sessionUser?.name ?? '—';
  const userClass = (profile?.class ?? sessionUser?.class ?? 'GUEST') as string;

  if (isLoading) {
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
          role="alert"
        >
          <AlertTriangle className="w-5 h-5 flex-none mt-0.5" style={{ color: 'var(--amber)' }} aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Verify your email to join the chat</p>
            <p className="wc-help mt-0">Check your inbox for the verification link.</p>
          </div>
          {verifySent ? (
            <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}>Sent!</span>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResendVerify}
              disabled={resendingVerify}
              className="flex-none"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Resend
            </Button>
          )}
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
            <span className="wc-pill wc-pill-ok"><Check className="w-3.5 h-3.5" aria-hidden="true" />Active</span>
          </div>
        </div>
      </div>

      {/* ── ABOUT YOU ── */}
      <form className="wc-card wc-card-pad mb-4" onSubmit={handleSave}>
        <h2 className="text-lg font-extrabold mb-1">
          About you <span className="wc-muted font-normal text-sm">(optional)</span>
        </h2>
        <p className="wc-help mb-4">
          Helps the DJs read the room. Aggregate-only — your identity is never published.
        </p>

        {saveError && (
          <div role="alert" className="mb-4 p-3 rounded-xl text-sm font-semibold"
            style={{ background: 'color-mix(in srgb,var(--destructive) 10%,transparent)', color: 'var(--destructive)' }}>
            {saveError}
          </div>
        )}

        <div className={`grid sm:grid-cols-2 gap-4 mb-4 transition-opacity ${isCampus ? '' : 'opacity-50'}`}>
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
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <span className="wc-label">Gender</span>
          <div className="flex flex-wrap gap-2">
            {GENDERS.map((g) => (
              <Button
                key={g}
                type="button"
                size="sm"
                variant={gender === g ? 'maroon' : 'outline'}
                aria-pressed={gender === g}
                onClick={() => setGender(gender === g ? '' : g)}
                data-testid="profile-gender"
              >
                {g}
              </Button>
            ))}
          </div>
        </div>

        {/* Consent checkbox — gates Save */}
        <label className="flex items-start gap-2 text-sm wc-muted mb-4">
          <Checkbox
            checked={consent}
            onCheckedChange={(v) => setConsent(v === true)}
            data-testid="profile-consent"
            className="mt-1 flex-none"
          />
          <span>
            I agree to share this information anonymously to help the station understand its audience.
            Aggregate-only — your identity is never published.
          </span>
        </label>

        <Button
          type="submit"
          variant="default"
          disabled={saving || !consent}
          data-testid="profile-save"
        >
          <Save className="w-4 h-4" aria-hidden="true" />
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <p className="wc-help">Aggregate-only — your identity is never published.</p>
      </form>

      {/* ── NOTIFICATIONS ── */}
      <div className="wc-card wc-card-pad mb-4">
        <h2 className="text-lg font-extrabold mb-3">Notifications</h2>
        <div className="wc-stack">
          <label className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="font-semibold block">Queued-request emails</span>
              <span className="wc-help mt-0 block">Email me when a DJ queues my song request.</span>
            </span>
            <Switch
              checked={notifyEmail}
              onCheckedChange={(v) => setNotifyEmail(v)}
              aria-label="Queued-request emails"
              data-testid="notif-email"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="font-semibold block">On-air receipt emails</span>
              <span className="wc-help mt-0 block">Email me when my dedication or request airs.</span>
            </span>
            <Switch
              checked={notifyInApp}
              onCheckedChange={(v) => setNotifyInApp(v)}
              aria-label="On-air receipt emails"
              data-testid="notif-inapp"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="font-semibold block">Announcement pushes</span>
              <span className="wc-help mt-0 block">Push notifications for station news &amp; events.</span>
            </span>
            {/* Local TODO — no backend field yet */}
            <Switch disabled aria-label="Announcement pushes" />
          </label>
        </div>
        <Button
          type="button"
          variant="default"
          onClick={handleNotifSave}
          disabled={saving}
          className="mt-4"
        >
          <Save className="w-4 h-4" aria-hidden="true" />
          Save
        </Button>
      </div>

      {/* ── QUICK LINKS ── */}
      <div className="wc-card divide-y">
        <Link
          href="#"
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
