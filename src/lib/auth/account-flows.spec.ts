import { describe, expect, it, vi } from 'vitest';
import { authCallbackUrl, requestVerification, verificationState, normalizeGender, moderationStanding, hasDemographicsConsent } from './account-flows';

describe('account journey', () => {
  it('uses absolute frontend callbacks across split origins', async () => {
    const send = vi.fn().mockResolvedValue({ error: null });
    await requestVerification('listener@example.invalid', send, 'https://web.test');
    expect(send).toHaveBeenCalledWith({ email: 'listener@example.invalid', callbackURL: 'https://web.test/verify-email?returned=1' });
    expect(authCallbackUrl('reset', 'https://web.test')).toBe('https://web.test/reset-password');
  });
  it('never converts throttling, server failure or a dropped request into success', async () => {
    for (const send of [vi.fn().mockResolvedValue({ error: { message: 'Wait 60 seconds', status: 429 } }), vi.fn().mockRejectedValue(new Error('Network unavailable'))]) {
      await expect(requestVerification('x@example.invalid', send, 'https://web.test')).rejects.toThrow();
    }
  });
  it('distinguishes callback errors, signed-out returns, and actual verified state', () => {
    expect(verificationState({ returned: true, emailVerified: false, signedIn: false })).toBe('signed-out');
    expect(verificationState({ returned: true, emailVerified: false, signedIn: true, error: 'TOKEN_EXPIRED' })).toBe('error');
    expect(verificationState({ returned: true, emailVerified: true, signedIn: true })).toBe('success');
    expect(verificationState({ returned: false, emailVerified: false, signedIn: true })).toBe('pending');
  });
  it('loads persisted consent and canonicalizes old gender labels', () => {
    expect(hasDemographicsConsent([{ scope: 'DEMOGRAPHICS', grantedAt: '2026-10-01', withdrawnAt: null }])).toBe(true);
    expect(hasDemographicsConsent([{ scope: 'DEMOGRAPHICS', grantedAt: '2026-10-01', withdrawnAt: '2026-10-02' }])).toBe(false);
    expect(['Woman', 'Man', 'Non-binary', 'Prefer not to say'].map(normalizeGender)).toEqual(['female', 'male', 'nonbinary', 'prefer-not-to-say']);
    expect(moderationStanding(undefined)).toBe('Standing unavailable');
    expect(moderationStanding({ bannedAt: '2026-10-01', mutedUntil: null })).toBe('Banned');
    expect(moderationStanding({ bannedAt: null, mutedUntil: '2099-10-01' })).toBe('Muted');
  });
});
