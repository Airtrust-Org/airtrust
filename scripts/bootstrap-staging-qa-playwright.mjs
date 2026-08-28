#!/usr/bin/env node
/**
 * Creates a temporary Playwright storageState for the canonical, already
 * provisioned staging QA identity.
 *
 * Canonical contract (see .github/workflows/provision-staging-standard-identity.yml):
 *   - identity: qa-agent@staging.airtrust.invalid, provisioned/rotated by that
 *     workflow; the legacy smoke.staging.20260701@airtrust.invalid login is
 *     retired and MUST NOT be used here;
 *   - password: STAGING_SMOKE_PASSWORD, supplied by the sanctioned environment
 *     (GitHub Environment `staging`). This script never generates a random
 *     password and never seeds the D1 database;
 *   - Pages alias: https://staging.airtrust.pages.dev (the deploy-staging
 *     official alias). The old https://airtrust-staging.pages.dev alias is
 *     stale and MUST NOT be used here.
 *
 * It never uses a browser password form, production credentials, SQL, or
 * fabricated tokens, and never prints the password or any token.
 */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import {
  assert,
  assertAllowedStagingBaseUrl,
  decodeJwtPayload,
  extractAccessToken,
  extractRefreshToken,
} from './smoke-auth-common.mjs';

// Resolve Playwright from the checkout being operated, not from a transient
// script path (which also keeps isolated worktrees usable after npm ci).
const require = createRequire(resolve(process.cwd(), 'package.json'));
const { chromium, request } = require('playwright');

const STAGING_API_URL = 'https://airtrust-api-staging.airtrust.workers.dev';
const STAGING_PAGES_URL = 'https://staging.airtrust.pages.dev';
const LEGACY_STAGING_PAGES_URL = 'https://airtrust-staging.pages.dev';
const QA_EMAIL = 'qa-agent@staging.airtrust.invalid';
const LEGACY_QA_EMAIL = 'smoke.staging.20260701@airtrust.invalid';
const QA_EMPRESA_ID = 999002;

// Guard against a regression that reintroduces the retired identity/alias.
assert(QA_EMAIL !== LEGACY_QA_EMAIL, 'canonical QA identity must not equal the retired one');
assert(
  STAGING_PAGES_URL !== LEGACY_STAGING_PAGES_URL,
  'canonical Pages alias must not equal the stale one',
);

function readOutputPath() {
  const args = process.argv.slice(2);
  const index = args.indexOf('--output');
  if (index < 0 || !args[index + 1] || args.length !== 2) {
    throw new Error('Uso: node scripts/bootstrap-staging-qa-playwright.mjs --output /tmp/airtrust-staging-qa-state.json');
  }
  const output = resolve(args[index + 1]);
  const temporaryRoots = [resolve(tmpdir()), resolve('/tmp')];
  const isTemporary = temporaryRoots.some((root) => {
    const pathFromRoot = relative(root, output);
    return pathFromRoot && !pathFromRoot.startsWith('..');
  });
  assert(isAbsolute(output) && isTemporary, 'output deve ficar em diretório temporário');
  assert(output.endsWith('.json'), 'output deve terminar em .json');
  return output;
}

function readCentralPassword() {
  const password = process.env.STAGING_SMOKE_PASSWORD;
  if (typeof password !== 'string' || password.trim().length === 0) {
    // Report only the absence — never the value.
    throw new Error(
      'STAGING_QA_CENTRAL_CREDENTIALS_REQUIRED: STAGING_SMOKE_PASSWORD ausente. ' +
        'Provisione a identidade canônica pelo workflow ' +
        'provision-staging-standard-identity.yml e rode este bootstrap no ambiente ' +
        'sancionado (GitHub Environment `staging`), nunca no shell local sem credenciais.',
    );
  }
  return password;
}

async function main() {
  const output = readOutputPath();
  const apiBase = assertAllowedStagingBaseUrl(process.env.STAGING_API_BASE_URL || STAGING_API_URL);
  const password = readCentralPassword();

  const api = await request.newContext({ baseURL: apiBase, extraHTTPHeaders: { Accept: 'application/json' } });
  try {
    const login = await api.post('/api/auth/login', { data: { email: QA_EMAIL, senha: password } });
    assert(login.status() === 200, `login staging retornou ${login.status()}`);
    const loginPayload = await login.json();
    assert(loginPayload?.success === true, 'login staging sem success=true');
    const accessToken = extractAccessToken(loginPayload);
    const refreshToken = extractRefreshToken(loginPayload);
    const claims = decodeJwtPayload(accessToken);
    assert(String(claims?.email || '').toLowerCase() === QA_EMAIL, 'identidade QA divergente');
    assert(
      String(claims?.email || '').toLowerCase() !== LEGACY_QA_EMAIL,
      'login retornou a identidade QA legada aposentada',
    );
    assert(Number(claims?.empresa_id) === QA_EMPRESA_ID, 'tenant QA divergente');
    assert(['admin', 'administrador'].includes(String(claims?.role || '').toLowerCase()), 'RBAC QA sem administracao');

    const headers = { Authorization: `Bearer ${accessToken}` };
    const me = await api.get('/api/auth/me', { headers });
    assert(me.status() === 200, `auth/me retornou ${me.status()}`);
    const mePayload = await me.json();
    assert(String(mePayload?.data?.email || '').toLowerCase() === QA_EMAIL, 'auth/me QA divergente');
    const courses = await api.get('/api/lms/cursos?limit=5', { headers });
    assert(courses.status() === 200, `LMS cursos retornou ${courses.status()}`);

    const state = {
      cookies: await api.storageState().then((value) => value.cookies),
      origins: [
        {
          origin: STAGING_PAGES_URL,
          localStorage: [
            { name: 'airtrust_persist_login', value: '1' },
            { name: 'airtrust_token', value: accessToken },
            { name: 'airtrust_refresh_token', value: refreshToken },
            { name: 'airtrust_user', value: JSON.stringify(loginPayload.data.user || mePayload.data) },
          ],
        },
      ],
    };
    mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
    writeFileSync(output, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });
    chmodSync(output, 0o600);

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ storageState: output });
      const page = await context.newPage();
      await page.goto(`${STAGING_PAGES_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      assert(!new URL(page.url()).pathname.startsWith('/login'), 'storageState redirecionou para login');
      await context.close();
    } finally {
      await browser.close();
    }
  } finally {
    await api.dispose();
  }

  process.stdout.write(`STAGING_QA_PLAYWRIGHT_BOOTSTRAP_OK output=${output}\n`);
}

main().catch((error) => {
  process.stderr.write(`STAGING_QA_PLAYWRIGHT_BOOTSTRAP_FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
