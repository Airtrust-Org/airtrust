import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config da homologação de checks individuais de Simuladores (Frente 7, issue #1548).
 *
 * Executado SOMENTE a partir da `main` confiável pelo workflow
 * .github/workflows/staging-simulator-individual-check-qa.yml, sob o lock
 * `airtrust-staging-mutations-and-scorm-qa`. Produção é rejeitada de forma fail-closed.
 */
const PRODUCTION_HOSTS = [
  /(^|\.)airtrust\.online$/i,
  /^airtrust-api\.airtrust\.workers\.dev$/i,
  /^airtrust-api-production\.airtrust\.workers\.dev$/i,
  /^airtrust\.pages\.dev$/i,
];
const STAGING_FRONTEND_HOSTS = new Set(['staging.airtrust.pages.dev']);

function frontend(): string {
  const raw = (process.env.STAGING_FRONTEND_BASE_URL || 'https://staging.airtrust.pages.dev').trim();
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('STAGING_FRONTEND_URL_INVALID');
  const host = url.hostname.toLowerCase();
  if (PRODUCTION_HOSTS.some((p) => p.test(host))) throw new Error(`PRODUCTION_TARGET_REJECTED:${host}`);
  if (!STAGING_FRONTEND_HOSTS.has(host)) throw new Error(`NON_STAGING_TARGET_REJECTED:${host}`);
  return url.toString().replace(/\/$/, '');
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: './simuladores',
  testMatch: /individual-check-homologation\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  reporter: [
    ['list'],
    ['json', { outputFile: path.resolve(__dirname, '../test-results/simulator-individual-check/results.json') }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: frontend(),
    // Sem trace/screenshot/vídeo: evita vazar credenciais ou PII em artefatos.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
});
