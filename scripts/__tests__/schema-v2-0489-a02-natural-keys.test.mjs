// source_reference: A-02 tenant-scoped natural keys 0489 Schema V2 verification
// operational_decision: pin reviewed hashes, migration equivalence and fail-closed ordering
// dry_run_required: false
// rollback_plan_required: false
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/a02-natural-keys-tenant-scoped-0489.json';
const MIGRATION = 'worker-airtrust/migrations/0489_a02_natural_keys_tenant_scoped.sql';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('pins reviewed hashes for A-02 natural keys 0489', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const sql = readFileSync(manifest.filePath);
  const plan = readFileSync(manifest.planPath);
  assert.equal(manifest.changeId, 'a02-natural-keys-tenant-scoped-0489');
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(sql), manifest.fileHash);
  assert.equal(sha256(plan), manifest.planHash);
});

test('0489 Schema V2 SQL is byte-equivalent to the canonical migration', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const change = readFileSync(manifest.filePath, 'utf8');
  const migration = readFileSync(MIGRATION, 'utf8');
  assert.equal(change, migration);

  assert.match(change, /ON funcionarios\(empresa_id, cpf\)/);
  assert.match(change, /ON funcionarios\(empresa_id, TRIM\(matricula\)\)/);
  assert.match(change, /ON funcionarios\(empresa_id, LOWER\(TRIM\(email\)\)\)/);
  assert.doesNotMatch(change, /DROP INDEX IF EXISTS idx_funcionarios_cpf/);
  assert.doesNotMatch(change, /DROP INDEX IF EXISTS idx_funcionarios_matricula/);

  const lastCreate = change.indexOf(
    'CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_email_empresa_active',
  );
  const firstDrop = change.indexOf('DROP INDEX IF EXISTS ux_funcionarios_cpf');
  assert.ok(lastCreate >= 0);
  assert.ok(firstDrop > lastCreate);
});

test('official Schema V2 builder accepts 0489 and appends exactly one ledger row', () => {
  const outputPath = path.join(
    mkdtempSync(path.join(tmpdir(), 'airtrust-0489-')),
    '0489-apply.sql',
  );
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: 'a02-natural-keys-tenant-scoped-0489',
    githubSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  assert.equal(result.changeId, 'a02-natural-keys-tenant-scoped-0489');
  const applied = readFileSync(outputPath, 'utf8');
  assert.match(applied, /ux_funcionarios_cpf_empresa_active/);
  assert.match(applied, /ux_funcionarios_matricula_empresa_active/);
  assert.match(applied, /ux_funcionarios_email_empresa_active/);
  const ledgerRows = applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? [];
  assert.equal(ledgerRows.length, 1);
  assert.match(applied, /'a02-natural-keys-tenant-scoped-0489'/);
});

test('production workflow wires dedicated fail-closed 0489 preflight and postconditions', () => {
  const workflow = readFileSync('.github/workflows/apply-schema-change-v2.yml', 'utf8');
  assert.match(workflow, /inputs\.change_id == 'a02-natural-keys-tenant-scoped-0489'/);
  assert.match(workflow, /validate-0489-production-preflight\.sh/);
  assert.match(workflow, /validate-0489-production-postconditions\.sh/);
});

test('staging recovery runner allowlists 0489 and executes dedicated guards', () => {
  const workflow = readFileSync('.github/workflows/staging-d1-schema-change.yml', 'utf8');
  const runner = readFileSync('scripts/staging/apply-approved-migration-with-recovery-point.sh', 'utf8');
  assert.match(workflow, /0489_a02_natural_keys_tenant_scoped\.sql/);
  assert.match(runner, /0489_a02_natural_keys_tenant_scoped\.sql/);
  assert.match(runner, /validate-0489-preflight\.sh/);
  assert.match(runner, /validate-0489-postconditions\.sh/);

  const ledgerRead = runner.indexOf('ledger_count="$(read_ledger_count)"');
  const specializedPreflight = runner.indexOf(
    'bash scripts/staging/validate-0489-preflight.sh --target="$db_name"',
  );
  assert.ok(ledgerRead >= 0);
  assert.ok(specializedPreflight > ledgerRead);
  assert.match(
    runner,
    /0489_a02_natural_keys_tenant_scoped\.sql" && "\$ledger_count" == "0"/,
  );
});

test('0489 preflight and postconditions detect unexpected global natural-key uniqueness', () => {
  const stagingPreflight = readFileSync('scripts/staging/validate-0489-preflight.sh', 'utf8');
  const productionPreflight = readFileSync(
    'scripts/schema-v2/validate-0489-production-preflight.sh',
    'utf8',
  );
  const stagingPost = readFileSync('scripts/staging/validate-0489-postconditions.sh', 'utf8');
  const productionPost = readFileSync(
    'scripts/schema-v2/validate-0489-production-postconditions.sh',
    'utf8',
  );

  for (const preflight of [stagingPreflight, productionPreflight]) {
    assert.match(preflight, /unexpected-global-natural-key-unique-indexes/);
    assert.match(preflight, /pragma_index_list\('funcionarios'\)/);
    assert.match(preflight, /pragma_index_info\(il\.name\)/);
  }

  for (const post of [stagingPost, productionPost]) {
    assert.match(post, /global-natural-key-unique-indexes/);
    assert.match(post, /pragma_index_list\('funcionarios'\)/);
    assert.match(post, /pragma_index_info\(il\.name\)/);
  }
});
