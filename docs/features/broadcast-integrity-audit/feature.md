# Broadcast interaction integrity audit

2026-10-20. Website baseline: `origin/dev` at `6b774a1c4c32481f0d84edac5e3ff318b978baac`; no `dev-release` exists. Existing feature branch and untracked data were preserved. Local audit branch: `chore/broadcast-integrity-audit`.

No product code changed. The complete cross-repository report, aggregate database checks, QA evidence and proposed repair design are in sibling repository `wildcat-radio-v2-backend` under `docs/features/broadcast-integrity-audit/` and `docs/superpowers/specs/2026-10-20-broadcast-integrity-design.md`.

Confirmed website findings:

- `src/app/(station)/studio/page.tsx:138`: pseudo-random hype bar heights remain nonzero with zero reactions. The count is real, but the bars do not visualize measured activity.
- Studio recovery does not hydrate hype, ignores newer known poll states and retains hidden chat/old pins. There is no connected `chat:hidden` handler.
- Listener snapshot recovery preserves pre-disconnect state over current server state.
- `src/lib/realtime/use-stream-presence.ts:123` and `:148` never send the anonymous identifier expected by backend analytics. All 25 inspected live listening rows use socket fallback identity, inflating reach on reconnect/new tabs.
- Staff retention selection uses UTC midnight against Manila API boundaries, depends on public newest-ten show discovery, and excludes unscheduled/archived-show history.
- Timed pinned topics do not expire while continuously connected; the activity curve and public-voter poll copy overstate current behavior.

Focused frontend units: **11 files, 90 tests passed**. Typecheck passed. ESLint exited zero with **6 existing warnings**. These checks do not establish production readiness; the cross-repository integration baseline remains failing and high-priority database privacy/recovery findings remain open.

Proposed repairs preserve the current brand surfaces and UI primitives. No individualized audience reporting or public voter identity disclosure is proposed.
