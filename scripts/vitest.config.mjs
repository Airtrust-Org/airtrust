// Separate vitest config for scripts/__tests__ (Node-environment guard/tooling
// tests) — mirrors worker-airtrust/vitest.config.ts, which is likewise a
// dedicated config for a test domain outside the frontend `src/**` glob
// covered by the root vitest.config.ts. Kept isolated so it never affects
// the frontend suite's include/coverage rules.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.mjs'],
    root: new URL('.', import.meta.url).pathname,
  },
});
