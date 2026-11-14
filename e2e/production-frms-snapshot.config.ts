import { defineConfig, devices } from '@playwright/test';

/**
 * Explicitly selected production-only FRMS test configuration.
 * The default Playwright configuration excludes this spec entirely.
 * Even this configuration cannot send network traffic without the
 * separate E2E_ALLOW_PRODUCTION=true guard in the spec.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /production-frms-snapshot-readonly\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 150_000,
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      baseURL: 'https://airtrust.online',
      storageState: { cookies: [], origins: [] },
      trace: 'off',
      screenshot: 'off',
      video: 'off',
      actionTimeout: 20_000,
      navigationTimeout: 45_000,
    },
  }],
});
