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
