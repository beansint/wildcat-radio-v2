# Local storage and HLS browser prerequisites

The announcement upload cases and real stream cases require the local services
below. They fail if these services are absent; they never skip because a studio
or remote bucket is unavailable. First follow `local-playwright.md` to provision
the isolated database, API, frontend, and common guarded environment.

From the workspace parent, create an isolated Python 3.11+ environment once:

```powershell
python -m venv .agent/local-browser-services-venv
.agent/local-browser-services-venv/Scripts/python.exe -m pip install --upgrade 'pip>=26.2.0' 'setuptools>=83.0.0'
.agent/local-browser-services-venv/Scripts/python.exe -m pip install -r wildcat-radio-v2/e2e/local-services-requirements.txt
```

Set these in the API, browser-test, and local-service environments **before
starting the API**. No AWS CLI/profile or real cloud credentials are used.

```powershell
$env:SKIP_R2_E2E='0'
$env:R2_ENDPOINT='http://127.0.0.1:55990'
$env:R2_BUCKET='wildcat-browser-e2e'
$env:R2_ACCESS_KEY_ID='synthetic-local-only'
$env:R2_SECRET_ACCESS_KEY='synthetic-local-only'
$env:STREAM_PUBLIC_URL='http://127.0.0.1:55991'
$env:PLAYWRIGHT_LOCAL_SERVICES_URL='http://127.0.0.1:55991'
$env:NEXT_PUBLIC_MEDIA_HOST='127.0.0.1:55991'
$env:NEXT_PUBLIC_UPLOAD_HOST='127.0.0.1:55990'
$env:PLAYWRIGHT_LOCAL_SERVICES_DIR=(Join-Path (Get-Location) '.agent/local-browser-services')
$env:FFMPEG_EXECUTABLE='C:/Program Files/ffmpeg/ffmpeg/bin/ffmpeg.exe'
.agent/local-browser-services-venv/Scripts/python.exe wildcat-radio-v2/e2e/local-services.py
```

Run the service in a separate terminal, or use `Start-Process -WindowStyle Hidden`
with redirected logs. The process prints its PID and its owned encoder PID. It
binds only `127.0.0.1`. Its output directory must be inside `.agent`; every launch
creates a new media subdirectory without deleting or reusing prior outputs.
Wait for `GET http://127.0.0.1:55991/__health` to return 200 with
`service=wildcat-local-browser-services-v1` and `ready=true` (about five seconds).

Rebuild the frontend after setting the two `NEXT_PUBLIC_*_HOST` values. They
configure the runtime image allowlist and exact CSP destinations. Only exact
loopback hosts use HTTP; all remote hosts continue to use HTTPS. Loopback image
delivery bypasses Next image optimization so its server-side local-IP protection
remains enabled. Run production-default security unit tests without overriding
these two host settings; the new configuration unit tests set them explicitly.

The fixture provides:

- A real Moto S3 protocol server with bucket CORS configured for the explicit
  local website origin. The API signs PUT URLs with the real AWS SDK; the browser
  sends JPEG bytes to S3; the API checks HeadObject before confirming a photo.
  Anonymous delivery reads the actual stored object, and tests compare its bytes
  with the browser upload and check the public image decoded successfully.
- A continuously running ffmpeg encoder generating 48 kHz AAC MPEG-TS segments
  and a sliding HLS playlist. The API's authenticated publisher lease supplies
  the station/generation URL prefix. The player fetches the real playlist and
  segments over HTTP and Chromium's audio currentTime must advance.
- Random, test-owned station credentials and roster rows; genuine API
  time-in, publisher-lease and heartbeat requests. The helper restores prior open
  episode status and stream health and removes its own station, attendance,
  episode, and listener rows after navigating browsers away.

From the frontend folder, the four formerly uncovered cases can be run with:

```powershell
pnpm exec playwright test e2e/mod-announcements.spec.ts e2e/stream-playback.spec.ts e2e/stream-socket-gating.spec.ts --grep 'ANN-C-05|ANN-E-06b|AC-3/AC-4|a socket connection opens'
```

The socket case also verifies the stronger sequence on `/`: a live broadcast
with no socket before play, then an actual WebSocket and decoded audio after
play. `/listen` may already connect its engagement room before audio starts.

After tests, verify the health response identifies your owned fixture and stop
it gracefully; this also terminates its ffmpeg child and S3 server:

```powershell
Invoke-WebRequest -Method Post -Uri 'http://127.0.0.1:55991/__shutdown' -Headers @{'X-Local-Fixture-Key'='synthetic-local-only'}
```

Moto verifies the application protocol flow, stored bytes, and browser CORS
flow. It does **not** certify Cloudflare R2's deployed bucket CORS, production
credentials, provider-specific behavior, or SigV4 signature enforcement. This
fixture writes no objects or resources to R2/AWS. HLS evidence verifies local
encoding and browser decoding, not a production Studio-to-CDN deployment.
