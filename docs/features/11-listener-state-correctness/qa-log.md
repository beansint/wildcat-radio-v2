# Truthful listener state QA log (Issue #64)

## Coverage matrix

| Scenario | Covered? | Evidence | Notes |
|---|---|---|---|
| Two socket owners, release order | Yes | `socket.spec.ts` | Final release disconnects once |
| Concurrent socket acquisition | Yes | `socket.spec.ts` | One in-flight creation |
| Episode state starts fully empty | Yes | `engagement-state.spec.ts` | Fresh collections per episode |
| Cancel/new play invalidates stale attempt | Yes | `play-attempt.spec.ts` | Pure generation contract |
| OFF_AIR has no fabricated metadata | Yes | `listener-state.spec.ts` | Chromium, clean console |
| API failure differs from OFF_AIR | Yes | `listener-state.spec.ts` | Expected manifest 503 only |
| Pending HLS cancellation never calls play | Yes | `listener-state.spec.ts` | Instrumented real media seam |
| Pause/resume retains engagement and one membership | Yes | `listener-state.spec.ts` | Real API and Socket.IO; one listener after resume |
| Reconnect rejoins once | Yes | `listener-state.spec.ts` | Forced offline/online; booth event received afterward |
| Episode A to B reset | Yes | `listener-state.spec.ts` | A chat clears before B chat arrives |
| Navigation while playing | Yes | `listener-state.spec.ts` | Same audio DOM instance survives `/listen` to `/shows` |
| Generated manifest client is typed | Yes | `pnpm api:refresh`, `pnpm typecheck` | Unsafe stream cast removed |
| Unit regression | Yes | `pnpm exec vitest run` | 230 of 230 passed |
| Production build | Yes | `NEXT_PUBLIC_API_URL=... pnpm build` | Next.js 16.2.9, 37 routes |
| Lint | Yes | `pnpm lint` | No errors; four pre-existing warnings |
| Full #64 browser file, twice | Yes | `listener-state.spec.ts` | 4 of 4 on both production-server runs; deterministic plus real local services |

## Bugs found and fixed

- Presence called a global disconnect while engagement retained handlers on the discarded socket.
- Initial reset keys reused the same sibling React key and produced console errors; keys are now
  surface-prefixed.
- Async HLS callbacks and media events could restore playing after cancellation.
- `/listen` fabricated DJ Mara, 142 listeners, Afternoon Vibes, Golden Hour, progress, and time.
- Duplicate sibling reset keys produced React console errors during the first browser run; each
  remounted surface now uses a prefixed key, and subsequent full runs were console-clean except the
  single expected 503 resource error in the API-failure scenario.
- Visual review found live poll and sign-in controls still rendered outside a live episode; both are
  now absent from OFF_AIR/unavailable screenshots.
- The live test exposed a session-dependent top-navigation hydration mismatch. The navigation now
  waits for hydration before rendering session actions, matching the existing engagement pattern.

## Runtime evidence

- Real local Nest API and Socket.IO on `127.0.0.1:3210`, Next.js on `127.0.0.1:3112`, disposable
  PostgreSQL `wildcat_73_e2e`, and a continuously refreshed publication heartbeat.
- Playwright screenshots were captured and visually inspected for OFF_AIR, unavailable, and
  cancelled-LIVE states under each test's output directory.

## External limits

- Mocked manifest/HLS browser checks do not prove deployed R2 playback.
- Physical Windows/BUTT/campus acceptance remains backend #77.
