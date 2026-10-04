import { execFileSync } from 'node:child_process';
import { expect, test, type BrowserContext, type APIRequestContext } from '@playwright/test';
const api = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3314';
const web = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3311';
const db = process.env.DATABASE_URL;
const q = (value: string) => "'" + value.replaceAll("'", "''") + "'";
function sql(query: string) {
  if (db !== 'postgresql://postgres@127.0.0.1:55432/review_frontend') throw new Error('Only isolated review_frontend SQL permitted');
  return execFileSync('/opt/homebrew/opt/postgresql@18/bin/psql', [db, '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8' }).trim();
}
async function account(request: APIRequestContext) {
  const id = `inbox${Date.now()}${Math.floor(Math.random()*10000)}`; const email = `${id}@example.com`;
  const result = await request.post(`${api}/api/auth/sign-up/email`, { headers: { Origin: web }, data: { email, name: id, handle: id, password: 'Password123!' } });
  expect(result.ok()).toBeTruthy(); return { id: (await result.json()).user.id as string, email };
}
async function login(context: BrowserContext, email: string) {
  expect((await context.request.post(`${api}/api/auth/sign-in/email`, { headers: { Origin: web }, data: { email, password: 'Password123!' } })).ok()).toBeTruthy();
}
function cleanup(ids: string[]) {
  for (const id of ids) sql(`DELETE FROM notifications WHERE "userId"=${q(id)}; DELETE FROM consent_records WHERE "userId"=${q(id)}; DELETE FROM users WHERE id=${q(id)};`);
}
test('private real inbox pages, read action retry, escaped text and genuine related standing link', async ({ page, context, request }) => {
  await page.setViewportSize({width:375,height:812});
  const owner = await account(request); const foreign = await account(request);
  const ids = Array.from({ length: 25 }, (_, n) => `inbox-${owner.id}-${n}`);
  sql(`INSERT INTO notifications (id,"userId",type,title,body,"createdAt","isRead") VALUES ${ids.map((id,n) => `(${q(id)},${q(owner.id)},'APPEAL_DECISION',${q(`Decision ${n}`)},${q(n===24?'<img src=x onerror=alert(1)>':'Real decision response')},NOW()+INTERVAL '${n} seconds',false)`).join(',')}; INSERT INTO notifications(id,"userId",type,title,body,"createdAt","isRead") VALUES (${q('foreign-'+foreign.id)},${q(foreign.id)},'SYSTEM','Private foreign decision','Hidden',NOW(),false);`);
  try {
    await login(context,owner.email); await page.goto('/notifications');
    await expect(page.getByRole('heading',{name:'Decision 24',exact:true})).toBeVisible(); await expect(page.getByText('Private foreign decision')).toHaveCount(0);
    await expect(page.getByText('<img src=x onerror=alert(1)>',{exact:true})).toBeVisible(); await expect(page.locator('main img')).toHaveCount(0);
    await expect(page.getByRole('link',{name:'View current standing'}).first()).toHaveAttribute('href','/profile/standing');
    let fail = true;
    await page.route('**/api/notifications/*/read', route => fail ? route.fulfill({status:503,json:{message:'Controlled read failure'}}) : route.continue());
    const row = page.getByTestId(`notification-${ids[24]}`); const read = row.getByRole('button',{name:'Mark as read'});
    await read.focus(); await page.keyboard.press('Enter'); await expect(page.locator('main').getByRole('alert')).toContainText('Controlled read failure');
    expect(sql(`SELECT "isRead" FROM notifications WHERE id=${q(ids[24])}`)).toBe('f');
    fail=false; await read.click(); await expect(row.getByText('Read',{exact:true})).toBeVisible(); await expect(row).toBeFocused(); expect(sql(`SELECT "isRead" FROM notifications WHERE id=${q(ids[24])}`)).toBe('t');
    const next=page.getByRole('button',{name:'Next',exact:true}); await next.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('heading',{name:'Decision 0',exact:true})).toBeVisible(); await expect(next).toBeDisabled();
    const previous=page.getByRole('button',{name:'Prev',exact:true}); await previous.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('heading',{name:'Decision 24',exact:true})).toBeVisible(); await expect(previous).toBeDisabled();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:'/tmp/wildcat-inbox-mobile.png'});
  } finally { await page.goto('about:blank'); cleanup([owner.id,foreign.id]); }
});
test('empty inbox and list outage are truthful and retry recovers', async ({page,context,request}) => {
  const owner=await account(request); let fail=true;
  try {
    await login(context,owner.email); await page.route('**/api/notifications?*',route=>fail?route.fulfill({status:503,json:{message:'Controlled inbox outage'}}):route.continue());
    await page.goto('/notifications'); await expect(page.locator('main').getByRole('alert')).toContainText('Controlled inbox outage');
    await expect(page.getByText('No notifications yet.')).toHaveCount(0); fail=false;
    const retry=page.getByRole('button',{name:'Retry',exact:true});await retry.focus();await page.keyboard.press('Enter');
    await expect(page.getByText('No notifications yet.',{exact:true})).toBeVisible(); await expect(page.getByText(/DJ Mara|Acquaintance Party|mute reduced/)).toHaveCount(0);
  } finally {await page.goto('about:blank');cleanup([owner.id]);}
});
test('same-browser account change never displays the previous private cache',async({page,context,request})=>{
  const first=await account(request),second=await account(request);
  sql(`INSERT INTO notifications(id,"userId",type,title,body,"createdAt","isRead") VALUES (${q('private-'+first.id)},${q(first.id)},'SYSTEM','Only first account','Private',NOW(),false);`);
  try {
    await login(context,first.email);await page.goto('/notifications');await expect(page.getByRole('heading',{name:'Only first account',exact:true})).toBeVisible();
    const other=await context.newPage();await other.goto('/');await other.bringToFront();await login(context,second.email);await page.waitForTimeout(5100);
    await page.bringToFront();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByText('No notifications yet.',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Only first account',exact:true})).toHaveCount(0);await other.close();
  } finally {await page.goto('about:blank');cleanup([first.id,second.id]);}
});
