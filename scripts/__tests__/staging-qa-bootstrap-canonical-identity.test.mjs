import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const SCRIPT = 'scripts/bootstrap-staging-qa-playwright.mjs';
const source = readFileSync(path.join(ROOT, SCRIPT), 'utf8');

// Executable lines only — drop the file docstring and comments, which legitimately
// name the retired identity/alias to explain why they must not be used.
const codeLines = source
  .split('\n')
  .filter((line) => {
    const t = line.trimStart();
    return t.length > 0 && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('//') && !t.startsWith('#');
  });

test('uses the canonical QA identity and never the retired one', () => {
  assert.match(source, /const QA_EMAIL = 'qa-agent@staging\.airtrust\.invalid'/);
  // the retired address may only appear as a named LEGACY_ constant used for a guard
  const bareLegacyUses = codeLines
    .filter((line) => line.includes('smoke.staging.20260701@airtrust.invalid'))
    .filter((line) => !/LEGACY_QA_EMAIL/.test(line));
  assert.deepEqual(bareLegacyUses, []);
});

test('targets the canonical staging Pages alias, not the stale one', () => {
  assert.match(source, /const STAGING_PAGES_URL = 'https:\/\/staging\.airtrust\.pages\.dev'/);
  const bareStaleUses = codeLines
    .filter((line) => line.includes('airtrust-staging.pages.dev'))
    .filter((line) => !/LEGACY_STAGING_PAGES_URL/.test(line));
  assert.deepEqual(bareStaleUses, []);
});

test('never generates a random password', () => {
  assert.doesNotMatch(source, /randomBytes|randomUUID|generatePassword/);
  assert.doesNotMatch(source, /from 'node:crypto'/);
});

test('never seeds the staging D1 from the bootstrap', () => {
  assert.doesNotMatch(source, /seed-staging-smoke-user/);
  assert.doesNotMatch(source, /spawnSync|execSync|execFileSync/);
  assert.doesNotMatch(source, /wrangler\s+d1|d1 execute/i);
});

test('requires the sanctioned central credential and fails immediately without it', () => {
  assert.match(source, /process\.env\.STAGING_SMOKE_PASSWORD/);
  assert.match(source, /STAGING_QA_CENTRAL_CREDENTIALS_REQUIRED/);

  let stderr = '';
  try {
    execFileSync(process.execPath, [SCRIPT, '--output', '/tmp/airtrust-qa-bootstrap-test.json'], {
      cwd: ROOT,
      env: { ...process.env, STAGING_SMOKE_PASSWORD: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.fail('bootstrap should have exited non-zero without STAGING_SMOKE_PASSWORD');
  } catch (error) {
    stderr = String(error.stderr || '') + String(error.stdout || '');
  }
  assert.match(stderr, /STAGING_QA_CENTRAL_CREDENTIALS_REQUIRED/);
  // it must fail before doing any work (no login attempt, no browser launch)
  assert.doesNotMatch(stderr, /login staging retornou|auth\/me retornou|storageState redirecionou|chromium/i);
  assert.doesNotMatch(stderr, /STAGING_QA_PLAYWRIGHT_BOOTSTRAP_OK/);
});

test('never prints the password or a token', () => {
  const printers = source
    .split('\n')
    .filter((line) => /console\.(log|info|error|warn|debug)|process\.stdout\.write|process\.stderr\.write/.test(line));
  for (const line of printers) {
    assert.doesNotMatch(line, /\bpassword\b/i);
    assert.doesNotMatch(line, /accessToken|refreshToken|\btoken\b/i);
    assert.doesNotMatch(line, /STAGING_SMOKE_PASSWORD/);
  }
});

test('still produces a temporary storageState and validates tenant/RBAC on success', () => {
  assert.match(source, /--output/);
  assert.match(source, /output deve ficar em diretório temporário/);
  assert.match(source, /Number\(claims\?\.empresa_id\) === QA_EMPRESA_ID/);
  assert.match(source, /'admin', 'administrador'/);
  assert.match(source, /\/api\/auth\/me/);
  assert.match(source, /STAGING_QA_PLAYWRIGHT_BOOTSTRAP_OK/);
});
