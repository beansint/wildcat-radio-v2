import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit tier only — pure TS helpers, no DOM, no network. Component and flow
// behaviour is covered by the Playwright suite in `e2e/` against real servers
// (see .agent/test-suites/fe-m5-public-content/README.md for the pyramid).
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    // Report-only for now (#72): no thresholds until the first baseline number
    // exists. Generated orval output is excluded — it is machine-written
    // (hand-edit-forbidden per eslint.config.mjs), so its numbers would drown
    // the hand-written signal.
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/lib/api/endpoints/**', 'src/lib/api/model/**'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
