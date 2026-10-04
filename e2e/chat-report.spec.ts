import { expect, test, type APIRequestContext } from '@playwright/test';
import { API_BASE, apiLoginAs, execBackendTsx, loginAs } from './_fixtures';

let listener: APIRequestContext;
let staff: APIRequestContext;
let authorId: string;
let reporterId: string;
const prefix = `chat_report_${Date.now()}`;
const episodeId = `${prefix}_episode`;
const foreignId = `${prefix}_foreign`;
const ownId = `${prefix}_own`;
const boothId = `${prefix}_booth`;
const body = 'A listener message to report';
const reason = 'This message needs staff review.';

test.beforeAll(async () => {
  const api = new URL(API_BASE); const db = new URL(process.env.DATABASE_URL ?? '');
  if (api.hostname !== 'localhost' || api.port !== '3314' || db.hostname !== '127.0.0.1' || db.port !== '55432' || db.pathname !== '/review_frontend') throw new Error('Use isolated consumerAPI3314/review_frontend');
  listener = await apiLoginAs('listener'); staff = await apiLoginAs('custodian');
  reporterId = (await (await listener.get('/api/users/me')).json()).id;
  authorId = (await (await staff.get('/api/users/me')).json()).id;
  execBackendTsx(`import { PrismaService } from './src/prisma/prisma.service'; const p=new PrismaService(); async function main(){await p.episode.create({data:{id:${JSON.stringify(episodeId)},unscheduled:true,startedAt:new Date()}});await p.chatMessage.createMany({data:${JSON.stringify([{id:foreignId,episodeId,userId:authorId,content:body},{id:ownId,episodeId,userId:reporterId,content:'My own message'},{id:boothId,episodeId,asBooth:true,content:'Booth message'}])}});await p.$disconnect();}main().catch(e=>{console.error(e);process.exit(1)});`);
});
test.afterAll(async () => {
  execBackendTsx(`import { PrismaService } from './src/prisma/prisma.service'; const p=new PrismaService(); async function main(){await p.report.deleteMany({where:{targetMessageId:{in:${JSON.stringify([foreignId,ownId,boothId])}}}});await p.chatMessage.deleteMany({where:{episodeId:${JSON.stringify(episodeId)}}});await p.episodeAnalyticsSnapshot.deleteMany({where:{episodeId:${JSON.stringify(episodeId)}}});await p.episode.deleteMany({where:{id:${JSON.stringify(episodeId)}}});await p.$disconnect();}main().catch(e=>{console.error(e);process.exit(1)});`);
  await listener.dispose(); await staff.dispose();
});
test.beforeEach(async ({ page }) => {
  // Controlled manifest metadata allows the real snapshot/report boundary to
  // run without a physical broadcast or audio provider. Chat is actual SQL data.
  await page.route('**/api/stream/manifest', route => route.fulfill({ contentType:'application/json', body:JSON.stringify({status:'LIVE',reason:null,type:'hls',url:'http://localhost:3314/test-media.m3u8',dj:[],episodeId,showId:null,showName:null}) }));
});

test('AC-1: keyboard report validates reason and stores actual message/server-derived author', async ({ page }) => {
  await loginAs(page, 'listener'); await page.goto('/listen');
  const message = page.getByTestId('chat-report-message').filter({hasText:body});
  const opener = message.getByRole('button', { name:'Report message',exact:true });
  await expect(opener).toBeVisible(); await opener.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByTestId('chat-report-dialog');
  await expect(dialog).toContainText(body);
  await dialog.getByLabel('Reason for reporting').fill('  ');
  await dialog.getByRole('button',{name:'Send report',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Enter a reason');
  await dialog.getByLabel('Reason for reporting').fill(reason);
  const request = page.waitForRequest(r=>r.url().endsWith('/api/mod/reports')&&r.method()==='POST');
  await dialog.getByRole('button',{name:'Send report',exact:true}).click();
  expect((await request).postDataJSON()).toEqual({targetMessageId:foreignId,reason});
  await expect(dialog.getByRole('status')).toContainText('Report sent');
  const queue = await (await staff.get('/api/mod/queue')).json();
  expect(queue.reports.find((r:{targetMessageId:string})=>r.targetMessageId===foreignId)).toMatchObject({reporterId,targetMessageId:foreignId,targetUserId:authorId,reason});
  await dialog.getByRole('button',{name:'Done',exact:true}).click(); await expect(opener).toBeFocused();
});

test('AC-2: failed submission stays editable and retry receives actual confirmation', async ({ page }) => {
  await loginAs(page,'listener'); await page.goto('/listen');
  const opener = page.getByTestId('chat-report-message').filter({hasText:body}).getByRole('button',{name:'Report message',exact:true});
  await expect(opener).toBeVisible(); await opener.click();
  const dialog=page.getByTestId('chat-report-dialog');
  await dialog.getByLabel('Reason for reporting').fill(reason);
  await page.route('**/api/mod/reports', route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Report service unavailable'})}));
  await dialog.getByRole('button',{name:'Send report',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Report service unavailable');
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await expect(dialog.getByLabel('Reason for reporting')).toHaveValue(reason);
  await page.unroute('**/api/mod/reports');
  await dialog.getByRole('button',{name:'Send report',exact:true}).click(); await expect(dialog.getByRole('status')).toContainText('Report sent');
});

test('AC-3: own and booth messages have no report action', async ({ page }) => {
  await loginAs(page,'listener'); await page.goto('/listen');
  for (const text of ['My own message','Booth message']) {
    const row=page.getByTestId('chat-report-message').filter({hasText:text});
    await expect(row).toBeVisible(); await expect(row.getByRole('button',{name:'Report message',exact:true})).toHaveCount(0);
  }
});

test('AC-4: anonymous report requires sign-in and never submits a complaint', async ({ page }) => {
  await page.goto('/listen');
  const opener=page.getByTestId('chat-report-message').filter({hasText:body}).getByRole('button',{name:'Report message',exact:true});
  await expect(opener).toBeVisible(); await opener.click();
  const dialog=page.getByTestId('chat-report-dialog');
  await expect(dialog.getByRole('link',{name:'Sign in to report',exact:true})).toHaveAttribute('href','/login?next=/listen');
  await expect(dialog.getByRole('button',{name:'Send report',exact:true})).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
});
