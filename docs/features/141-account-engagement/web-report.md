# Engagement frontend implementation and verification

Spec: paired backend `docs/features/203-account-engagement/feature.md`, AC-5–13. Branch `feature/141-account-engagement`.

## Behavior delivered

- Studio Pending, Up Next and History views; Pending alone drives the badge. Pending exposes Queue, Read on air and Decline. Only queued items expose Handled. Terminal history has no dead action controls.
- Operator success copy follows returned status, independent of receipt opt-out. Handling removes public items without a new receipt.
- Public listener and playing global-player queues recover the same authoritative oldest-submission-first snapshot, ordered by createdAt then ID and capped at five. `queue:changed`, compatibility acceptance events and reconnect recover the list. Latest-read version checks reject stale fetches.
- My submissions is private and episode-scoped. It shows neutral Closed states, server-derived remaining allowance, shared type/no-refund explanations and explicit history truncation. The latest episode ID is remembered per user so history can be read after ending/reloading; content remains authenticated and comes from the API.
- Episode pause switches remain distinct from station-wide restrictions. Listeners see effective restrictions; staff exemptions, guest voting restrictions, and preserved reactions follow the backend policy. Controls events trigger authoritative GET recovery rather than retaining an unversioned event payload.
- Lock this browser confirmation explains continued playback and reopening from the Studio app.
- Listener and booth chats use the existing Radix/shadcn dialog for viewport-height focus mode. The composer stays outside the scrolling feed; Escape/exit restores trigger focus. Readers at the bottom follow messages. Older-message readers retain a message anchor (including capped-feed eviction), with a keyboard-accessible New messages jump.
- Existing visual tokens and branded chat/studio surfaces are retained. Generated API functions/types are used through the small `src/lib/engagement/api.ts` alias module; no manual generated-file edits.

## Test-first evidence

Initial focused run on 2026-10-23: `pnpm exec vitest run src/lib/engagement/queue-policy.spec.ts src/lib/engagement/chat-scroll.spec.ts src/lib/realtime/engagement-state.spec.ts`.

- Two existing snapshot assertions failed as intended: a handled/live item was resurrected, and seven reversed IDs were neither oldest-first nor capped at five.
- New queue-policy/chat-scroll suites initially failed because their new production modules did not exist.
- After implementation, all 20 tests in those three files passed. The expanded relevant engagement/realtime run passed 52 tests in eight files.
- Full frontend unit run: `pnpm exec vitest run` passed 408 tests in 51 files (03:13 local, 2026-10-23).
- Final targeted ESLint across every owned engagement source file and browser fixture/test passed with no warnings (03:18 local, 2026-10-23).
- Typecheck initially identified a nullable remembered-history read, fixed locally. Subsequent failures were the coordinating agent's unrelated OpenAPI export-mode signature mismatch; the coordinator owns regeneration and full typecheck/build evidence.

## Real browser acceptance suite

`e2e/account-engagement.spec.ts` uses the real isolated local API, signed-in listener sessions, station handoff, HLS playback and Socket.IO. No API interception or simulated socket backend is used. DB writes are limited to deterministic fixture setup/cleanup.

1. Opted-out campus listener sends request/dedication/question; booth queues/handles/reads/declines; private statuses and allowance persist through episode end/reload.
2. Guest consumes the shared two-item allowance across request/dedication; declining and reloading does not refund it; UI blocks further sending and API rejects it.
3. Seven submissions accepted in reverse order produce the oldest five across listener/player, route changes, handling while disconnected, reconnect and reload.
4. Independent booth pauses, voting during chat pause, staff freeze/guest precedence, staff exemption, protected control writes, preserved reactions, end/resume reset, browser lock and continuing playback.
5. Listener and booth focus modes preserve a scrolled reading position under incoming real messages; keyboard jump and Escape focus restoration; mobile composer fits and sends.

Existing `e2e/engagement.spec.ts` retains its coverage with the new receipt copy and persisted quota block expectations. Existing synthetic live-path fixtures receive neutral values for the two additive reads, without adding new mocked browser acceptance.

## Browser investigation ledger

- Run 1 (`../engagement-browser-run1.log` and JSON): initial request returned HTTP 500. Server evidence was Prisma P2028, commit elapsed 6873 ms against a 5000 ms transaction timeout; a watchdog transaction expired concurrently. Coordinator identified heavy concurrent compilation and memory pressure. No timeout was increased. Remaining cases were suppressed by serial-mode failure; the independent cases now continue after failures.
- Run 2 (`../engagement-browser-run2.log` and JSON): 1 passed, 4 failed. Guest shared quota/no-refund passed. The first case successfully queued/handled/read/declined but could not open private history; the public player case used a full navigation that stopped playback; the control fixture assumed optional settings rows existed and failed before cleanup; the focus flow reached its mobile screenshot but inherited the leaked scheduled fixture and failed cleanup. These are not counted as four browser passes.
- History click diagnosis used the real rendered page and a normal click: `../engagement-sticky-diagnostic.log` records summary geometry and `elementsFromPoint`, then click interception by the nested sticky Stage. Removing only the Stage's redundant sticky classes in the diagnostic DOM made the normal click succeed (`../engagement-sticky-diagnostic-fixed-dom.log`). Before/after PNGs accompany those logs. The same minimal source fix retains the outer left column's sticky positioning.
- An independent review identified a silent terminal-state refresh gap. The first real case now submits an additional pending item and requires Closed after episode end **without reload**. `useSubmissions` now invalidates the remembered episode once when the active episode ends, before regular polling stops. This requires the next production rebuild for browser validation.
- Fixture repairs move all setup after broadcast creation inside `try/finally`, tolerate already-closed browser contexts so DB cleanup still executes, use actual client navigation for the player test, and restore initially absent setting rows exactly after resetting cached flags through the API. Mobile screenshots now capture the viewport; the test explicitly checks a 390 × 844 dialog at (0, 0).
- Player admission review exposed a snapshot-before-subscription race. `presence-recovery.spec.ts` reproduced all four failures against the previous immediate-read behavior, including displaying a handled item when it was completed before room admission. The player now reads its snapshot only after a successful join acknowledgement and rejects stale admission callbacks/identity lookups after disconnect or rejoin. `../player-admission-red.log` records four expected failures; `../player-admission-green.log` records 31 passing tests across five focused suites with browser timezone overrides cleared.
- The focused suite now asserts final cleanup of every owned episode/station/show and seeded listener account. All new browser run logs/JSON/screenshots live outside the repositories under the parent `.agent/account-engagement` directory.

The coordinator preserves the failed database for evidence and will use a fresh isolated database and rebuilt servers for the next exclusive run. No complete browser pass, physical keyboard pass, deployment, commit or push is claimed yet.
