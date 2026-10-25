# Private cache regression plan

- Real QueryClient behavior: private keys excluded from transfer, safe public timestamps retained, old requests canceled and stale callback writes confined to the retired client.
- Browser golden: load profile/consent/standing, sign out and sign in as another account without reload; old data disappears and original audio node continues playing.
- Browser edges: sibling-tab login/logout, fresh and stale old cache with new-account503, late old response, unsaved private form/selection and delayed private download.
- Existing listener recovery flows, frontend unit suite, types, lint and production build remain passing.

Browser tests use a real Next page and Better Auth/QueryClient clients with local HTTP/media fixtures; they are browser-contract evidence, not a deployed API test. Golden audio uses a real decoded local WAV. Paired backend authorization has independent local PostgreSQL/HTTP integration evidence. No production account, email or provider actions.

RED and final GREEN counts/commands are recorded in [qa.md](./qa.md).
