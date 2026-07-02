// source_reference: validates D1 target guard, confirmation flag, and empresa soft-delete policy
// for scripts/seed-staging-smoke-user.mjs before any --apply is allowed.
// operational_decision: tests only invoke the script in dry-run mode or with invalid env vars;
// no remote D1, no staging write, no production access.
// dry_run_required: all tests run the seed script without --apply or with clearly fake/blocked targets.
// rollback_plan_required: no rollback needed — tests are read-only and create no persistent state.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_SCRIPT = resolve(__dirname, '..', 'seed-staging-smoke-user.mjs');

/**
 * Run the seed script with given env vars and optional args.
 * Returns { status, stdout, stderr }.
 */
function runSeed(envOverrides = {}, args = []) {
  const env = {
    ...process.env,
    STAGING_SMOKE_EMAIL: 'smoke.test@example.invalid',
    STAGING_SMOKE_PASSWORD: 'test-password-123',
    STAGING_SMOKE_EMPRESA_CODIGO: 'airtrust_smoke',
    STAGING_SMOKE_EMPRESA_NOME: 'AirTrust Smoke Tenant',
    STAGING_SMOKE_USER_NOME: 'Smoke Staging Admin',
    ...envOverrides,
  };

  const result = spawnSync('node', [SEED_SCRIPT, ...args], {
    env,
    encoding: 'utf8',
    timeout: 15000,
  });

  return {
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

// ─────────────────────────────────────────────────────────────
// D1 target allowlist
// ─────────────────────────────────────────────────────────────

test('D1 production name "airtrust-db" is blocked', () => {
  const { status, stderr } = runSeed({ STAGING_D1_NAME: 'airtrust-db' });
  assert.notEqual(status, 0, 'deveria falhar com codigo de saida != 0');
  assert.ok(stderr.includes('bloqueio'), `stderr deveria mencionar bloqueio: ${stderr}`);
  assert.ok(stderr.includes('airtrust-db'), `stderr deveria mencionar o nome: ${stderr}`);
});

test('D1 production name "airtrust-db-prod" is blocked', () => {
  const { status, stderr } = runSeed({ STAGING_D1_NAME: 'airtrust-db-prod' });
  assert.notEqual(status, 0);
  assert.ok(stderr.includes('bloqueio'));
});

test('D1 staging legacy name "airtrust-db-staging" is blocked', () => {
  const { status, stderr } = runSeed({ STAGING_D1_NAME: 'airtrust-db-staging' });
  assert.notEqual(status, 0);
  assert.ok(stderr.includes('bloqueio'));
});

test('D1 name containing "production" is blocked', () => {
  const { status, stderr } = runSeed({ STAGING_D1_NAME: 'my-production-db' });
  assert.notEqual(status, 0);
  assert.ok(stderr.includes('bloqueio') || stderr.includes('permitido'));
});

test('D1 name containing "prod" is blocked', () => {
  const { status, stderr } = runSeed({ STAGING_D1_NAME: 'some-prod-db' });
  assert.notEqual(status, 0);
  assert.ok(stderr.includes('bloqueio') || stderr.includes('permitido'));
});

test('empty D1 name defaults to allowlist target (safe behavior)', () => {
  // Quando STAGING_D1_NAME está vazio, o script usa o default seguro.
  // Isso é comportamento esperado: fallback para o staging reconstruído.
  const { status, stdout } = runSeed({ STAGING_D1_NAME: '' });
  assert.equal(status, 0, 'env vazio deve usar default e passar em dry-run');
  assert.ok(
    stdout.includes('airtrust-db-staging-baseline-20260701'),
    `stdout deveria conter o default: ${stdout}`,
  );
});

test('unknown D1 name is blocked', () => {
  const { status, stderr } = runSeed({ STAGING_D1_NAME: 'some-random-db' });
  assert.notEqual(status, 0);
  assert.ok(
    stderr.toLowerCase().includes('permitido'),
    `stderr deveria conter 'permitido': ${stderr}`,
  );
});

// ─────────────────────────────────────────────────────────────
// Confirmation flag
// ─────────────────────────────────────────────────────────────

test('correct D1 without --confirm-staging-baseline in dry-run passes', () => {
  const { status, stdout } = runSeed(
    { STAGING_D1_NAME: 'airtrust-db-staging-baseline-20260701' },
    // no --apply, no --confirm
  );
  assert.equal(status, 0, 'dry-run com D1 correto deveria passar');
  assert.ok(stdout.includes('SEED_READY'), `stdout deveria conter SEED_READY: ${stdout}`);
});

test('correct D1 with --apply but no confirmation fails', () => {
  // CONFIRM_STAGING_D1 explicitamente removido para evitar herança do terminal
  const { status, stderr } = runSeed(
    {
      STAGING_D1_NAME: 'airtrust-db-staging-baseline-20260701',
      CONFIRM_STAGING_D1: '',
    },
    ['--apply'],
  );
  assert.notEqual(status, 0, '--apply sem confirmacao deveria falhar');
  assert.ok(
    stderr.includes('confirm') || stderr.includes('confirma'),
    `stderr deveria pedir confirmacao: ${stderr}`,
  );
});

test('correct D1 with --apply and --confirm reaches env check (not D1 block)', () => {
  const { status, stderr } = runSeed(
    {
      STAGING_D1_NAME: 'airtrust-db-staging-baseline-20260701',
      STAGING_SMOKE_EMAIL: '',
    },
    ['--apply', '--confirm-staging-baseline'],
  );

  assert.notEqual(status, 0, 'apply com env ausente deve falhar');
  // O erro DEVE ser sobre env ausente, NÃO sobre D1 bloqueado
  assert.ok(
    stderr.includes('ausentes') || stderr.includes('Segredos'),
    `erro deveria ser sobre envs ausentes, nao D1: ${stderr}`,
  );
  assert.ok(
    !stderr.toLowerCase().includes('bloqueio'),
    `erro NÃO deveria mencionar bloqueio de D1: ${stderr}`,
  );
});

// ─────────────────────────────────────────────────────────────
// Empresa soft-delete guard
// ─────────────────────────────────────────────────────────────

test('empresa codigo sem "smoke" no nome falha', () => {
  const { status, stderr } = runSeed({
    STAGING_SMOKE_EMPRESA_CODIGO: 'real-empresa',
    STAGING_SMOKE_EMPRESA_NOME: 'Real Empresa Ltda',
  });
  assert.notEqual(status, 0, 'codigo sem smoke deveria falhar');
  assert.ok(
    stderr.includes('smoke') || stderr.includes('fixture'),
    `stderr deveria mencionar fixture smoke: ${stderr}`,
  );
});

// ─────────────────────────────────────────────────────────────
// Securanca: output nao deve conter token/senha
// ─────────────────────────────────────────────────────────────

test('stdout nao contem a senha em claro', () => {
  const { stdout } = runSeed({ STAGING_SMOKE_PASSWORD: 'my-secret-test-password' });
  assert.ok(!stdout.includes('my-secret-test-password'), 'stdout nao deve conter a senha em claro');
});

test('stderr nao contem a senha em claro (erro de env ausente)', () => {
  const { stderr } = runSeed({
    STAGING_SMOKE_EMAIL: '',
    STAGING_SMOKE_PASSWORD: 'another-secret-456',
  });
  assert.ok(!stderr.includes('another-secret-456'), 'stderr nao deve conter a senha em claro');
});
