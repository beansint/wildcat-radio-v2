import { defineConfig, devices } from '@playwright/test';

// API and media requests are intercepted with local fixtures; no database/backend.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['private-cache.spec.ts', 'live-path-listener.spec.ts'],
  timeout: 60_000,
  workers: 1,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:3221', headless: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
