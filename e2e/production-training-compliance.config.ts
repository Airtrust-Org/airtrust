import { defineConfig, devices } from '@playwright/test';

const baseURL = 'https://airtrust.online';

export default defineConfig({
  testDir: './production-training-compliance',
  testMatch: /readonly\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/production-training-compliance/results.json' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
});
