import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const MIGRATION_NAME = '0475_usuarios_empresas_perfis_reconciliation.sql';
const VALIDATOR = 'scripts/staging/validate-0475-postconditions.sh';

const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

test('0475 is in the staging apply allowlist (apply-approved-migrations.sh)', () => {
  const script = read('scripts/staging/apply-approved-migrations.sh');
  assert.match(script, new RegExp(`APPROVED_MIGRATIONS=\\([^)]*"${MIGRATION_NAME}"[^)]*\\)`));
});

test('RELEASE_PREFLIGHT_SCOPE includes 0475 in scope', () => {
  const script = read('scripts/staging/apply-approved-migrations.sh');
  assert.match(script, /RELEASE_PREFLIGHT_SCOPE="[^"]*,0472,0475,0476,0477,0478,0479,0480"/);
});

test('0475 routes through the recovery-point runner (D1 Time Travel point captured)', () => {
  const script = read('scripts/staging/apply-approved-migrations.sh');
  const block = script.slice(script.indexOf('if [[ "$migration_basename"'));
  assert.match(block, /0475_usuarios_empresas_perfis_reconciliation\.sql/);
});

test('0475 is in the recovery-point allowlist and postcondition dispatch', () => {
  const script = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
  assert.match(script, new RegExp(`"${MIGRATION_NAME}"`));
  assert.match(
    script,
    /0475_usuarios_empresas_perfis_reconciliation\.sql\)\s*\n\s*bash scripts\/staging\/validate-0475-postconditions\.sh/,
  );
});

test('staging-d1-schema-change.yml offers 0475 and validates it in the dispatch case', () => {
  const workflow = read('.github/workflows/staging-d1-schema-change.yml');
  assert.match(workflow, /- 0475_usuarios_empresas_perfis_reconciliation\.sql/);
  assert.match(workflow, /\|0475_usuarios_empresas_perfis_reconciliation\.sql/);
});

test('deploy-staging.yml ledger preflight scope includes 0475', () => {
  const workflow = read('.github/workflows/deploy-staging.yml');
  assert.match(workflow, /--scope=0467,0468,0469,0470,0472,0475,0476/);
});

test('validate-0475-postconditions.sh targets only staging and performs zero writes', () => {
  const script = read(VALIDATOR);
  assert.match(script, /airtrust-db-staging-baseline-20260701/);
  assert.doesNotMatch(script, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
  execFileSync('bash', ['-n', path.join(ROOT, VALIDATOR)]);
});

test('validate-0475-postconditions.sh refuses a non-staging --target', () => {
  assert.throws(() =>
    execFileSync('bash', [path.join(ROOT, VALIDATOR), '--target=airtrust-db'], { stdio: 'pipe' }),
  );
});

test('validate-0475-postconditions.sh asserts the table, index, backfill completeness and tenant isolation', () => {
  const script = read(VALIDATOR);
  assert.match(script, /usuarios_empresas_perfis/);
  assert.match(script, /UNIQUE\(usuario_id, empresa_id, perfil\)/);
  assert.match(script, /idx_usuarios_empresas_perfis_lookup/);
  assert.match(script, /NOT EXISTS/);
});

test('the 0475 migration file is additive idempotent DDL with no user-specific DML', () => {
  const sql = read(`worker-airtrust/migrations/${MIGRATION_NAME}`);
  const body = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS usuarios_empresas_perfis/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_perfis_lookup/);
  assert.match(sql, /INSERT OR IGNORE INTO usuarios_empresas_perfis/);
  assert.doesNotMatch(body, /\b(DROP|ALTER)\s+TABLE\b/i);
  assert.doesNotMatch(body, /\b(DELETE|UPDATE|REPLACE)\b/i);
  assert.doesNotMatch(body, /@|u\.email|'GESTOR'|'INSTRUTOR'|'ALUNO'/);
});
