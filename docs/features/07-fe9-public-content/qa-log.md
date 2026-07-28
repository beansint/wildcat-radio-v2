# FE#9 browser QA coverage log (M5 public content + announcements/settings admin)

Comprehensive Playwright pass over every FE#9 surface and its edges, against a **live** stack:
backend `:3010` (real Neon dev branch) and frontend `:3011` served from a **production build**
(`pnpm build && pnpm start`, not `next dev` — see *Test-hygiene notes*).

```
pnpm exec playwright test e2e/public-content.spec.ts e2e/mod-announcements.spec.ts e2e/mod-settings.spec.ts
→ 67 passed · 2 skipped · 0 failed   (run twice back-to-back, identical both times)

pnpm test:unit                    → 111 passed / 111 (12 files)
pnpm exec tsc --noEmit / pnpm build → clean
Full frontend suite (18 files)    → 100 passed; 9 pre-existing failures in specs untouched by FE#9 (see below)
Backend, serially                 → 326/326 unit · 289/289 e2e
```

## Coverage matrix

| Feature / scenario | Covered? | Spec / test | Notes |
|---|---|---|---|
| **Public — announcements list, pinned first** | Yes | `public-content::PUB-C-01`, `PUB-E-01` | Server order preserved, hero = first pinned |
| Public — announcement detail, body + photos | Yes | `public-content::PUB-E-01` | Paragraphs as text, never `dangerouslySetInnerHTML` |
| **Public — readable `<slug>-<publicId>` address** | Yes | `public-content::PUB-C-01`, `PUB-E-01` | No link anywhere uses a bare cuid |
| Public — stale slug self-heals to canonical | Yes | `public-content::PUB-E-02b` | Title edited after a link was shared → still resolves, address corrects |
| Public — old bare-cuid link still resolves | Yes | `public-content::PUB-E-02c` | Previously-shared links don't rot |
| Public — publish → visible publicly | Yes | `public-content::PUB-C-02`, `mod-announcements::ANN-E-01` | The issue's headline acceptance |
| Public — shows index + detail (lineup, episodes) | Yes | `public-content::PUB-E-03` | |
| Public — DJs index + profile, active only | Yes | `public-content::PUB-E-04` | Inactive DJ id 404s directly |
| Public — charts, populated and empty | Yes | `public-content::PUB-C-07`, `PUB-E-06` | Empty week → empty state with label, no spinner |
| Public — landing sections are live, not mocks | Yes | `public-content::PUB-I-01`, `PUB-I-02` | Featured / most-requested / shows grid |
| Public — every route reachable with no session | Yes | `public-content::PUB-I-03` | All 7 routes + `/schedule` |
| Public — cross-links resolve (show↔DJ, schedule→show) | Yes | `public-content::PUB-E-08` | The Slice C linkability fields |
| Public — 404 for draft/rejected/archived/unknown | Yes | `public-content::PUB-C-03`, `PUB-E-02`, `PUB-E-05` | Identical shape, no existence leak |
| Public — 429 renders retry card, retry works | Yes | `public-content::PUB-E-07` | Provoked via route interception (see gap G1) |
| Public — global player survives navigation | Yes | `public-content::PUB-I-04` | |
| Public — staff dark mode never leaks | Yes | `public-content::PUB-I-05` | |
| Public — 375×812, no horizontal scroll | Yes | `public-content::PUB-I-06` | |
| Public — keyboard traverse + heading structure | Yes | `public-content::PUB-E-09` | |
| **INV-1 — no moderator identity on public pages** | Yes | `public-content`, `mod-announcements::ANN-E-08` | Asserted on both DOM **and** network payloads |
| **Announcements — full lifecycle** | Yes | `mod-announcements::ANN-C-02`, `ANN-E-01` | create→submit→review→publish→pin→feature→archive |
| Announcements — schedule instead of publish | Yes | `mod-announcements::ANN-E-02` | Future datetime, sent as UTC |
| Announcements — reject requires a reason | Yes | `mod-announcements::ANN-E-03` | Empty reason blocked client-side, no request |
| Announcements — one mod publishes *and* features (L34) | Yes | `mod-announcements::ANN-E-04` | No second-approver UI anywhere |
| Announcements — pin cap, 3rd pin refused humanely | Yes | `mod-announcements::ANN-C-04`, `ANN-E-05` | Control disabled at cap; forced attempt → 409 as a sentence |
| Announcements — wrong-state transitions 409 / missing 404 | Yes | `mod-announcements::ANN-C-03` | Actions offered are derived from status |
| Announcements — tabs partition rows, real counts | Yes | `mod-announcements::ANN-I-01` | Seven statuses |
| Announcements — provenance rendered, resolved handles | Yes | `mod-announcements::ANN-I-02` | Never a raw id |
| Announcements — server state, not optimistic fiction | Yes | `mod-announcements::ANN-I-03` | Failed action leaves status unchanged |
| Announcements — photo presign + confirm halves | Yes | `mod-announcements::ANN-E-06`, `ANN-C-05` | Exact contentType/sizeBytes asserted |
| Announcements — photo limits (.gif / >5MB / 5th) | Yes | `mod-announcements::ANN-E-07`, unit `ANN-U-04` | Three distinct client-side refusals |
| **Announcements — full browser→R2 upload round trip** | **No** | `mod-announcements::ANN-E-06b` | **Blocked, see G2 — a real product defect, not a test gap** |
| Announcements — dialog focus trap, Escape, focus return | Yes | `mod-announcements::ANN-E-09` | Whole lifecycle completable by keyboard |
| **Settings — one admin read hydrates the form** | Yes | `mod-settings::SET-I-01` | Zero per-key reads (Slice C AC-C7) |
| Settings — only registry-backed fields render | Yes | `mod-settings::SET-I-02`, `SET-E-09` | Absence of the dead prototype controls is asserted |
| Settings — typed writes, one PUT per changed key | Yes | `mod-settings::SET-C-02`, unit `SET-U-01/02` | `5` not `"5"`; unknown key → 400 |
| Settings — round trip survives reload | Yes | `mod-settings::SET-I-03`, `SET-E-01` | |
| Settings — discard reverts, sends nothing | Yes | `mod-settings::SET-I-04` | |
| Settings — blank numeric blocked client-side | Yes | `mod-settings::SET-E-02` | Single alert region, no request |
| Settings — partial save failure names the key | Yes | unit `SET-U-07` | |
| Settings — writes are audited | Yes | `mod-settings::SET-C-03` | Verified through the mod logs API |
| Settings — filter list CRUD + normalization | Yes | `mod-settings::SET-C-04`, `SET-I-05` | UI shows the server's normalized form |
| Settings — copy change reflects on the public site | Yes | `mod-settings::SET-E-05` | Landing hero tagline reads public `GET /settings` |
| Settings — budget change takes effect immediately | Yes | `mod-settings::SET-C-07`, `SET-E-06` | Guest's 2nd request refused, no restart |
| Settings — room controls take effect immediately | Yes | `mod-settings::SET-C-06` | Cache invalidated on write |
| **Settings — chat-freeze refusal at send time** | Partial | `mod-settings::SET-E-03` | See G3 — needs a live broadcast fixture |
| Settings — mobile preview sheet | Yes | `mod-settings::SET-I-06` | Desktop column unmounts <1024px |
| Settings — a11y: tab order, Space, arrow keys, sheet focus | Yes | `mod-settings::SET-E-07` | |
| **RBAC — LISTENER refused, CUSTODIAN passes** | Yes | `ANN-E-10`, `SET-E-08`, `ANN-C-06`, `SET-C-05` | Both staff routes, rank-based |
| **INV-8 — console + network clean** | Yes | `_console.ts` guard on every flow | Zero errors/warnings; no unexpected ≥400 |

### Remaining gaps (3, all explicit)

- **G1 — public 429 is simulated, not provoked.** The API relaxes its throttle 200× under
  `NODE_ENV=test`, so the real limit can't be hit deterministically from the suite. The browser-tier
  case drives a real 429 through route interception (deterministic, and it exercises the actual UI
  path); the contract-tier twin (`PUB-C-06`) is skipped with that reason recorded in the spec.
- **G2 — the browser→R2 photo upload cannot complete.** See *Bugs found* — this is a product
  blocker, not a testing shortfall, and the test is written and ready to un-skip.
- **G3 — chat-freeze refusal at send time.** `toggle.chatFreeze` persistence and its API effect are
  fully verified (`SET-C-06`), but typing into a frozen chat needs a live broadcast (studio time-in
  + stream heartbeat) which this settings-scoped suite doesn't stand up. The test annotates the
  precondition rather than silently passing.

## Bugs found

1. **The R2 bucket has no CORS policy, so announcement photo upload cannot work in any browser.**
   Un-gating `ANN-E-06b` (the credentials do exist) produced:
   `Access to fetch at 'https://wildcat-radio.<account>.r2.cloudflarestorage.com/...' from origin
   'http://localhost:3011' has been blocked by CORS policy: Response to preflight request doesn't
   pass access control check: No 'Access-Control-Allow-Origin' header`. The presign and confirm
   halves both work; the middle hop is impossible until the bucket allows `PUT` from the app
   origins. **Unfixed — needs a Cloudflare bucket configuration change.** The UI degrades honestly
   (the failure surfaces in the single alert region).
2. **The photo uploader sent a `{type, size}` descriptor instead of the real `File`.** R2 signs an
   exact `Content-Length`, so the bucket — not our API — would have rejected it. Fixed, with a unit
   test asserting the request body is the file object itself.
3. **`GET /api/shows` returned 401 to anonymous callers** (backend Slice C). The guarded staff
   controller shadowed the public one. Fixed by following the announcements precedent: public owns
   the bare path, staff moved to `/shows/admin`.
4. **`announcements.pinLimit` was read with a per-key `GET /settings/:key` that 404s** when the key
   has never been written — a console error on every `/mod/announcements` load. Now read off the
   whole-registry admin list.
5. **The settings spec permanently reconfigured the real station.** It wrote `policy.strike1Hours`
   and `branding.tagline`, and its restore step only restored keys that already existed — so
   keys the test *created* were left at fixture values. This left `strike1Hours = 30` (breaking the
   backend's own strike-ladder e2e, which was initially misattributed to external state) and an
   "E2E FE9 Tagline …" string on the public landing page. Fixed: keys created by a run are reset to
   their registry default in `afterAll`, and the polluted values were restored.
6. **Dialog focus was not returned to its trigger on Escape.** Radix only restores to a
   `<Dialog.Trigger>`; these dialogs open from page state, so focus dropped to `<body>`. Fixed with
   an explicit `onCloseAutoFocus` in both announcement dialogs.
7. **Leaked pins broke later tests and later runs.** The pin cap is a station-wide invariant, so a
   test that pinned without unpinning consumed a slot permanently. Added a `resetPins` fixture and
   set the suite to `workers: 1` — the specs share one live database, and global invariants can't be
   tested concurrently.
8. **`playwright.config.ts` pointed at `localhost:3000`** while this project's frontend runs on
   3011, so every spec using a relative `goto()` was silently hitting a dead port. Fixed, which
   turned 4 "failing" sibling specs green. `mod-access.spec.ts` had the same literal inline.
9. **Emoji used as structural icons** (`⭐ Featured`, `📌 Pinned`) — platform-dependent rendering,
   not themeable, announced as unicode names by screen readers. Replaced with Lucide glyphs.
10. **The announcement detail page rendered at 535px instead of the prototype's 768px**, and the
    featured card collapsed to 119px tall against the prototype's 326px. Both found by rendering the
    prototype and the implementation at the same viewport and comparing measured boxes, after the
    owner flagged them by eye. Two independent causes: (a) `.wc-container` and `max-w-3xl` on the
    same element both set `max-width` at equal specificity, so the later-defined `.wc-container`
    (1180px) silently won and the reading measure was never applied — the same collision class
    `globals.css` already documents for padding; (b) `.wc-container`'s `margin: 0 auto` on a direct
    flex child of `<body>` suppresses the flex stretch, leaving the box to shrink-to-fit its content
    — invisible on pages full of wide cards, obvious on a page whose content is one short paragraph.
    Fixed at source with `width: 100%` on `.wc-container`, plus separating container from reading
    measure on the detail page. The card collapse was a third cause: the prototype's hero media is an
    `<img>` with an intrinsic aspect ratio, and the no-photo placeholder is a `<div>` with none, so
    at `md:h-auto` it contributed no height. Detail article now measures 768px at x=336 —
    pixel-identical to the prototype.
11. **Two spec assertions were wrong about the contract, not the app** (recorded so they aren't
    "fixed" back): `getByRole('alert')` over-counted because Next.js injects its own
    `#__next-route-announcer__` with `role="alert"`; and the filter-list cases assumed raw terms
    survive round-trip when the backend deliberately normalizes them to defeat filter evasion.

## Second review pass — defects found after the first sign-off

An adversarial review of the working tree (before commit) found nine further issues. All are fixed
here, and the suite was re-run green afterwards (67 passed · 2 skipped · 0 failed).

1. **`/mod/settings` showed a skeleton forever when the settings read failed, and its error branch
   was unreachable code.** On an error the query is no longer "loading" but `values` stays null, so
   an unqualified `!values` pinned `isLoading` true — and the page checks `isLoading` before
   `isError`. A moderator hitting a down API got two pulsing grey bars, no error, no retry.
2. **Unsaved settings edits were silently discarded.** The admin query refetches on window focus, and
   re-hydration overwrote every field unconditionally — alt-tab away and back, and your edit was
   gone. The same overwrite meant a *partial* save (one key 200s, one 400s) reset the failed key too:
   the alert named a field whose edit had already been thrown away and whose Save was no longer
   armed, so pressing Save again sent nothing. Re-hydration now preserves fields that are dirty
   relative to what was last loaded (`mergePreservingEdits`, 6 unit cases).
3. **The edit dialog was unreachable by keyboard.** Edit was triggered only by `onClick` on a
   non-interactive `<article>` — no role, no tabIndex, no key handler. A keyboard-only moderator
   could reach Submit/Review/Pin/Feature/Archive but could not open a DRAFT for editing at all,
   which is the lifecycle's first step. The qa-log above claimed "whole lifecycle completable by
   keyboard"; that claim was wrong. Now a real Edit `<Button>`.
4. **Tab counts and the pin cap were computed off one page of 100 rows** against a table holding
   1128. A pinned row past page 1 was invisible to the tally, so the cap warning never rendered, Pin
   looked available, and the API answered 409 with no warning. Fixed on the backend
   (`countsByStatus` + `pinnedCount`, whole-table, plus a `status` filter) and the page now reads
   both from the server. Older rows were also simply unreachable — there is now a Load more control.
5. **A native `<select>` and raw `<input>` in the review dialog**, against AGENTS.md, justified in a
   comment by Playwright's `.selectOption()` only working on a real `<select>` — shaping the product
   to fit the test. Both are shadcn primitives now; the spec clicks the option the way a moderator
   does.
6. **`PUB-I-05`, the dark-mode-leak test, could not fail.** It navigated to `/mod` — which is not a
   route, only its children are — got a 404 with no staff chrome, found no theme toggle, and fell
   through a best-effort `if`. Dark mode was never switched on, so the "public page isn't dark"
   assertion passed regardless of app behaviour. Now logs in, asserts the toggle exists, asserts the
   staff shell is genuinely dark, and only then checks the public page.
7. **Three tests were order-dependent, passing only on a database a previous run had left behind.**
   `SET-C-01` asserted that the admin read returns the policy/toggle/killswitch groups — but those
   rows are created by tests *later in the same file*, so it failed on a clean database and passed on
   a dirty one. `SET-E-02` hardcoded a recovery value of `24`, which is a no-op when the stored value
   is already 24, leaving Save correctly disabled and the test hanging on it. `SET-I-01` treated the
   public `GET /api/settings` as a "per-key read", which raced with the preceding navigation. Each
   now establishes its own precondition.
8. **`isAllowedImageHost` and `next.config.ts` disagreed about the fallback media host.** The config
   defaulted to the dev bucket; the filter returned `false` when the env var was unset. A deploy that
   forgot `NEXT_PUBLIC_MEDIA_HOST` would configure `next/image` correctly and then filter out every
   real photo — all imagery silently becoming initials placeholders, with no error anywhere. One
   shared constant now.
9. **Smaller fixes:** the `wc-container` + `max-w-*` collision (documented as fixed on the
   announcement detail page) was repeated on the DJ profile and the not-found state; `/shows/[slug]`
   asserted "no upcoming episodes" during the episodes round trip, before it knew; stale mutation
   errors bled into freshly-opened dialogs; `expect(firstFocused).toBeTruthy()` could not fail
   (`document.activeElement` is `<body>` at worst, whose tagName is truthy); and a stray Tagalog
   fragment ("sa booth") shipped in public charts copy.

## Test-hygiene notes

- **Run the browser suite against a production build** (`pnpm build && pnpm start`), not `next dev`.
  Under `next dev` the suite showed a ~1-in-22 intermittent failure that isolation never reproduced;
  it is dev-server route recompilation latency exceeding a 10s expectation, not app behaviour. On a
  production build the suite is clean across four consecutive runs.
- `workers: 1` is deliberate — see bug 7.
- Fixtures are created through the API and cleaned FK-safe. Announcements and roster entries have no
  hard-delete route, so cleanup archives / deactivates and the suite asserts that end state rather
  than absence.
- **Backend and frontend suites must not run concurrently.** Both assert station-wide invariants
  (the pin cap most obviously) against the same database; running them at once produces failures on
  correct code. Observed and reproduced in both directions.
- **Known DB residue:** ~300 archived `E2E FE9 …` announcements have accumulated on the dev branch
  from repeated runs. They are archived (invisible publicly) but they dominate the staff list and
  make screenshots noisy. There is no delete endpoint; purging needs a direct SQL delete, which has
  not been run because it is destructive and needs the owner's go-ahead.

## Out-of-scope failures observed

Nine tests fail in the full frontend suite, all in specs FE#9 never touched:
`listen-gate.spec.ts`, `profile-edit.spec.ts`, `engagement.spec.ts`, `studio-attendance.spec.ts`,
`stream-playback.spec.ts`. Each hardcodes `http://localhost:3000` (or `:3001` for the API) rather
than this workspace's 3011/3010, so they never reach a running server; `stream-playback` also needs
the Icecast/Liquidsoap stack. Pre-existing, unrelated to this issue, and left alone deliberately —
fixing them is its own cleanup task.
