import { expect, test, type APIRequestContext } from '@playwright/test';
import { API_BASE, apiLoginAs, archiveAnnouncement, createAnnouncement, execBackendTsx, loginAs, reviewAnnouncement, submitAnnouncement } from './_fixtures';

let mod: APIRequestContext;
let custodian: APIRequestContext;
let custodianId: string;
const rows: Array<{ id: string; title: string; owner: 'moderator' | 'custodian'; state: string }> = [];
const prefix = `Publish permission ${Date.now()}`;
test.beforeAll(async () => {
  const api = new URL(API_BASE); const db = new URL(process.env.DATABASE_URL ?? '');
  if (api.hostname !== 'localhost' || api.port !== '3314' || db.hostname !== '127.0.0.1' || db.port !== '55432' || db.pathname !== '/review_frontend') throw new Error('Use isolated consumer API3314/review_frontend');
  mod = await apiLoginAs('moderator'); custodian = await apiLoginAs('custodian');
  custodianId = (await (await custodian.get('/api/users/me')).json()).id;
  for (const owner of ['moderator', 'custodian'] as const) {
    const author = owner === 'moderator' ? mod : custodian;
    for (const state of ['DRAFT', 'PENDING_REVIEW', 'REJECTED']) {
      const title = `${prefix} ${owner} ${state}`;
      const row = await createAnnouncement(author, { title }); rows.push({ id: row.id, title, owner, state });
      if (state !== 'DRAFT') await submitAnnouncement(author, row.id);
      if (state === 'REJECTED') await reviewAnnouncement(owner === 'moderator' ? custodian : mod, row.id, 'REJECT', { rejectionReason: 'Legacy rejected fixture' });
    }
  }
});
test.afterAll(async () => {
  for (const row of rows) await archiveAnnouncement(mod, row.id);
  await mod.dispose(); await custodian.dispose();
});
for (const actor of ['moderator', 'custodian'] as const) {
  test(`AC-${actor}: only the creator can publish eligible states, other staff can edit`, async ({ page }) => {
    await loginAs(page, actor); await page.goto('/mod/announcements');
    for (const row of rows) {
      const card = page.getByTestId('mod-ann-row').filter({ hasText: row.title });
      await expect(card).toBeVisible();
      if (row.owner === actor) await expect(card.getByTestId('mod-ann-publish')).toBeEnabled();
      else {
        await expect(card.getByTestId('mod-ann-publish')).toBeDisabled();
        await expect(card.getByTestId('mod-ann-publish-permission')).toContainText('Only the creator');
      }
      await expect(card.getByTestId('mod-ann-edit')).toBeEnabled();
    }
    const own = rows.find(r => r.owner === actor && r.state === 'DRAFT')!;
    const opener = page.getByTestId('mod-ann-row').filter({ hasText: own.title }).getByTestId('mod-ann-publish');
    await opener.focus(); await page.keyboard.press('Enter');
    await expect(page.getByTestId('mod-ann-publish-dialog')).toBeVisible();
    await expect(page.getByTestId('mod-ann-publish-later')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
  });
}

test('AC-stale: backend author denial remains truthful after a stale UI permission', async ({ page }) => {
  await loginAs(page, 'moderator'); await page.goto('/mod/announcements');
  const own = rows.find(r => r.owner === 'moderator' && r.state === 'DRAFT')!;
  const original = (await (await mod.get(`/api/announcements/admin/${own.id}`)).json()).createdBy.id;
  await page.getByTestId('mod-ann-row').filter({ hasText: own.title }).getByTestId('mod-ann-publish').click();
  try {
    // Controlled local ownership change exercises the stale authorization boundary;
    // no product author-transfer endpoint is claimed.
    execBackendTsx(`import { PrismaService } from './src/prisma/prisma.service'; const p=new PrismaService(); async function main(){await p.announcement.update({where:{id:${JSON.stringify(own.id)}},data:{createdById:${JSON.stringify(custodianId)}}});await p.$disconnect();}main().catch(e=>{console.error(e);process.exit(1)});`);
    await page.getByTestId('mod-ann-publish-confirm').click();
    const alert = page.getByTestId('mod-ann-publish-dialog').getByRole('alert');
    await expect(alert).toContainText('Only the author may publish');
    await expect(alert).not.toContainText('changed state');
    expect((await (await mod.get(`/api/announcements/admin/${own.id}`)).json()).status).toBe('DRAFT');
  } finally {
    execBackendTsx(`import { PrismaService } from './src/prisma/prisma.service'; const p=new PrismaService(); async function main(){await p.announcement.update({where:{id:${JSON.stringify(own.id)}},data:{createdById:${JSON.stringify(original)}}});await p.$disconnect();}main().catch(e=>{console.error(e);process.exit(1)});`);
  }
});
