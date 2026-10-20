# Local Playwright validation

Use a dedicated disposable PostgreSQL database for this suite. Fixtures can close the station's current episode and replace global settings. The API and Playwright must use the same database. Never reuse a shared development or production database.

Set these variables in every terminal before starting a command. This PowerShell example uses a local PostgreSQL account you provision yourself; replace `TEST_USER` and the local port as needed. On other platforms, set the same variables with `export NAME=value`.

```powershell
$env:DATABASE_URL='postgresql://TEST_USER@127.0.0.1:5432/wildcat_browser_test'
$env:PLAYWRIGHT_DATABASE_NAME='wildcat_browser_test'
$env:PLAYWRIGHT_API_URL='http://localhost:3010'
$env:PLAYWRIGHT_BASE_URL='http://localhost:3011'
$env:NEXT_PUBLIC_API_URL='http://localhost:3010'
$env:NEXT_PUBLIC_SITE_URL='http://localhost:3011'
$env:BETTER_AUTH_URL='http://localhost:3010'
$env:BETTER_AUTH_SECRET='synthetic-local-e2e-secret-at-least-32-characters'
$env:CORS_ORIGINS='http://localhost:3011'
$env:STATION_DEVICE_TOKEN='dev-studio-token-change-me'
$env:WC_DEVICE_ID='e2e-browser-device-3011'
$env:STATION_UTC_OFFSET_MINUTES='480'
$env:NEXT_PUBLIC_STATION_UTC_OFFSET_MINUTES='480'
$env:SKIP_R2_E2E='0'
$env:R2_ENDPOINT='http://127.0.0.1:55990'
$env:R2_BUCKET='wildcat-browser-e2e'
$env:R2_ACCESS_KEY_ID='synthetic-local-only'
$env:R2_SECRET_ACCESS_KEY='synthetic-local-only'
$env:STREAM_PUBLIC_URL='http://127.0.0.1:55991'
$env:PLAYWRIGHT_LOCAL_SERVICES_URL='http://127.0.0.1:55991'
$env:NEXT_PUBLIC_MEDIA_HOST='127.0.0.1:55991'
$env:NEXT_PUBLIC_UPLOAD_HOST='127.0.0.1:55990'
$env:PLAYWRIGHT_LOCAL_SERVICES_DIR='D:/Workplace/wildcat-radio-v2-workspace/.agent/local-browser-services'
$env:FFMPEG_EXECUTABLE='C:/Program Files/ffmpeg/ffmpeg/bin/ffmpeg.exe'
$env:RESEND_API_KEY=''
$env:AUTH_EMAIL_FROM=''
$env:CAMPUS_IDP_ENABLED='false'
$env:ALLOW_REMOTE_SEED='false'
$env:NEXT_TELEMETRY_DISABLED='1'
```

Leave `PLAYWRIGHT_API_BASE_URL` unset, or set it to exactly `PLAYWRIGHT_API_URL`. If `SHOW_TRANSITIONS_DATABASE_URL` is set, it must equal `DATABASE_URL`. Schedule/transition fixtures require their relative slots to fit inside one station day; a separate run can use the supported station-offset setting consistently across API, frontend build, and fixtures to exercise those cases outside the Manila same-day window. Such a run does not certify Manila midnight boundaries. SQL fixtures use `psql` from `PATH`, or the executable named by `PSQL_EXECUTABLE` (useful for Windows installations).

Unset inherited `PGHOSTADDR`, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGSERVICE`, `PGSERVICEFILE`, and `PGSYSCONFDIR`. The runner rejects these independent libpq targets/services before collection, and fixture subprocesses additionally remove all inherited `PG*` settings. Specify the intended local connection in `DATABASE_URL`.

Create the named empty database using your local PostgreSQL administration tools. Do not drop or reset an existing database merely because its name matches this example. From the backend repository, prepare and start the API:

```powershell
$env:NODE_ENV='test'
$env:LOCAL_REALSTACK_SCHEDULES='1'
pnpm --filter @wildcat/db exec prisma migrate deploy
pnpm --filter @wildcat/db seed
pnpm --filter @wildcat/api build
$env:PORT='3010'
pnpm --filter @wildcat/api exec node dist/main.js
```

`NODE_ENV=test` relaxes test rate budgets. The synthetic seed accounts use a published password and must stay local. Email settings above disable delivery. Start the [local storage and real HLS service](local-storage-and-hls.md) with the same explicit settings before Playwright: the storage/upload and live-playback cases now require it and fail when absent. The service uses synthetic local credentials and never an AWS profile. Its local S3 protocol coverage does not certify the production Cloudflare R2 deployment.

`LOCAL_REALSTACK_SCHEDULES=1` is required in the **API server** terminal for full
broadcast acceptance. It runs the real hype clock, minute sampler, process
observation, summary recovery and retention scheduler. Ordinary Jest/integration
tests leave it unset and invoke job cores directly. The opt-in refuses non-loopback
or non-test database names in test mode; it does not change production scheduling.
Test authentication rate budgets remain inflated, so these browser runs are not
evidence of production throttling thresholds. The dedicated boundary tests own that
evidence. Do not add synthetic socket ticks to make a quiet-decay scenario pass.

The public-read rate-boundary case launches a separate loopback test process using the compiled backend public controller and production throttle policy. Keep the backend build step above: removing the route's throttle or guard must make that case fail. Its read payload is stubbed; other public-content cases retain the database-backed API checks.

From the frontend repository in another terminal with the same common variables:

Keep the API running during the frontend build. Confirm `/api/legal/privacy` and `/api/legal/tos` return 200 first: legal pages prerender with a five-minute revalidation window, so building while the API is unavailable can cache the unavailable-document state. Rebuild with the API ready before running the browser suite in that situation.

```powershell
$env:NODE_ENV='production'
pnpm build
pnpm exec next start -p 3011
```

Use `pnpm exec next start` directly. The `pnpm start` and `pnpm dev` wrapper scripts source `.env.local` and can replace explicit exports. Do not source shared backend or frontend environment files into any validation process. Next and backend dotenv loading preserve explicit process variables.

In a third frontend terminal with the common variables, run the full suite:

```powershell
$env:NODE_ENV='test'
pnpm test
pnpm test:coverage
pnpm test:e2e
```

Run unit/coverage commands with the production-default media/upload-host variables
unset; the CSP unit case asserts the default production host. Restore the common
local-media variables before the frontend build and Playwright. For a release
candidate, freeze product/test source, run the complete Playwright suite twice
consecutively with retries off, and record each JSON result plus owned-fixture
cleanup. A focused rerun does not substitute for a second complete pass.

Playwright validates the explicit local origins and isolated database name before collecting any specs. All 49 spec files run serially. Reports must distinguish failures, explicit skips, and tests blocked by serial setup failures. The local encoder cases decode real AAC/HLS media and check advancing playback time; they do not prove a production booth/network broadcast. Stop only API, frontend and local-service processes you started when validation ends, using the local-service shutdown endpoint so its encoder also stops.
