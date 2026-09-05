import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const MIGRATION_NAME = '0476_frms_pvtb_v2_operational_load.sql';
const VALIDATOR = 'scripts/staging/validate-0476-postconditions.sh';

const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

test('0476 is in the staging apply allowlist (apply-approved-migrations.sh)', () => {
  const script = read('scripts/staging/apply-approved-migrations.sh');
  assert.match(script, new RegExp(`APPROVED_MIGRATIONS=\\([^)]*"${MIGRATION_NAME}"[^)]*\\)`));
});

test('RELEASE_PREFLIGHT_SCOPE includes 0476 in scope', () => {
  const script = read('scripts/staging/apply-approved-migrations.sh');
  assert.match(script, /RELEASE_PREFLIGHT_SCOPE="[^"]*,0475,0476,0477,0478,0479,0480"/);
});

test('0476 routes through the recovery-point runner (D1 Time Travel point captured)', () => {
  const script = read('scripts/staging/apply-approved-migrations.sh');
  const block = script.slice(script.indexOf('if [[ "$migration_basename"'));
  assert.match(block, /0476_frms_pvtb_v2_operational_load\.sql/);
});

test('0476 is in the recovery-point allowlist and postcondition dispatch', () => {
  const script = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
  assert.match(script, new RegExp(`"${MIGRATION_NAME}"`));
  assert.match(
    script,
    /0476_frms_pvtb_v2_operational_load\.sql\)\s*\n\s*bash scripts\/staging\/validate-0476-postconditions\.sh/,
  );
});

test('staging-d1-schema-change.yml offers 0476 and validates it in the dispatch case', () => {
  const workflow = read('.github/workflows/staging-d1-schema-change.yml');
  assert.match(workflow, /- 0476_frms_pvtb_v2_operational_load\.sql/);
  assert.match(workflow, /\|0476_frms_pvtb_v2_operational_load\.sql\) ;;/);
});

test('deploy-staging.yml ledger preflight scope includes 0476', () => {
  const workflow = read('.github/workflows/deploy-staging.yml');
  assert.match(workflow, /--scope=0467,0468,0469,0470,0472,0475,0476/);
});

test('validate-0476-postconditions.sh targets only staging and performs zero writes', () => {
  const script = read(VALIDATOR);
  assert.match(script, /airtrust-db-staging-baseline-20260701/);
  assert.doesNotMatch(script, /\b(INSERT|UPDATE|DELETE|DROP)\b/i);
  execFileSync('bash', ['-n', path.join(ROOT, VALIDATOR)]);
});

test('validate-0476-postconditions.sh refuses a non-staging --target', () => {
  assert.throws(() =>
    execFileSync('bash', [path.join(ROOT, VALIDATOR), '--target=airtrust-db'], { stdio: 'pipe' }),
  );
});

test('validate-0476-postconditions.sh asserts index and operational_load columns', () => {
  const script = read(VALIDATOR);
  assert.match(script, /idx_frms_readiness_baseline_protocol/);
  assert.match(script, /operational_load_policy_version/);
  assert.match(script, /operational_load_landings_count/);
  assert.match(script, /operational_load_temperature_max_c/);
  assert.match(script, /operational_load_weather_quality/);
  assert.match(script, /operational_load_data_quality/);
  assert.match(script, /operational_load_landings_delta/);
  assert.match(script, /operational_load_temperature_delta/);
  assert.match(script, /operational_load_total_delta/);
});

test('the 0476 migration file is additive DDL with no destructive ops', () => {
  const sql = read(`worker-airtrust/migrations/${MIGRATION_NAME}`);
  const body = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_frms_readiness_baseline_protocol/);
  assert.match(sql, /ALTER TABLE frms_fatorizacao_jornada/);
  assert.doesNotMatch(body, /\b(DROP|DELETE|UPDATE|REPLACE)\b/i);
});
