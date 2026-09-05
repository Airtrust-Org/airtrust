import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const WORKFLOW = readFileSync(path.join(ROOT, '.github/workflows/edb-staging-full-lifecycle.yml'), 'utf8');
const SEED = readFileSync(path.join(ROOT, 'scripts/staging/seed-qa-edb-full-lifecycle.mjs'), 'utf8');

test('each staging lifecycle attempt gets an exact rerun-safe fixture marker', () => {
  assert.match(
    WORKFLOW,
    /QA_EDB_FULL_FIXTURE_ID:\s*QA-EDB-FULL-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
  );
  assert.match(WORKFLOW, /FIXTURE_ID_REJECTED/);
  assert.match(SEED, /QA_EDB_FULL_FIXTURE_ID_INVALID/);
});

test('canonical rollback is repeatable and tenant plus exact-marker scoped', () => {
  assert.match(SEED, /function rollbackCanonicalFixture\(dbName, id\)/);
  assert.match(SEED, /strictTenantState\(dbName, \{ allowAbsent: false \}\)/);
  assert.match(SEED, /deleted_at = COALESCE\(deleted_at, datetime\('now'\)\)/);
  assert.match(
    SEED,
    /SELECT id FROM cv_voos WHERE empresa_id = \$\{PILOT_TENANT_ID\} AND prefixo = \$\{sqlString\(f\.prefix\)\} AND observacoes = \$\{sqlString\(id\)\}/,
  );
  assert.match(
    SEED,
    /cv_voos', `empresa_id = \$\{PILOT_TENANT_ID\} AND id = \$\{flightId\} AND prefixo = \$\{sqlString\(f\.prefix\)\} AND observacoes = \$\{sqlString\(id\)\}`/,
  );
  assert.match(SEED, /cv_rdv_operacional', `empresa_id = \$\{PILOT_TENANT_ID\} AND voo_id = \$\{flightId\}`/);
  assert.match(SEED, /cv_voo_tripulantes', `empresa_id = \$\{PILOT_TENANT_ID\} AND voo_id = \$\{flightId\}`/);
  assert.match(SEED, /cv_voo_etapas', `empresa_id = \$\{PILOT_TENANT_ID\} AND voo_id = \$\{flightId\}`/);
});

test('cleanup proves no active mutable fixture residue and never deletes regulated eDB evidence', () => {
  assert.match(SEED, /EDB_FULL_CANONICAL_CLEANUP_FAILED/);
  assert.match(SEED, /EDB_FULL_CANONICAL_ROLLBACK_PASS/);
  assert.match(SEED, /SELECT COUNT\(\*\) AS count FROM edb_registro_revisoes/);
  assert.doesNotMatch(SEED, /DELETE\s+FROM\s+edb_/i);
  assert.doesNotMatch(SEED, /UPDATE\s+edb_/i);
  assert.doesNotMatch(SEED, /DROP\s+(?:TABLE|TRIGGER)\s+.*edb_/i);
});

test('workflow keeps cleanup after every attempted identity apply without weakening staging scope', () => {
  const canonicalRollback = WORKFLOW.indexOf('Roll back exact mutable canonical fixture');
  const identityRollback = WORKFLOW.indexOf('Deactivate exact synthetic identity fixtures');
  assert.ok(canonicalRollback >= 0, 'canonical rollback step missing');
  assert.ok(identityRollback > canonicalRollback, 'identity cleanup must remain last');
  assert.match(
    WORKFLOW,
    /Roll back exact mutable canonical fixture[\s\S]*?if: \$\{\{ always\(\) && steps\.identity_apply\.outcome == 'success' \}\}/,
  );
  assert.match(
    WORKFLOW,
    /Deactivate exact synthetic identity fixtures[\s\S]*?if: \$\{\{ always\(\) && steps\.identity_apply\.outcome != 'skipped' \}\}/,
  );
  assert.match(WORKFLOW, /STAGING_D1_NAME:\s*airtrust-db-staging-baseline-20260701/);
  assert.doesNotMatch(WORKFLOW, /airtrust-db-production|api\.airtrust\.online|--env\s+production/i);
});
