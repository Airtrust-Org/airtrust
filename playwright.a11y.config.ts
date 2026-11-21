import { defineConfig, devices } from '@playwright/test';

import { resolveE2EBaseUrl } from './e2e/config/resolve-base-url';

/** Config enxuta para auditoria axe das rotas públicas (sem projeto de autenticação). */
export default defineConfig({
  testDir: './e2e/a11y',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: resolveE2EBaseUrl(), trace: 'on-first-retry' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});
