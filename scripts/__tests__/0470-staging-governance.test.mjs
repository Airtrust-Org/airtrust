import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const MIGRATION_NAME = '0470_certificado_validacao_hash_index.sql';

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('0470 is present in the staging apply allowlist (apply-approved-migrations.sh)', () => {
  const script = read('scripts/staging/apply-approved-migrations.sh');
  assert.match(script, new RegExp(`APPROVED_MIGRATIONS=\\([^)]*"${MIGRATION_NAME}"[^)]*\\)`));
  assert.match(script, /RELEASE_PREFLIGHT_SCOPE="[^"]*,0470"/);
});

test('0470 routes through the recovery-point runner, same as 0467-0469', () => {
  const script = read('scripts/staging/apply-approved-migrations.sh');
  const specialCaseBlock = script.slice(script.indexOf('if [[ "$migration_basename"'));
  assert.match(specialCaseBlock, /0470_certificado_validacao_hash_index\.sql/);
});

test('0470 is present in the recovery-point allowlist and postcondition dispatch', () => {
  const script = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
  assert.match(script, new RegExp(`"${MIGRATION_NAME}"`));
  assert.match(script, /0470_certificado_validacao_hash_index\.sql\)\s*\n\s*bash scripts\/staging\/validate-0470-postconditions\.sh/);
});

test('deploy-staging.yml ledger preflight scope includes 0470', () => {
  const workflow = read('.github/workflows/deploy-staging.yml');
  assert.match(workflow, /--scope=0467,0468,0469,0470/);
});

test('validate-0470-postconditions.sh exists, targets only staging, and performs zero writes', () => {
  const script = read('scripts/staging/validate-0470-postconditions.sh');
  assert.match(script, /ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"/);
  assert.match(script, /ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"/);
  assert.doesNotMatch(script, /\b(INSERT|UPDATE|DELETE)\b/i);
  execFileSync('bash', ['-n', path.join(ROOT, 'scripts/staging/validate-0470-postconditions.sh')]);
});

test('validate-0470-postconditions.sh refuses a non-staging --target', () => {
  const scriptPath = path.join(ROOT, 'scripts/staging/validate-0470-postconditions.sh');
  assert.throws(() =>
    execFileSync('bash', [scriptPath, '--target=airtrust-db'], { stdio: 'pipe' }),
  );
});

test('backfill-validacao-hash-with-recovery-point.sh only targets the staging D1 constants', () => {
  const script = read('scripts/staging/backfill-validacao-hash-with-recovery-point.sh');
  assert.match(script, /ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"/);
  assert.match(script, /ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"/);
  assert.match(script, /BLOCKED_PRODUCTION_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"/);
});

test('backfill-validacao-hash.yml workflow does not execute the production path', () => {
  const workflow = read('.github/workflows/backfill-validacao-hash.yml');
  assert.match(workflow, /production-backfill:/);
  assert.match(workflow, /if: \$\{\{ false && inputs\.target == 'production' \}\}/);
});

test('backfill-validacao-hash.yml uses a Node version supported by Wrangler 4', () => {
  const workflow = read('.github/workflows/backfill-validacao-hash.yml');
  const match = workflow.match(/NODE_VERSION:\s*'(\d+)'/);
  assert.ok(match, 'NODE_VERSION must be declared in the backfill workflow');
  assert.ok(Number(match[1]) >= 22, `Wrangler 4 requires Node >=22, found Node ${match[1]}`);
});
