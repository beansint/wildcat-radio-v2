import { defineConfig, devices } from '@playwright/test';

// Spike #4 stream-playback e2e. Requires the spike stack running (see backend
// docs/features/004-streaming-spike/qa-plan.md): ffmpeg + serve-hls.mjs(:8888) +
// backend(:3001, STREAM_PUBLIC_URL=...:8888) + this app (:3000).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    // audio autoplay after a click is allowed; this guarantees it in headless CI too.
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
