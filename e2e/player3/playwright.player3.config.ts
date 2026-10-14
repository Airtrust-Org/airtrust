import { defineConfig, devices } from '@playwright/test';

/**
 * Front D acceptance only: NEVER included in generic CI or a production run.
 * Both browsers require separate disposable staging enrollments and credentials.
 * Execution is explicitly opt-in (see docs/lms/PLAYER3_FRONT_D_HOMOLOGATION.md).
 */
export default defineConfig({
  testDir: './e2e/player3',
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
    storageState: process.env.PLAYER3_QA_STORAGE_STATE || undefined,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
