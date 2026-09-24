import { defineConfig, devices } from '@playwright/test';

// Spike #4 stream-playback e2e. Requires the spike stack running (see backend
// docs/features/004-streaming-spike/qa-plan.md): ffmpeg + serve-hls.mjs(:8888) +
// backend(:3001, STREAM_PUBLIC_URL=...:8888) + this app (:3000).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // Every spec drives the SAME live backend and Neon dev database, and some of
  // the invariants under test are global rather than per-row — the announcement
  // pin cap ("at most N pinned station-wide") is the clearest example. Running
  // spec files concurrently makes those tests fight each other over shared
  // state and fail on a correct implementation, so the suite is serial.
  workers: 1,
  // FE#55 — CI guards. `forbidOnly` fails the run if a stray `test.only` is
  // committed (which would silently green the suite by skipping everything
  // else); one retry absorbs genuine flake against the shared live stack
  // without masking a real failure locally, where retries stay off.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // #72 — without an explicit reporter, CI would default to `dot` and the
  // failed-run `playwright-report/` artifact upload in ci.yml would have
  // nothing to upload. `github` annotations render failures inline on the PR;
  // the HTML report is always written but never auto-opened.
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    // 3011 is this project's frontend port (backend runs on 3010) — the old
    // 3000 default predates that split and silently sent every spec using a
    // relative `goto()` at a server that isn't running.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3011',
    headless: true,
    // audio autoplay after a click is allowed; this guarantees it in headless CI too.
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
