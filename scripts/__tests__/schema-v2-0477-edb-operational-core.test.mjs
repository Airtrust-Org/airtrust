// source_reference: 0477 schema-v2 unit tests
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

const MANIFEST = 'worker-airtrust/schema-v2/edb-operational-core-0477.json';
const MIGRATION = 'worker-airtrust/migrations/0477_edb_operational_core.sql';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function executable(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

test('pins reviewed hashes for edb-operational-core-0477', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const sql = readFileSync(manifest.filePath);
  const plan = readFileSync(manifest.planPath);

  assert.equal(manifest.changeId, 'edb-operational-core-0477');
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(sql), manifest.fileHash);
  assert.equal(sha256(plan), manifest.planHash);
});

test('0477 only adds the explicit regulatory companion and eDB core objects', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const change = executable(readFileSync(manifest.filePath, 'utf8'));
  const migration = executable(readFileSync(MIGRATION, 'utf8'));

  for (const sql of [change, migration]) {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS cv_voo_etapas_regulatorio/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS cv_voo_tripulantes_regulatorio/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS edb_registro_revisoes/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS edb_registro_estado/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS edb_anac_outbox/i);
    assert.match(sql, /CREATE TRIGGER IF NOT EXISTS trg_edb_revisoes_no_update/i);
    assert.doesNotMatch(sql, /\bALTER\s+TABLE\b/i);
    assert.doesNotMatch(sql, /\bDROP\s+(?:TABLE|COLUMN|INDEX)\b/i);
    assert.doesNotMatch(sql, /\b(?:INSERT|REPLACE)\s+INTO\s+(?:cv_|edb_)/i);
  }
});

test('0477 leaves ambiguous legacy fields unmapped and introduces explicit names', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  for (const canonical of [
    'tempo_voo_diurno_minutos',
    'tempo_voo_noturno_minutos',
    'tempo_voo_total_minutos',
    'tempo_ifr_real_minutos',
    'tempo_ifr_simulado_minutos',
    'pousos_total',
    'ciclos',
    'combustivel_antes_partida_motor',
    'pessoas_a_bordo_total',
    'carga_regulatoria_kg',
    'codigo_funcao_anac',
  ]) {
    assert.match(sql, new RegExp(`\\b${canonical}\\b`));
  }
  assert.doesNotMatch(sql, /ALTER TABLE cv_voo_etapas/i);
  assert.doesNotMatch(sql, /UPDATE\s+cv_voo_etapas/i);
  assert.doesNotMatch(sql, /UPDATE\s+cv_rdv_operacional/i);
});

test('migration copy and Schema V2 change carry the same executable SQL', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const normalize = (sql) =>
    executable(sql)
      .replace(/\s+/g, ' ')
      .trim();

  assert.equal(
    normalize(readFileSync(manifest.filePath, 'utf8')),
    normalize(readFileSync(MIGRATION, 'utf8')),
  );
});

test('official Schema V2 apply builder accepts 0477 and appends exactly one ledger row', () => {
  const outputPath = path.join(
    mkdtempSync(path.join(tmpdir(), 'airtrust-0477-')),
    '0477-apply.sql',
  );
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: 'edb-operational-core-0477',
    githubSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  });

  assert.equal(result.changeId, 'edb-operational-core-0477');
  const applied = readFileSync(outputPath, 'utf8');
  assert.match(applied, /CREATE TABLE IF NOT EXISTS edb_registro_revisoes/);
  const ledgerRows = applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? [];
  assert.equal(ledgerRows.length, 1);
  assert.match(applied, /'edb-operational-core-0477'/);
});
