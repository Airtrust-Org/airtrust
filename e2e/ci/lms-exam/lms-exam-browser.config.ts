import { defineConfig, devices } from '@playwright/test';

/**
 * E2E de browser SINTETICO do modulo de provas LMS (Chromium + WebKit).
 * Frontend real (build + vite preview) contra API local sintetica (run-server.mjs):
 * rotas Hono reais sobre SQLite em memoria; login/R2/PDF simulados. Sem Cloudflare remoto.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /lms-exam-browser\.spec\.ts$/,
  forbidOnly: Boolean(process.env.CI),
  timeout: 120_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: 'node e2e/ci/lms-exam/run-server.mjs',
      url: 'http://127.0.0.1:8787/__test/evidence',
      cwd: '../../..',
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command:
        'VITE_API_URL=http://127.0.0.1:8787 npm run build && npx vite preview --host 127.0.0.1 --port 3000 --strictPort',
      url: 'http://127.0.0.1:3000/login',
      cwd: '../../..',
      reuseExistingServer: false,
      timeout: 240_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
