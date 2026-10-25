export function authCallbackUrl(kind: 'verification' | 'reset', origin = window.location.origin): string {
  const url = new URL(kind === 'verification' ? '/verify-email' : '/reset-password', origin);
  if (kind === 'verification') url.searchParams.set('returned', '1');
  return url.toString();
}

type MailResult = { error?: { message?: string; status?: number; retryAfterSeconds?: number } | null };
export async function requestVerification(email: string, send: (data: { email: string; callbackURL: string }) => Promise<MailResult>, origin?: string) {
  const result = await send({ email, callbackURL: authCallbackUrl('verification', origin) });
  if (result.error) {
    const wait = result.error.retryAfterSeconds ?? (result.error.status === 429 ? Number(result.error.message?.match(/(\d+) seconds/)?.[1] ?? 60) : 0);
    throw Object.assign(new Error(result.error.message ?? 'Email could not be queued. Try again shortly.'), { retryAfterSeconds: wait });
  }
  return { queued: true, retryAfterSeconds: 60 };
}

export function verificationState(input: { returned: boolean; signedIn: boolean; emailVerified: boolean; error?: string | null }) {
  if (input.emailVerified) return 'success';
  if (input.error) return 'error';
  if (input.returned && !input.signedIn) return 'signed-out';
  return 'pending';
}

export function hasDemographicsConsent(records: readonly { scope: string; grantedAt: string; withdrawnAt: string | null }[] | undefined): boolean {
  const latest = records?.filter(row => row.scope === 'DEMOGRAPHICS').sort((a, b) => Date.parse(b.grantedAt) - Date.parse(a.grantedAt))[0];
  return !!latest && latest.withdrawnAt === null;
}

export function normalizeGender(value: string | null | undefined): string {
  const values: Record<string, string> = { woman: 'female', man: 'male', 'non-binary': 'nonbinary', 'prefer not to say': 'prefer-not-to-say' };
  const normalized = value?.trim().toLowerCase() ?? '';
  return values[normalized] ?? normalized;
}

export function moderationStanding(standing: { bannedAt: string | null; mutedUntil: string | null; strikes?: { expiresAt: string | null }[] } | undefined): string {
  if (!standing) return 'Standing unavailable';
  if (standing.bannedAt) return 'Banned';
  if (standing.mutedUntil && Date.parse(standing.mutedUntil) > Date.now()) return 'Muted';
  const active = standing.strikes?.filter(strike => !strike.expiresAt || Date.parse(strike.expiresAt) > Date.now()).length ?? 0;
  if (active > 0) return `${active} active ${active === 1 ? 'strike' : 'strikes'}`;
  return 'Good standing';
}
