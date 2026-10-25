# QA log — 2026-10-25

RED observed before repairs:

- Same-transport admission: refused ack never recovered (`false` instead of `true`).
- Off-air-to-live push: player stayed OFF_AIR after `stream:manifest`.
- Healthy controls: five reads instead of two initial reads after 45 seconds.
- Late Studio poll: previous episode's poll appeared in the new console.
- Lifecycle resume: terminal marker kept composer closed despite fresh LIVE manifest.
- Connected controls failure: persisted pause flags never recovered without another event.
- Older partial Studio status: OFF_AIR replaced a newer authoritative LIVE display.
- Persistent socket identity: retained handshake stayed Alice after the owner subtree became Bob. Idle and in-flight identity cases were added to the repaired suite.
- Frozen-clock identical manifests exposed QueryObserver result equality hiding a new successful observation. The provider now observes successful QueryCache changes directly and publishes the count via StreamContext.

Recorded verification:

- `pnpm test`: 53 files / 425 tests passed; typecheck passed; lint had zero errors and six existing warnings in unrelated legal, my-data, OpenGraph, show-form and strike-dialog files.
- `pnpm build`: successful optimized production build before final review refinements; final build rerun recorded below.
- Affected mocked browser suites: first repaired run 27/27 passed. After reviewer refinements, focused realtime contracts 6/6 passed, including connected-error controls, actual hook admission retry and frozen-clock identical-manifest resume. The later combined 30-case rerun and paired gateway evidence are appended after completion.
- Earlier broader run exposed four obsolete assumptions about fixed 15-second polling; fixtures now drive authoritative pushes or explicit focus recovery. A later run exposed initial-auth transport refresh count assumptions; tests now hold the stable post-auth count when proving no recovery reconnect.
- Golden and edge screenshots were visually inspected. They show the authoritative next/newer show, stable layout and available chat; playback is truthfully unavailable where the metadata fixture supplies no media URL.

Evidence scope: route-mocked contracts and decoded local media fixtures do not prove physical booth, remote provider or live phone behavior. The real gateway harness is also explicitly separate from backend PG integration and the coordinator's actual combined-stack session tests. No deploy/push/PR was performed by this implementation branch.

Final first-scope evidence:

- Broad affected browser run: 30/30 passed (52.7 seconds).
- Additional late-action error RED: a previous episode's failed poll still appeared through the new episode's form alert. Error and pending rendering now use the same invocation scope as success callbacks. Targeted result/error cases: 2/2 passed; fresh lint/typecheck passed.
- Paired compiled gateway/scheduler browser: 1/1 passed (37.3 seconds), including real Socket.IO off-air/live/turnover, decoded PCM playback joining presence, pause returning listeners to zero, and 35 healthy seconds without any additional manifest or controls HTTP read. Screenshot `evidence/paired.png` visually inspected. An earlier harness run failed the read baseline while sources/builds were changing; the isolated final run above passed. A stopped local harness initially returned ECONNREFUSED and was restarted before the accepted run.
- Final optimized production build after the late-action error guard passed. Unit suite remains 425 passing / 53 files; the subsequent changes were verified by the touched browser cases, fresh typecheck/lint and final build.
- Coordinator independently captured actual-stack A→B RED (Bob UI chat persisted Alice) and confirmed repaired author Bob, both sessions valid, and uninterrupted audio. Its full strict-guard report and combined-cache run are recorded in the coordinator's evidence, not claimed as this branch's mocked coverage.

Follow-up scope authorized by coordinator: remove the remaining private-history 10-second interval with owner-safe quiet invalidation and bounded disconnected/error recovery. This was discovered during final campus-budget reconciliation and is a separate commit after the evidence above.

Private-history follow-up RED/GREEN:

- Original healthy-minute test made five reads where one initial read was expected. After removing the interval and using quiet invalidation, it stays at the settled initial count and renders CLOSED without a receipt/toast.
- A connected socket without private admission initially stopped all recovery (two reads remained two); repaired recovery continues with bounded jitter until the backend's matching private hint arrives, then becomes quiet. A reconnect discards that proof and resumes bounded recovery until readmitted.
- A private hint arriving before the session/owner view mounted was lost (an extra HTTP recovery read appeared). Per-connection admission caching now retains that proof without retaining it across disconnects/identity rotation.
- New targeted browser suite: 5/5 passed, including failed HTTP read recovery and an old A response settling after B signs in. Fresh touched lint/typecheck and socket unit suite 6/6 passed. Final project checks are appended after completion.
- Healthy turnover RED exposed per-episode readiness losing valid user-room proof (seven reads instead of five); a per-connection WeakSet fixes it. OFF_AIR initial `episodeId:null` admission before the owner loads also has a RED/GREEN regression. Null refreshes the currently scoped history, while string action hints remain episode-filtered.
- Final private-history suite after the null contract: 5/5 passed (9.7 seconds), including reconnect proof reset. Final fresh touched lint/typecheck and optimized production build passed. The project-wide `pnpm test` rerun after adding private history passed all 425 tests / 53 files, zero lint errors and the same six unrelated baseline warnings.
