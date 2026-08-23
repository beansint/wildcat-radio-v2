# Feature: Truthful listener state (Issue #64)

- **Branch:** `feature/64-listener-state`
- **Scope:** persistent player, `/listen`, shared Socket.IO ownership, episode state
- **Dependencies:** backend #73 publication-aware manifest; backend #74/frontend #65 hydration remains separate

## Acceptance criteria

- **AC-1:** Shared realtime transport has explicit reference-counted ownership. Releasing presence
  cannot disconnect engagement or Studio consumers.
- **AC-2:** Reconnect reattaches each active room exactly once without duplicate handlers.
- **AC-3:** Presence-derived status/counts clear on inactivity, disconnect, and episode change;
  socket status cannot override authoritative OFF_AIR or a different episode.
- **AC-4:** Chat, polls, selections, receipts, pin, hype, up-next, local form state, and visible
  mutation errors from episode A never render in episode B or OFF_AIR.
- **AC-5:** Every asynchronous HLS/native play continuation proves it still owns the current play
  attempt. Pause, newer play, and OFF_AIR invalidate older work.
- **AC-6:** API unavailable is distinct from OFF_AIR.
- **AC-7:** `/listen` and the global player render only authoritative manifest/presence data, with no
  sample DJ, track, listener count, progress, or live timestamp.
- **AC-8:** Browser coverage proves pause/resume, reconnect, navigation, turnover, OFF_AIR, API
  failure, and cancelled setup with clean console/network evidence.

## Decisions

- One lazy Socket.IO singleton remains. A small lease manager owns its lifecycle; no new realtime
  abstraction or second connection is introduced.
- Engagement data remains in the existing hook, keyed by episode id. #64 clears stale state but does
  not invent #74's late-join snapshot endpoint.
- Manifest availability is `loading | ready | unavailable`; broadcast status remains the existing
  `LIVE | STATION_ROTATION | OFF_AIR` union.
- Live radio has no meaningful progress or elapsed timestamp, so those prototype placeholders are
  removed rather than replaced.
