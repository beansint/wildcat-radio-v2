import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit tier only — pure TS helpers, no DOM, no network. Component and flow
// behaviour is covered by the Playwright suite in `e2e/` against real servers
// (see .agent/test-suites/fe-m5-public-content/README.md for the pyramid).
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
