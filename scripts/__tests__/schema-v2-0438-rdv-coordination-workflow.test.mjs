// source_reference: 0438 schema-v2 unit tests
// operational_decision: test-only schema-v2 manifest and apply verification
// dry_run_required: false
// rollback_plan_required: false
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/0438-rdv-coordination-workflow-production.json';
const MIGRATION = 'worker-airtrust/migrations/0438_controle_voos_rdv_coordenacao_workflow.sql';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function executable(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

test('pins reviewed hashes for 0438-rdv-coordination-workflow-production', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const sql = readFileSync(manifest.filePath);
  const plan = readFileSync(manifest.planPath);

  assert.equal(manifest.changeId, '0438-rdv-coordination-workflow-production');
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(
    manifest.filePath,
    'worker-airtrust/schema-v2/changes/0438_controle_voos_rdv_coordenacao_workflow.sql',
  );
  assert.equal(sha256(sql), manifest.fileHash);
  assert.equal(sha256(plan), manifest.planHash);
});

test('0438 touches no existing table destructively — only additive DDL plus scratch guards', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const change = readFileSync(manifest.filePath, 'utf8');
  const migration = readFileSync(MIGRATION, 'utf8');

  for (const sql of [change, migration]) {
    const body = executable(sql);

    // The RDV coordination markers the mounted Worker routes depend on.
    assert.match(body, /ALTER TABLE cv_rdv_operacional ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'rascunho'/);
    assert.match(body, /ALTER TABLE cv_rdv_operacional ADD COLUMN versao INTEGER NOT NULL DEFAULT 1/);
    assert.match(body, /CREATE TABLE IF NOT EXISTS cv_rdv_aprovacoes/);
    assert.match(body, /CREATE TABLE IF NOT EXISTS cv_rdv_revisoes/);
    assert.match(body, /CREATE TABLE IF NOT EXISTS cv_rdv_alertas/);
    assert.match(body, /CREATE TABLE IF NOT EXISTS cv_voo_abastecimentos/);
    assert.match(
      body,
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_voo_etapas_empresa_voo_numero_unique/,
    );

    // No ALTER against any existing table other than the additive cv_rdv_operacional columns.
    for (const m of body.matchAll(/ALTER TABLE\s+(\w+)/gi)) {
      assert.equal(m[1], 'cv_rdv_operacional');
    }

    // Every DROP targets only the transient preflight/rollback guard tables.
    for (const m of body.matchAll(/DROP TABLE IF EXISTS\s+(\w+)/gi)) {
      assert.match(m[1], /^_(?:preflight|rollback)_0438_/);
    }
    assert.doesNotMatch(body, /\bDROP\s+(?:INDEX|TRIGGER|VIEW|COLUMN)\b/i);
    assert.doesNotMatch(body, /\bDELETE\s+FROM\b/i);
    assert.doesNotMatch(body, /\bREPLACE\s+INTO\b/i);

    // The only INSERTs are the fail-closed guard probes into the scratch tables.
    for (const m of body.matchAll(/INSERT INTO\s+(\w+)/gi)) {
      assert.match(m[1], /^_(?:preflight|rollback)_0438_/);
    }
  }
});

test('the migration/ copy and the schema-v2 change carry the same executable SQL', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const normalize = (sql) => executable(sql).replace(/\s+/g, ' ').trim();
  assert.equal(
    normalize(readFileSync(manifest.filePath, 'utf8')),
    normalize(readFileSync(MIGRATION, 'utf8')),
  );
});

test('official Schema V2 apply builder accepts 0438 and appends exactly one ledger row', () => {
  const outputPath = path.join(
    mkdtempSync(path.join(tmpdir(), 'airtrust-0438-')),
    '0438-apply.sql',
  );
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: '0438-rdv-coordination-workflow-production',
    githubSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  assert.equal(result.changeId, '0438-rdv-coordination-workflow-production');
  const applied = readFileSync(outputPath, 'utf8');
  assert.match(applied, /CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_voo_etapas_empresa_voo_numero_unique/);
  const ledgerRows = applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? [];
  assert.equal(ledgerRows.length, 1);
  assert.match(applied, /'0438-rdv-coordination-workflow-production'/);
  assert.match(applied, /'production-d1-baseline-v2-20260714'/);
});
