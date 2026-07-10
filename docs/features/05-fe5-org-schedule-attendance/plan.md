# Org & Schedule Admin + Studio Attendance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the missing backend (roster/shows/schedule/attendance admin) and the frontend admin + studio + public UI that consume it, closing M2.

**Architecture:** One combined full-stack slice on a single branch `feature/5-org-schedule-attendance`. Backend adds four moderator-gated NestJS modules (first live use of `RolesGuard`) that write an append-only `StaffAuditLog` row on every mutation; no schema migration (all models exist). Then `pnpm api:refresh` regenerates the orval client and the frontend builds a `.wc-sidenav` staff shell + `/mod/{roster,schedule,attendance}`, a `/studio` Attendance mode, and a public `/schedule`.

**Tech Stack:** NestJS + Prisma 7 (`packages/db`) + Better Auth (`SessionGuard`/`RolesGuard`) on the backend; Next.js 16 App Router + Tailwind 4 + shadcn/ui + orval/TanStack Query + Playwright on the frontend.

## Global Constraints

- **No schema migration expected.** If one becomes unavoidable, use `pnpm --filter <db-package> migrate:dev` (Prisma script) — **never raw SQL**.
- **DJs are roster data, not accounts** — no DJ role, no promotion flow. `RosterEntry.linkedAccountId` stays a deferred nullable seam.
- **Every moderator mutation writes exactly one `StaffAuditLog` row** (`actorId`, `action`, `entity`, `entityId`, `metadata`); the log is append-only (never edited).
- **RBAC:** mod endpoints use `@UseGuards(SessionGuard, RolesGuard)` (session first) + `@Roles('MODERATOR')`. MODERATOR and CUSTODIAN both pass (`ROLE_RANK: CUSTODIAN 3 > MODERATOR 2 > LISTENER 1`).
- **`Show.cadence` JSON shape:** `{ kind:'WEEKLY'|'ONE_TIME', days?:Weekday[], date?:'YYYY-MM-DD', start:'HH:MM', end:'HH:MM' }`, `Weekday='MON'|'TUE'|'WED'|'THU'|'FRI'|'SAT'|'SUN'`, times 24h station-local, `start < end`.
- **Frontend UI = shadcn/ui primitives emitting `wc-*` classes** (`AGENTS.md`); `Dialog` for modals; install shadcn `table` and theme to `wc-table`. Black+gold, dark-default staff register. **Never run `shadcn init`.**
- **Every interactive element exposes `data-testid="<area>-<element>"`;** specs select by testid, never copy/CSS.
- **Forms:** `react-hook-form` + `@hookform/resolvers/zod`, one `role="alert"` region per form.
- **Data fetching = generated orval hooks only** (profile-page pattern), never hand-written fetch types.
- **1:1 prototype parity** with `docs/frontend-design-basis-prototype/{mod/roster.html,mod/schedule.html,mod/attendance.html,studio/studio-attendance.html}`.
- **Commits:** Conventional Commits, scope `web` (frontend) / `api` (backend); no AI attribution. Atomic, each green. Squash-merge (PR title IS the squash commit).
- **No deploy this phase.**

Paths below are relative to the workspace root:
`BE = wildcat-radio-v2-backend`, `FE = wildcat-radio-v2-frontend`.

---

## Phase A — Backend

### Task 1: Seed a MODERATOR account + fixtures

**Files:**
- Modify: `BE/packages/db/seed.mjs`

**Interfaces:**
- Produces: seeded `mod@example.com` (role `MODERATOR`), `test@example.com` (role `LISTENER`), ≥2 `RosterEntry` (one archived), ≥1 `WEEKLY` `Show` with cadence + one `ShowRosterEntry`, ≥1 `AttendanceRecord` for today. e2e specs consume these.

- [ ] **Step 1: Read the current seed to match its Better Auth user-creation pattern**

Run: `sed -n '1,80p' BE/packages/db/seed.mjs` — note how existing users are created (Better Auth hashes passwords; reuse the same helper the file already uses for `test@example.com`).

- [ ] **Step 2: Add the moderator + roster/show/attendance fixtures**

Append idempotent upserts (guard with `upsert`/`findFirst` so re-running seed is safe). Create `mod@example.com` with `role: 'MODERATOR'` via the same account-creation path already used for the listener; then:

```js
const dj1 = await prisma.rosterEntry.upsert({
  where: { id: 'seed-dj-carla' },
  update: {},
  create: { id: 'seed-dj-carla', displayName: 'DJ Carla', bio: 'Afternoon vibes host.', isActive: true },
});
await prisma.rosterEntry.upsert({
  where: { id: 'seed-dj-archived' },
  update: {},
  create: { id: 'seed-dj-archived', displayName: 'DJ Retired', isActive: false },
});
const show = await prisma.show.upsert({
  where: { slug: 'afternoon-vibes' },
  update: {},
  create: {
    id: 'seed-show-av', name: 'Afternoon Vibes', slug: 'afternoon-vibes',
    cadence: { kind: 'WEEKLY', days: ['MON','WED','FRI'], start: '13:00', end: '16:00' },
  },
});
await prisma.showRosterEntry.upsert({
  where: { showId_rosterId: { showId: show.id, rosterId: dj1.id } },
  update: {}, create: { showId: show.id, rosterId: dj1.id },
});
```

- [ ] **Step 3: Run the seed and verify**

Run: `pnpm --filter @wildcat/db exec node seed.mjs` (use the actual db package name from `BE/packages/db/package.json`; adjust filter).
Expected: exits 0; re-running is idempotent.

- [ ] **Step 4: Confirm the moderator row via the Neon MCP** (per memory: Neon MCP only, projectId raspy-bar-41857435): query `select email, role from users where email='mod@example.com'` → one row, role `MODERATOR`.

- [ ] **Step 5: Commit**

```bash
git add BE/packages/db/seed.mjs
git commit -m "chore(api): seed moderator account and roster/show/attendance fixtures"
```

---

### Task 2: Cadence validator (pure logic, TDD)

**Files:**
- Create: `BE/apps/api/src/shows/cadence.ts`
- Test: `BE/apps/api/src/shows/cadence.spec.ts`

**Interfaces:**
- Produces:
  - `type Weekday = 'MON'|'TUE'|'WED'|'THU'|'FRI'|'SAT'|'SUN'`
  - `interface Cadence { kind:'WEEKLY'|'ONE_TIME'; days?:Weekday[]; date?:string; start:string; end:string }`
  - `parseCadence(input: unknown): Cadence` — throws `Error` on invalid (caller maps to 400)
  - `showsOnDate(cadence: Cadence, isoDate: string): boolean` — does this show air on a given YYYY-MM-DD

- [ ] **Step 1: Write failing tests**

```ts
import { parseCadence, showsOnDate } from './cadence';

describe('parseCadence', () => {
  it('accepts a WEEKLY cadence', () => {
    expect(parseCadence({ kind:'WEEKLY', days:['MON','WED','FRI'], start:'13:00', end:'16:00' }))
      .toMatchObject({ kind:'WEEKLY', days:['MON','WED','FRI'] });
  });
  it('rejects WEEKLY with no days', () => {
    expect(() => parseCadence({ kind:'WEEKLY', days:[], start:'13:00', end:'16:00' })).toThrow();
  });
  it('rejects ONE_TIME with no date', () => {
    expect(() => parseCadence({ kind:'ONE_TIME', start:'13:00', end:'16:00' })).toThrow();
  });
  it('rejects start >= end', () => {
    expect(() => parseCadence({ kind:'WEEKLY', days:['MON'], start:'16:00', end:'13:00' })).toThrow();
  });
  it('rejects malformed time', () => {
    expect(() => parseCadence({ kind:'WEEKLY', days:['MON'], start:'25:00', end:'26:00' })).toThrow();
  });
});

describe('showsOnDate', () => {
  it('WEEKLY airs on listed weekday (2026-07-13 is a Monday)', () => {
    expect(showsOnDate({ kind:'WEEKLY', days:['MON'], start:'13:00', end:'16:00' }, '2026-07-13')).toBe(true);
  });
  it('WEEKLY does not air on unlisted weekday', () => {
    expect(showsOnDate({ kind:'WEEKLY', days:['MON'], start:'13:00', end:'16:00' }, '2026-07-14')).toBe(false);
  });
  it('ONE_TIME airs only on its exact date', () => {
    const c = { kind:'ONE_TIME' as const, date:'2026-07-20', start:'13:00', end:'16:00' };
    expect(showsOnDate(c, '2026-07-20')).toBe(true);
    expect(showsOnDate(c, '2026-07-21')).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`cannot find module './cadence'`).

Run: `pnpm --filter wildcat-v2-api test -- cadence.spec` (confirm the api package name/test script in `BE/apps/api/package.json`).

- [ ] **Step 3: Implement `cadence.ts`**

```ts
export type Weekday = 'MON'|'TUE'|'WED'|'THU'|'FRI'|'SAT'|'SUN';
const WEEKDAYS: Weekday[] = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
export interface Cadence { kind:'WEEKLY'|'ONE_TIME'; days?:Weekday[]; date?:string; start:string; end:string }

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseCadence(input: unknown): Cadence {
  const c = input as Cadence;
  if (!c || (c.kind !== 'WEEKLY' && c.kind !== 'ONE_TIME')) throw new Error('cadence.kind must be WEEKLY or ONE_TIME');
  if (!TIME.test(c.start) || !TIME.test(c.end)) throw new Error('cadence times must be HH:MM (24h)');
  if (c.start >= c.end) throw new Error('cadence.start must be before cadence.end');
  if (c.kind === 'WEEKLY') {
    if (!Array.isArray(c.days) || c.days.length === 0) throw new Error('WEEKLY cadence needs at least one day');
    if (!c.days.every(d => WEEKDAYS.includes(d))) throw new Error('cadence.days has an invalid weekday');
    return { kind:'WEEKLY', days:[...c.days], start:c.start, end:c.end };
  }
  if (!c.date || !DATE.test(c.date)) throw new Error('ONE_TIME cadence needs a YYYY-MM-DD date');
  return { kind:'ONE_TIME', date:c.date, start:c.start, end:c.end };
}

export function showsOnDate(cadence: Cadence, isoDate: string): boolean {
  const c = parseCadence(cadence);
  if (c.kind === 'ONE_TIME') return c.date === isoDate;
  // getUTCDay: 0=Sun..6=Sat — map to Mon-first
  const dow = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  const wd = WEEKDAYS[(dow + 6) % 7];
  return c.days!.includes(wd);
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add BE/apps/api/src/shows/cadence.ts BE/apps/api/src/shows/cadence.spec.ts
git commit -m "feat(api): add cadence validator and weekday matcher for shows"
```

---

### Task 3: Staff-audit write helper

**Files:**
- Create: `BE/apps/api/src/audit/staff-audit.service.ts`
- Create: `BE/apps/api/src/audit/audit.module.ts`
- Test: `BE/apps/api/src/audit/staff-audit.service.spec.ts`

**Interfaces:**
- Produces: `StaffAuditService.record({ actorId, action, entity?, entityId?, metadata? }): Promise<void>` — inserts one `staff_audit_logs` row. `AuditModule` exports `StaffAuditService`.

- [ ] **Step 1: Write failing test** (mock `PrismaService`, assert `staffAuditLog.create` called once with the mapped fields).

```ts
import { StaffAuditService } from './staff-audit.service';

it('records one append-only audit row', async () => {
  const prisma = { staffAuditLog: { create: jest.fn().mockResolvedValue({}) } } as any;
  const svc = new StaffAuditService(prisma);
  await svc.record({ actorId:'u1', action:'roster.create', entity:'RosterEntry', entityId:'r1', metadata:{ displayName:'DJ Carla' } });
  expect(prisma.staffAuditLog.create).toHaveBeenCalledWith({
    data: { actorId:'u1', action:'roster.create', entity:'RosterEntry', entityId:'r1', metadata:{ displayName:'DJ Carla' } },
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement service + module** (inject the existing `PrismaService` the same way other services do — copy the import path from `BE/apps/api/src/users/users.service.ts`).

```ts
// staff-audit.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // match the real path used elsewhere

export interface AuditInput { actorId:string; action:string; entity?:string; entityId?:string; metadata?:unknown }

@Injectable()
export class StaffAuditService {
  constructor(private readonly prisma: PrismaService) {}
  async record(i: AuditInput): Promise<void> {
    await this.prisma.staffAuditLog.create({
      data: { actorId:i.actorId, action:i.action, entity:i.entity, entityId:i.entityId, metadata:i.metadata as any },
    });
  }
}
```

```ts
// audit.module.ts
import { Module } from '@nestjs/common';
import { StaffAuditService } from './staff-audit.service';
import { PrismaModule } from '../prisma/prisma.module'; // match real path
@Module({ imports:[PrismaModule], providers:[StaffAuditService], exports:[StaffAuditService] })
export class AuditModule {}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add BE/apps/api/src/audit
git commit -m "feat(api): add append-only staff-audit write service"
```

---

### Task 4: Roster module (CRUD + archive) — moderator-gated + audited

**Files:**
- Create: `BE/apps/api/src/roster/{roster.module.ts,roster.controller.ts,roster.service.ts,dto/roster.dto.ts}`
- Modify: `BE/apps/api/src/app.module.ts` (register `RosterModule`)
- Test: `BE/apps/api/test/roster.e2e-spec.ts`

**Interfaces:**
- Consumes: `SessionGuard`, `RolesGuard`, `@Roles` (from `../auth`), `StaffAuditService` (Task 3), `PrismaService`.
- Produces endpoints:
  - `GET /api/roster?includeArchived=true|false` → `RosterEntryDto[]`
  - `POST /api/roster` body `{ displayName:string; bio?:string; photoUrl?:string }` → `RosterEntryDto`
  - `PATCH /api/roster/:id` body `{ displayName?:string; bio?:string; photoUrl?:string; isActive?:boolean }` → `RosterEntryDto`
  - `RosterEntryDto = { id, displayName, bio, photoUrl, isActive, createdAt }`

- [ ] **Step 1: Write failing e2e** (mirror `BE/apps/api/test/*.e2e-spec.ts` bootstrap; log in as seeded `mod@example.com` for the cookie, and `test@example.com` for the 403).

```ts
it('403s for a LISTENER', async () => {
  await request(app).get('/api/roster').set('Cookie', listenerCookie).expect(403);
});
it('MODERATOR lists, creates, and archives a DJ + writes audit rows', async () => {
  const created = await request(app).post('/api/roster').set('Cookie', modCookie)
    .send({ displayName:'DJ Nova' }).expect(201);
  await request(app).patch(`/api/roster/${created.body.id}`).set('Cookie', modCookie)
    .send({ isActive:false }).expect(200);
  const list = await request(app).get('/api/roster?includeArchived=true').set('Cookie', modCookie).expect(200);
  expect(list.body.some((r:any)=>r.id===created.body.id && r.isActive===false)).toBe(true);
  const audits = await prisma.staffAuditLog.count({ where:{ action:{ in:['roster.create','roster.update'] } } });
  expect(audits).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Run — expect FAIL** (routes 404).

- [ ] **Step 3: Implement DTOs** (`class-validator`, matching the style in `BE/apps/api/src/users/dto/`).

```ts
// dto/roster.dto.ts
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class CreateRosterDto {
  @IsString() @MinLength(1) @MaxLength(120) displayName!: string;
  @IsOptional() @IsString() @MaxLength(2000) bio?: string;
  @IsOptional() @IsString() photoUrl?: string;
}
export class UpdateRosterDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) displayName?: string;
  @IsOptional() @IsString() @MaxLength(2000) bio?: string;
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
```

- [ ] **Step 4: Implement service** (`list/create/update`; every mutation calls `StaffAuditService.record`).

```ts
@Injectable()
export class RosterService {
  constructor(private prisma: PrismaService, private audit: StaffAuditService) {}
  list(includeArchived: boolean) {
    return this.prisma.rosterEntry.findMany({
      where: includeArchived ? {} : { isActive: true }, orderBy: { displayName: 'asc' },
    });
  }
  async create(actorId: string, dto: CreateRosterDto) {
    const r = await this.prisma.rosterEntry.create({ data: dto });
    await this.audit.record({ actorId, action:'roster.create', entity:'RosterEntry', entityId:r.id, metadata:{ displayName:r.displayName } });
    return r;
  }
  async update(actorId: string, id: string, dto: UpdateRosterDto) {
    const r = await this.prisma.rosterEntry.update({ where:{ id }, data: dto });
    await this.audit.record({ actorId, action:'roster.update', entity:'RosterEntry', entityId:id, metadata: dto as any });
    return r;
  }
}
```

- [ ] **Step 5: Implement controller** (RBAC + read `actorId` from `req.session.user.id`; copy the `@Roles`/guard usage exactly from `roles.guard.ts` docs).

```ts
@Controller('roster')
@UseGuards(SessionGuard, RolesGuard)
@Roles('MODERATOR')
export class RosterController {
  constructor(private svc: RosterService) {}
  @Get() list(@Query('includeArchived') inc?: string) { return this.svc.list(inc === 'true'); }
  @Post() create(@Req() req: any, @Body() dto: CreateRosterDto) { return this.svc.create(req.session.user.id, dto); }
  @Patch(':id') update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateRosterDto) { return this.svc.update(req.session.user.id, id, dto); }
}
```

- [ ] **Step 6: Register `RosterModule` in `app.module.ts`; run e2e — expect PASS.**

- [ ] **Step 7: Commit**

```bash
git add BE/apps/api/src/roster BE/apps/api/src/app.module.ts BE/apps/api/test/roster.e2e-spec.ts
git commit -m "feat(api): add moderator-gated roster CRUD with audit logging"
```

---

### Task 5: Shows module + public weekly schedule

**Files:**
- Create: `BE/apps/api/src/shows/{shows.module.ts,shows.controller.ts,shows.service.ts,dto/show.dto.ts}`
- Modify: `BE/apps/api/src/app.module.ts`
- Test: `BE/apps/api/test/shows.e2e-spec.ts`; `BE/apps/api/src/shows/schedule.spec.ts`

**Interfaces:**
- Consumes: `parseCadence`/`showsOnDate` (Task 2), guards, `StaffAuditService`, `PrismaService`, a `slugify(name)` helper (create inline in the service).
- Produces:
  - `GET /api/shows` (MOD) → `ShowDto[]` (`{ id,name,slug,cadence,roster:{id,displayName}[] }`)
  - `POST /api/shows` (MOD) `{ name, cadence, rosterIds:string[], description? }` → `ShowDto`
  - `PATCH /api/shows/:id` (MOD) partial → `ShowDto`
  - `DELETE /api/shows/:id` (MOD) → `204`
  - `GET /api/schedule` **(public)** → `{ days: { day:Weekday, shows:{ id,name,start,end,roster:string[] }[] }[] }` (WEEKLY only, ordered by start)
- `buildWeeklyGrid(shows): ScheduleDto` — pure, testable.

- [ ] **Step 1: Write failing unit test for `buildWeeklyGrid`** (WEEKLY show with `days:[MON,WED,FRI]` appears under MON/WED/FRI sorted by start; ONE_TIME shows excluded from the weekly grid).

- [ ] **Step 2: Write failing e2e** (LISTENER `403` on `POST /api/shows`; public `GET /api/schedule` returns `200` with no cookie; create→appears in grid→delete→gone; each mutation writes an audit row; `POST` with invalid cadence → `400`).

- [ ] **Step 3: Run — expect FAIL.**

- [ ] **Step 4: Implement `dto/show.dto.ts`** (validate `name`, `rosterIds` as `string[]`; validate `cadence` in the service via `parseCadence`, catching the throw → `BadRequestException`).

- [ ] **Step 5: Implement `shows.service.ts`** (create with `slugify` + `parseCadence`, connect `rosterIds` via `showRosterEntry`; `buildWeeklyGrid` groups WEEKLY shows by `days`; audit on create/update/delete).

```ts
private toGridRow(s) { const c = s.cadence; return { id:s.id, name:s.name, start:c.start, end:c.end, roster:s.roster.map(r=>r.roster.displayName) }; }
buildWeeklyGrid(shows) {
  const days = ['MON','TUE','WED','THU','FRI','SAT','SUN'].map(day => ({ day, shows: [] as any[] }));
  for (const s of shows) {
    const c = s.cadence; if (!c || c.kind !== 'WEEKLY') continue;
    for (const d of c.days) days.find(x=>x.day===d)!.shows.push(this.toGridRow(s));
  }
  for (const d of days) d.shows.sort((a,b)=>a.start.localeCompare(b.start));
  return { days };
}
```

- [ ] **Step 6: Implement `shows.controller.ts`** — `@Controller('shows')` mod-gated for CRUD; a **separate** `@Controller('schedule')` public `GET` (no guards) calling `buildWeeklyGrid`.

- [ ] **Step 7: Register module; run tests — expect PASS.**

- [ ] **Step 8: Commit**

```bash
git add BE/apps/api/src/shows BE/apps/api/src/app.module.ts BE/apps/api/test/shows.e2e-spec.ts
git commit -m "feat(api): add shows CRUD and public weekly schedule endpoint"
```

---

### Task 6: Attendance sheet + correction

**Files:**
- Create: `BE/apps/api/src/attendance/{attendance.module.ts,attendance.controller.ts,attendance.service.ts,attendance-status.ts,dto/attendance.dto.ts}`
- Modify: `BE/apps/api/src/app.module.ts`
- Test: `BE/apps/api/src/attendance/attendance-status.spec.ts`; `BE/apps/api/test/attendance.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `deriveStatus({ scheduledStart?:string, timeIn?:Date|null, timeOut?:Date|null, hasNote:boolean, date:string, graceMin?:number }): { status:'ON_TIME'|'LATE'|'ABSENT'|'AGREED_OVERTIME'; lateMinutes:number }` — pure.
  - `GET /api/attendance?date=YYYY-MM-DD&showId?` (MOD) → `AttendanceRowDto[]` (`{ recordId, episodeId, rosterId, displayName, scheduled, timeIn, timeOut, onAirHours, status, lateMinutes, note }`)
  - `PATCH /api/attendance/:recordId` (MOD) `{ timeIn?:string; timeOut?:string; note?:string }` → `AttendanceRecordDto`; `timeOut < timeIn` → `400`.

- [ ] **Step 1: Write failing tests for `deriveStatus`** (no `timeIn`→`ABSENT`; `timeIn ≤ scheduled+grace`→`ON_TIME`; `+20m`→`LATE`,`lateMinutes:20`; note present + over-slot→`AGREED_OVERTIME`).

- [ ] **Step 2: Write failing e2e** (LISTENER `403`; MOD `GET` returns today's seeded row; `PATCH` corrects time + note and status recomputes; `timeOut<timeIn`→`400`; correction writes an `attendance.correct` audit row).

- [ ] **Step 3: Run — expect FAIL.**

- [ ] **Step 4: Implement `attendance-status.ts`** (compare `HH:MM` scheduled start built from the show cadence for `date` to the actual `timeIn`; `onAirHours = (timeOut-timeIn)/3.6e6` rounded to 0.1).

- [ ] **Step 5: Implement service + controller** (`list` joins `attendanceRecord`→`episode`→`show` filtered by the `date` day-window and optional `showId`; derives scheduled start via `Show.cadence`; `correct` updates + audits; validate `timeOut>timeIn` → `BadRequestException`).

- [ ] **Step 6: Register module; run tests — expect PASS.**

- [ ] **Step 7: Commit**

```bash
git add BE/apps/api/src/attendance BE/apps/api/src/app.module.ts BE/apps/api/test/attendance.e2e-spec.ts
git commit -m "feat(api): add attendance sheet read and moderator correction"
```

---

### Task 7: Regenerate & verify the OpenAPI contract

**Files:**
- Modify (generated): `BE/apps/api/openapi.json`

- [ ] **Step 1: Regenerate the spec** — run the api's openapi export (`pnpm --filter wildcat-v2-api <openapi-script>`; find the script name in `BE/apps/api/package.json` — it runs `src/openapi.ts`).

- [ ] **Step 2: Verify new paths present**

Run: `node -e "const s=require('./BE/apps/api/openapi.json'); console.log(Object.keys(s.paths).filter(p=>/roster|shows|schedule|attendance/.test(p)))"`
Expected: lists `/api/roster`, `/api/roster/{id}`, `/api/shows`, `/api/shows/{id}`, `/api/schedule`, `/api/attendance`, `/api/attendance/{recordId}`.

- [ ] **Step 3: Commit**

```bash
git add BE/apps/api/openapi.json
git commit -m "chore(api): regenerate OpenAPI with roster/shows/schedule/attendance"
```

---

## Phase B — Contract sync

### Task 8: Pull the contract into the frontend + sanity-check hooks

**Files:**
- Modify (generated): `FE/openapi/openapi.json`, `FE/src/lib/api/endpoints/**`, `FE/src/lib/api/model/**`

- [ ] **Step 1: Sync + regenerate** — run `pnpm api:refresh` in `FE` (copies backend `openapi.json` → `orval`).

- [ ] **Step 2: Verify generated hooks exist**

Run: `ls FE/src/lib/api/endpoints` — expect new `roster/`, `shows/`, `schedule/`, `attendance/` folders; confirm `useGetRoster` (or the generated name) + mutation fns are present.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter wildcat-v2-web typecheck` (or `tsc --noEmit`) — expect no errors from generated code.

- [ ] **Step 4: Commit**

```bash
git add FE/openapi/openapi.json FE/src/lib/api
git commit -m "chore(web): regenerate orval client for org/schedule/attendance"
```

---

## Phase C — Frontend shells

### Task 9: Staff sidebar shell + `/mod` role-gated layout

**Files:**
- Create: `FE/src/components/layout/staff-sidebar.tsx`
- Create: `FE/src/app/(app)/mod/layout.tsx`
- Test: `FE/e2e/mod-access.spec.ts` (the RBAC redirect; full flows come in Task 16)

**Interfaces:**
- Consumes: `useSession` (`FE/src/lib/auth/client.ts`) with `data.user.role`.
- Produces: `<StaffSidebar active="roster|schedule|attendance" />` (renders `.wc-sidenav` per prototype markup); the `/mod` layout redirects non-MODERATOR/CUSTODIAN to `/login?next=…` (or `/` for logged-in listeners).

- [ ] **Step 1: Write failing e2e** — as `test@example.com` (LISTENER), `goto('/mod/roster')` asserts URL redirects away from `/mod`.

- [ ] **Step 2: Run — expect FAIL** (route doesn't exist yet).

- [ ] **Step 3: Build `staff-sidebar.tsx`** — port the `.wc-sidenav` block from `docs/frontend-design-basis-prototype/mod/roster.html` (groups Moderate/Station/Insights, Lucide icons, active state, light/dark toggle). Each link has `data-testid="mod-nav-<slug>"`. Keep it a bespoke `wc-*` surface (per AGENTS.md).

- [ ] **Step 4: Build `(app)/mod/layout.tsx`** — copy the client-guard pattern from `FE/src/app/(app)/layout.tsx`, then add a role check:

```tsx
'use client';
const { data, isPending } = useSession();
useEffect(() => {
  if (isPending) return;
  const role = data?.user?.role;
  if (!data) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  else if (role !== 'MODERATOR' && role !== 'CUSTODIAN') router.replace('/');
}, [data, isPending]);
// render skeleton while pending; else <div className="wc-shell"><StaffSidebar/><div className="wc-main">{children}</div></div>
```

- [ ] **Step 5: Run e2e — expect PASS.**

- [ ] **Step 6: Commit**

```bash
git add FE/src/components/layout/staff-sidebar.tsx "FE/src/app/(app)/mod/layout.tsx" FE/e2e/mod-access.spec.ts
git commit -m "feat(web): add staff sidebar shell and moderator-gated /mod layout"
```

---

### Task 10: Reusable data-table primitive

**Files:**
- Create: `FE/src/components/ui/table.tsx` (via shadcn CLI), then re-theme
- Create: `FE/src/components/mod/data-table.tsx`

**Interfaces:**
- Produces: `<DataTable columns={Column[]} rows={T[]} testid="mod-attendance" />` styled with `wc-table`.

- [ ] **Step 1: Add the shadcn table primitive**

Run: `cd FE && pnpm dlx shadcn@latest add table` (writes `src/components/ui/table.tsx`; does **not** touch `globals.css`).

- [ ] **Step 2: Re-theme to `wc-table`** — set the root `<table>` className to `wc-table` and remove default shadcn colors, matching `mod/attendance.html` markup.

- [ ] **Step 3: Build the generic `data-table.tsx`** wrapper (header row from `columns`, `data-testid={`${testid}-row`}` per row, `overflow-x-auto` container per prototype). No test (covered by page e2e).

- [ ] **Step 4: Commit**

```bash
git add FE/src/components/ui/table.tsx FE/src/components/mod/data-table.tsx
git commit -m "feat(web): add wc-table data-table primitive"
```

---

## Phase D — Frontend pages

### Task 11: `/mod/roster`

**Files:**
- Create: `FE/src/app/(app)/mod/roster/page.tsx`
- Create: `FE/src/components/mod/roster-form-dialog.tsx`

**Interfaces:**
- Consumes: generated roster hooks (Task 8), `Dialog`, `Button`, `Input`, `Textarea`, `Label` primitives.
- Produces: card grid + add/edit dialog + archive toggle, matching `mod/roster.html`.

- [ ] **Step 1: Build `roster-form-dialog.tsx`** — rhf + `zodResolver`, fields `roster-name`/`roster-bio`/`roster-status`, one `role="alert"`; on submit call the generated create/update fn, then `queryClient.invalidateQueries` on the roster query key.
- [ ] **Step 2: Build `page.tsx`** — `useGetRoster({ includeArchived })`, render `wc-card` grid (monogram, name, status pill, bio, Edit/Archive buttons with `data-testid`), `mod-roster-add` button opens the dialog, `mod-roster-show-archived` toggle. Archived cards get `opacity-60 grayscale`.
- [ ] **Step 3: Manual smoke** — `pnpm dev`, log in as mod, add/edit/archive a DJ; confirm no console errors.
- [ ] **Step 4: Commit**

```bash
git add "FE/src/app/(app)/mod/roster" FE/src/components/mod/roster-form-dialog.tsx
git commit -m "feat(web): add /mod/roster DJ management page"
```

---

### Task 12: `/mod/schedule`

**Files:**
- Create: `FE/src/app/(app)/mod/schedule/page.tsx`
- Create: `FE/src/components/mod/show-form-dialog.tsx`
- Create: `FE/src/lib/schedule/grid.ts` + `FE/src/lib/schedule/grid.spec.ts`

**Interfaces:**
- Produces: `toDaypartGrid(scheduleDto): { rows: { label:string; cells: Record<Weekday, ShowCell[]> }[] }` — pure, maps the `GET /api/schedule` payload into the prototype's Time×Day grid.

- [ ] **Step 1: Write failing test for `toDaypartGrid`** (a MON 13:00–16:00 show lands in the "1–4 PM" row under MON).
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement `grid.ts`** (bucket shows into dayparts by `start`; day columns MON–SUN).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Build `show-form-dialog.tsx`** — name, recurrence select (One-time/MWF/Daily/custom → `cadence`), `show-start`/`show-end` time inputs, roster-chip multiselect (`show-djs`) from `useGetRoster`; submit maps to the `cadence` shape and calls create/update.
- [ ] **Step 6: Build `page.tsx`** — `useGetShows()`, render the weekly grid table (`wc-table`), each filled `mod-schedule-cell` opens edit, empty cells open add; `mod-schedule-add` button.
- [ ] **Step 7: Manual smoke** — add MWF show, verify placement; edit, delete.
- [ ] **Step 8: Commit**

```bash
git add "FE/src/app/(app)/mod/schedule" FE/src/components/mod/show-form-dialog.tsx FE/src/lib/schedule
git commit -m "feat(web): add /mod/schedule weekly show admin"
```

---

### Task 13: `/mod/attendance`

**Files:**
- Create: `FE/src/app/(app)/mod/attendance/page.tsx`
- Create: `FE/src/components/mod/attendance-edit-dialog.tsx`

- [ ] **Step 1: Build `attendance-edit-dialog.tsx`** — `att-timein`/`att-timeout` time inputs + `att-note` textarea; submit calls `PATCH /api/attendance/:id` fn, invalidates the attendance query.
- [ ] **Step 2: Build `page.tsx`** — `mod-attendance-date` (default today) + `mod-attendance-show` filters; `useGetAttendance({date,showId})` into `<DataTable>` (Task 10) with status pills (`wc-pill-*`) and `.tnum` times; `mod-attendance-edit` per row opens the dialog; empty-state copy when no rows.
- [ ] **Step 3: Manual smoke** — correct a time + note; confirm row + status update.
- [ ] **Step 4: Commit**

```bash
git add "FE/src/app/(app)/mod/attendance" FE/src/components/mod/attendance-edit-dialog.tsx
git commit -m "feat(web): add /mod/attendance sheet with corrections"
```

---

### Task 14: `/studio` Attendance mode + segmented nav

**Files:**
- Modify: `FE/src/app/(station)/studio/page.tsx`
- Create: `FE/src/components/studio/attendance-panel.tsx`
- Create: `FE/src/components/studio/sub-timein-dialog.tsx`

**Interfaces:**
- Consumes: existing generated `getStudioToday`, `timeInStudio`, `timeOutStudio` (already in the client).
- Produces: a `.wc-seg` Attendance⇄Console toggle (default **Attendance**); the attendance panel renders one row per rostered DJ for the current slot with a `studio-timein` button and timed-in pill, plus `studio-timein-sub`.

- [ ] **Step 1: Build `attendance-panel.tsx`** — `useQuery` over `getStudioToday`; render current-slot check-in card + "today's schedule" side list per `studio/studio-attendance.html`; `studio-timein` calls `timeInStudio({rosterId})` then invalidates today; row flips to "Timed in ✓" pill.
- [ ] **Step 2: Build `sub-timein-dialog.tsx`** — roster search (`useGetRoster`) → time in a non-slot DJ.
- [ ] **Step 3: Add the `.wc-seg` toggle to `studio/page.tsx`** — `studio-seg-attendance` / `studio-seg-console`; Attendance is the default surface; Console is the existing panel (gated on unlock). Preserve the existing station-session unlock flow.
- [ ] **Step 4: Manual smoke** — with a station token, time in a DJ; toggle to Console and back.
- [ ] **Step 5: Commit**

```bash
git add "FE/src/app/(station)/studio/page.tsx" FE/src/components/studio
git commit -m "feat(web): add studio attendance mode and segmented nav"
```

---

### Task 15: Public `/schedule`

**Files:**
- Create: `FE/src/app/(public)/schedule/page.tsx`
- Modify: `FE/src/components/layout/{top-nav,bottom-nav,mobile-drawer}.tsx` (point the placeholder `href="#"` schedule links to `/schedule`)

- [ ] **Step 1: Build `page.tsx`** — `useGetSchedule()` → reuse `toDaypartGrid` (Task 12) → read-only weekly grid (`schedule-grid`, `schedule-cell`), no `/mod` chrome.
- [ ] **Step 2: Wire the nav links** to `/schedule`.
- [ ] **Step 3: Manual smoke** — logged out, `/schedule` renders the grid.
- [ ] **Step 4: Commit**

```bash
git add "FE/src/app/(public)/schedule" FE/src/components/layout
git commit -m "feat(web): add public weekly schedule page"
```

---

## Phase E — Tests, docs, verification

### Task 16: Playwright golden + edge specs

**Files:**
- Create: `FE/e2e/mod-org-schedule-attendance.spec.ts`, `FE/e2e/studio-attendance.spec.ts`, `FE/e2e/public-schedule.spec.ts`

- [ ] **Step 1: Author the mod golden + edge spec** per `qa-plan.md` (login as `mod@example.com`; roster add/edit/archive; schedule add/edit/delete; attendance correct; LISTENER redirect + 403 edge; validation edges). Titles reference `AC-#`. Select by `data-testid`.
- [ ] **Step 2: Author the studio-attendance spec** (mint station token as in `e2e/engagement.spec.ts`; default Attendance mode; time-in flips pill; sub time-in; ad-hoc episode edge).
- [ ] **Step 3: Author the public-schedule spec** (anonymous grid render).
- [ ] **Step 4: Run the full e2e suite**

Run (with backend `:3001` + web `:3000` up): `pnpm --filter wildcat-v2-web exec playwright test mod-org-schedule-attendance studio-attendance public-schedule`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add FE/e2e/mod-org-schedule-attendance.spec.ts FE/e2e/studio-attendance.spec.ts FE/e2e/public-schedule.spec.ts
git commit -m "test(web): add e2e for org/schedule/attendance + studio + public schedule"
```

---

### Task 17: Full-rubric verification + docs finalize

**Files:**
- Modify: `FE/docs/features/05-fe5-org-schedule-attendance/{feature.md,qa-plan.md}` (tick evidence)

- [ ] **Step 1: Build/typecheck both workspaces** — `pnpm --filter wildcat-v2-api build` and `pnpm --filter wildcat-v2-web build`; both green.
- [ ] **Step 2: Run all unit + e2e** (backend jest + frontend playwright); paste output as evidence.
- [ ] **Step 3: Backend e2e RBAC sweep** — confirm `403` for LISTENER on every mod endpoint; `200`/`400` shapes correct.
- [ ] **Step 4: DB sanity via Neon MCP** — confirm a created `roster_entries`, a `shows` row, a corrected `attendance_records`, and matching `staff_audit_logs` rows exist.
- [ ] **Step 5: Regression** — `GET /api/stream/manifest` `dj` array reflects timed-in roster entries; `/studio` Console still unlocks; `/listen` unaffected.
- [ ] **Step 6: Console/log scan + a11y** — clean browser console + backend logs after each golden flow; keyboard-nav the `/mod` pages and dialogs; responsive at 375/768/1024/1440.
- [ ] **Step 7: Parity screenshots** — `/mod/{roster,schedule,attendance}`, `/studio` (Attendance), `/schedule` vs the prototype; attach.
- [ ] **Step 8: Fill the evidence sections in `feature.md`/`qa-plan.md`, then commit**

```bash
git add "FE/docs/features/05-fe5-org-schedule-attendance"
git commit -m "docs(web): record FE#5 verification evidence"
```

---

## Self-Review

**Spec coverage:** AC-1/2 → Task 4 + 11; AC-3/4 → Task 5 + 12; AC-5 → Task 6 + 13; AC-6 → Task 14; AC-7 → Task 5 + 15; AC-8 → Task 4/5/6 (backend 403) + Task 9 (redirect); AC-9 → Task 3 (audit) + Task 2/5/6 (validation) + Task 14 (ad-hoc episode); AC-10 → Tasks 11–15 (empty states + `role="alert"`). Verification rubric → Task 17. All spec sections have a task.

**Placeholder scan:** no "TBD/handle edge cases/similar to"; every code step carries real code or an exact command. Package/script names (`wildcat-v2-api`, `wildcat-v2-web`, db package) are marked to confirm from `package.json` at execution — a deliberate lookup, not a placeholder.

**Type consistency:** `Cadence`/`Weekday`/`parseCadence`/`showsOnDate` (Task 2) reused in Tasks 5/6/12; `StaffAuditService.record` signature (Task 3) called identically in Tasks 4/5/6; `buildWeeklyGrid` (Task 5, backend) vs `toDaypartGrid` (Task 12, frontend) are intentionally distinct (payload shaping vs daypart bucketing); generated hook names are confirmed in Task 8 before first use.

**Open confirmations at execution time** (not blockers): exact pnpm filter names + test/openapi script names from each `package.json`; the real `PrismaService`/`PrismaModule` import paths; the generated orval hook names.
