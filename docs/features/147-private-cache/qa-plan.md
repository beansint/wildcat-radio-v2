# Private cache regression plan

- Real QueryClient behavior: private keys excluded from transfer, safe public timestamps retained, old requests canceled and stale callback writes confined to the retired client.
- Browser golden: load profile/consent/standing, sign out and sign in as another account without reload; old data disappears and original audio node continues playing.
- Browser edges: sibling-tab login/logout, fresh and stale old cache with new-account503, late old response, unsaved private form/selection and delayed private download.
- Existing listener recovery flows, frontend unit suite, types, lint and production build remain passing.

Browser tests use a real Next page and Better Auth/QueryClient clients with local HTTP/media fixtures; they are browser-contract evidence, not a deployed API test. Golden audio uses a real decoded local WAV. Paired backend authorization has independent local PostgreSQL/HTTP integration evidence. No production account, email or provider actions.

RED and final GREEN counts/commands are recorded in [qa.md](./qa.md).

## Combined identity acceptance

Run `e2e/production-blockers-combined.spec.ts` against the actual local API with backend #209 and a disposable database, using the standard explicit Playwright loopback variables. The API's stream media origin must be loopback, allowed by the frontend's `NEXT_PUBLIC_MEDIA_HOST`, and separate from the API/frontend origin. `ffmpeg` (or `FFMPEG_EXECUTABLE`) generates temporary AAC/HLS; only the synthetic station's media prefix is intercepted. HTTP/auth/Socket.IO/PostgreSQL remain real.

Sign Alice in, start audible playback, sign Bob in through a sibling tab while Alice's independent session remains valid, and publish from the original tab. Assert PostgreSQL records Bob as author and the original audio node keeps playing. Also erase a synthetic account through the UI, verify the persisted tombstone and revoked reset/session/credential records, and reject its previously issued reset token. Cleanup is scoped to fixture IDs.
