import { defineConfig, devices } from '@playwright/test';

/**
 * Dedicated Playwright config for the "Staging Frontend PR UI QA" workflow.
 *
 * This config is executed ONLY from trusted `main` by
 * .github/workflows/staging-frontend-pr-ui-qa.yml. It never runs code from the
 * PR under test. It targets the published staging *frontend* of an open PR
 * head SHA; the staging Worker may be on a different SHA (frontend-only QA).
 *
 * Production is fail-closed here regardless of env.
 */

const PRODUCTION_HOST_PATTERNS = [
  /(^|\.)airtrust\.online$/i,
  /^airtrust-api\.airtrust\.workers\.dev$/i,
  /^airtrust-api-production\.airtrust\.workers\.dev$/i,
  /^airtrust\.pages\.dev$/i,
];

// BLOCKER 10 — for this workflow staging means exactly staging.
const STAGING_HOST_ALLOWLIST = new Set(['staging.airtrust.pages.dev']);

function resolveFrontendBaseUrl(): string {
  const raw = (
    process.env.STAGING_FRONTEND_BASE_URL || 'https://staging.airtrust.pages.dev'
  ).trim();
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:') {
    throw new Error('STAGING_FRONTEND_BASE_URL must be https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('STAGING_FRONTEND_BASE_URL must not carry credentials');
  }
  const host = parsed.hostname.toLowerCase();
  if (PRODUCTION_HOST_PATTERNS.some((p) => p.test(host))) {
    throw new Error(`PRODUCTION_TARGET_REJECTED:${host}`);
  }
  if (!STAGING_HOST_ALLOWLIST.has(host)) {
    throw new Error(`NON_STAGING_TARGET_REJECTED:${host}`);
  }
  return parsed.toString().replace(/\/$/, '');
}

const AUTH_FILE = 'e2e/.auth/frontend-pr-ui-qa.json';

export default defineConfig({
  testDir: './frontend-pr-ui-qa',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/frontend-pr-ui-qa/results.json' }],
    ['list'],
  ],
  use: {
    baseURL: resolveFrontendBaseUrl(),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_FILE,
      },
      dependencies: ['setup'],
    },
  ],
});

export { AUTH_FILE };
