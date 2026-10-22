import { defineConfig, devices } from '@playwright/test';

/**
 * Front D acceptance only: NEVER included in generic CI or a production run.
 * Both browsers require separate disposable staging enrollments and credentials.
 * Execution is explicitly opt-in (see docs/lms/PLAYER3_FRONT_D_HOMOLOGATION.md).
 */
export default defineConfig({
  testDir: '.',
  testMatch: /player3-acceptance\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 15 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/player3-front-d.json' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'off', // Evidence is opt-in, synthetic data only.
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // The acceptance spec creates explicit browser-scoped authenticated contexts.
    // Do not implicitly reuse a single learner state across both browsers.
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
