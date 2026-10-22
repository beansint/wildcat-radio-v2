import { randomUUID } from 'node:crypto';
import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import { API_BASE, WEB_BASE, PASSWORD, assertLocalPlaywrightEnvironment } from './_fixtures';
import { localDb } from './_broadcast-integrity';

export type ProfileAccount = {
  id: string;
  email: string;
  handle: string;
  api: APIRequestContext;
  /** Set before contributing; cleanup reverses only this fixture's own sample. */
  contributedBucket?: '18-20' | '21-23' | '24+' | 'prefer-not-to-say';
};

export const test = base.extend<{ profileAccount: ProfileAccount }>({
  profileAccount: async ({ playwright }, provideFixture) => {
    assertLocalPlaywrightEnvironment(process.env);
    const handle = `profile_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const email = `${handle}@cit.edu`;
    const api = await playwright.request.newContext({ baseURL: API_BASE, extraHTTPHeaders: { Origin: WEB_BASE } });
    let fixture: ProfileAccount | undefined;
    try {
      const signup = await api.post('/api/auth/sign-up/email', { data: { email, password: PASSWORD, name: 'Profile fixture', handle } });
      expect(signup.ok(), 'The isolated profile fixture signs up through the real API').toBe(true);
      fixture = { id: (await signup.json()).user.id, email, handle, api };
      // Profile editing is independent of verification-link acceptance (covered
      // by account-verification.spec.ts). Seed only this synthetic account.
      localDb(`await p.user.update({where:{id:${JSON.stringify(fixture.id)}},data:{emailVerified:true,yearLevel:'2',college:'CCS — Computer Studies',gender:'female',notifyEmail:false,notifyInApp:false}});`);
      await provideFixture(fixture);
    } finally {
      if (fixture) {
        const remaining = localDb<number>(`
          const id=${JSON.stringify(fixture.id)};
          const bucket=${JSON.stringify(fixture.contributedBucket ?? null)};
          const mailCrypto=await import('./src/auth/auth-email-crypto');
          const authEmailIdentityHash=mailCrypto.authEmailIdentityHash??mailCrypto.default?.authEmailIdentityHash;
          if(typeof authEmailIdentityHash!=='function') throw Error('Auth email hash helper unavailable');
          const accountHash=authEmailIdentityHash('account',id);
          await p.$transaction(async tx=>{
            await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))','wildcat:auth-mail:'+accountHash);
            const user=await tx.user.findUnique({where:{id},select:{ageBucketContributed:true}});
            if(user?.ageBucketContributed&&bucket) await tx.ageBucketCounter.updateMany({where:{bucket,count:{gt:0}},data:{count:{decrement:1}}});
            await tx.authEmailJob.deleteMany({where:{accountHash}});
            await tx.consentRecord.deleteMany({where:{userId:id}});
            await tx.notification.deleteMany({where:{userId:id}});
            await tx.session.deleteMany({where:{userId:id}});
            await tx.account.deleteMany({where:{userId:id}});
            await tx.user.deleteMany({where:{id}});
          },{maxWait:20000,timeout:30000});
          return p.user.count({where:{id}});
        `);
        expect(remaining, 'Profile fixture cleanup removes its account').toBe(0);
      }
      await api.dispose();
    }
  },
});

export async function openProfile(page: Page, account: ProfileAccount): Promise<void> {
  await page.goto(`${WEB_BASE}/login`);
  await page.getByTestId('auth-email').fill(account.email);
  await page.getByTestId('auth-password').fill(PASSWORD);
  const signedIn = page.waitForResponse(response => response.url() === `${API_BASE}/api/auth/sign-in/email` && response.request().method() === 'POST');
  await page.getByTestId('auth-submit').click();
  expect((await signedIn).ok()).toBe(true);
  await page.waitForURL(url => url.origin === new URL(WEB_BASE).origin && url.pathname === '/');
  await page.goto(`${WEB_BASE}/profile`);
  await expect(page.getByTestId('profile-handle')).toHaveText(`@${account.handle}`);
  await expect(page.getByTestId('profile-consent')).toBeEnabled();
  await expect(page.getByTestId('profile-consent')).not.toBeChecked();
}

export async function setProfileConsent(page: Page, checked: boolean): Promise<void> {
  const checkbox = page.getByTestId('profile-consent');
  await expect(checkbox).toBeEnabled();
  if (await checkbox.isChecked() !== checked) await checkbox.click();
  await expect(checkbox).toBeChecked({ checked });
}

export async function saveProfile(page: Page) {
  const pending = page.waitForResponse(response => response.url() === `${API_BASE}/api/users/me` && response.request().method() === 'PATCH');
  await page.getByTestId('profile-save').click();
  const response = await pending;
  expect(response.ok(), 'Profile save is acknowledged by the real API').toBe(true);
  await expect(page.getByRole('status').filter({ hasText: 'Optional details saved.' })).toBeVisible();
  await expect(page.getByTestId('profile-save')).toBeEnabled();
  return response.request().postDataJSON() as Record<string, unknown>;
}

export async function profileData(account: ProfileAccount) {
  const response = await account.api.get('/api/users/me');
  expect(response.ok()).toBe(true);
  return response.json();
}

export async function activeProfileConsents(account: ProfileAccount) {
  const response = await account.api.get('/api/consent');
  expect(response.ok()).toBe(true);
  return (await response.json() as { scope: string; withdrawnAt: string | null }[])
    .filter(row => row.scope === 'DEMOGRAPHICS' && row.withdrawnAt === null);
}
