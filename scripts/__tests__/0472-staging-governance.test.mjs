import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const MIGRATION_NAME = '0472_frms_operational_readiness.sql';
const VALIDATOR = 'scripts/staging/validate-0472-postconditions.sh';

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('0472 is present in the staging apply allowlist (apply-approved-migrations.sh)', () => {
  const script = read('scripts/staging/apply-approved-migrations.sh');
  assert.match(script, new RegExp(`APPROVED_MIGRATIONS=\\([^)]*"${MIGRATION_NAME}"[^)]*\\)`));
});

test('RELEASE_PREFLIGHT_SCOPE includes 0472 in scope', () => {
  const script = read('scripts/staging/apply-approved-migrations.sh');
  assert.match(script, /RELEASE_PREFLIGHT_SCOPE="[^"]*,0470,0472,0475,0476,0481,0482"/);
});

test('0472 routes through the recovery-point runner, same as 0467-0470', () => {
  const script = read('scripts/staging/apply-approved-migrations.sh');
  const specialCaseBlock = script.slice(script.indexOf('if [[ "$migration_basename"'));
  assert.match(specialCaseBlock, /0472_frms_operational_readiness\.sql/);
});

test('0472 is present in the recovery-point allowlist and postcondition dispatch', () => {
  const script = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
  assert.match(script, new RegExp(`"${MIGRATION_NAME}"`));
  assert.match(
    script,
    /0472_frms_operational_readiness\.sql\)\s*\n\s*bash scripts\/staging\/validate-0472-postconditions\.sh/,
  );
});

test('deploy-staging.yml ledger preflight scope includes 0472', () => {
  const workflow = read('.github/workflows/deploy-staging.yml');
  assert.match(workflow, /--scope=0467,0468,0469,0470,0472,0475,0476/);
});

test('validate-0472-postconditions.sh exists, targets only staging, and performs zero writes', () => {
  const script = read(VALIDATOR);
  assert.match(script, /ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"/);
  assert.match(script, /ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"/);
  assert.match(script, /BLOCKED_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"/);
  assert.doesNotMatch(script, /\b(INSERT|UPDATE|DELETE)\b/i);
  execFileSync('bash', ['-n', path.join(ROOT, VALIDATOR)]);
});

test('validate-0472-postconditions.sh refuses a non-staging --target', () => {
  const scriptPath = path.join(ROOT, VALIDATOR);
  assert.throws(() =>
    execFileSync('bash', [scriptPath, '--target=airtrust-db'], { stdio: 'pipe' }),
  );
});

test('validate-0472-postconditions.sh asserts both readiness tables, indexes and CHECK domains', () => {
  const script = read(VALIDATOR);
  assert.match(script, /frms_readiness_assessment/);
  assert.match(script, /frms_readiness_vigilance_trial/);
  for (const idx of [
    'idx_frms_readiness_checkin',
    'idx_frms_readiness_person_day',
    'idx_frms_readiness_baseline',
    'idx_frms_readiness_classification',
    'idx_frms_readiness_trial_sequence',
    'idx_frms_readiness_trial_person',
  ]) {
    assert.match(script, new RegExp(idx));
  }
  assert.match(script, /baseline_building/);
  assert.match(script, /operational_review/);
  assert.match(script, /false_start/);
  assert.match(script, /empresa_id/);
});

test('the 0472 migration file itself is unchanged additive DDL for the two readiness tables', () => {
  const sql = read(`worker-airtrust/migrations/${MIGRATION_NAME}`);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS frms_readiness_assessment/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS frms_readiness_vigilance_trial/);
  assert.doesNotMatch(sql, /\b(DROP|ALTER)\s+TABLE\b/i);
});
