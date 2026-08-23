# QA plan: Truthful listener state (Issue #64)

## Automated tiers

1. Unit: socket lease ownership/in-flight creation/idempotent release, play-attempt generations,
   empty episode state, existing presence transitions.
2. Integration: generated #73 manifest client compiles; hook consumers use leases; build and lint.
3. Browser: stub only the manifest/HLS network boundary for deterministic OFF_AIR, unavailable, and
   cancelled-HLS tests. Use runnable Socket.IO/API services for membership, reconnect, and turnover.

## Golden path

1. Serve LIVE episode A, play, join presence and engagement.
2. Pause and resume while engagement events continue.
3. Navigate away and back while the root player remains mounted.
- Assert one audio element, one transport, one presence membership, retained current-episode
  engagement, and clean console/network output.

## Edge paths

- Hold HLS manifest parsing, cancel, release it, and assert `audio.play()` was never called.
- Disconnect/reconnect the socket and assert both rooms rejoin once.
- Turn A into B and assert no A state appears before B events/hydration.
- Turn LIVE into OFF_AIR and assert audio stops and every live-only surface clears.
- Return manifest 503 and assert unavailable copy, not OFF_AIR or fabricated metadata.
- Render true OFF_AIR and assert no DJ, track, count, progress, timestamp, or on-air claim.

Run browser coverage twice. Record screenshots for OFF_AIR, unavailable, and LIVE/cancel states.
