// source_reference: 0477 schema-v2 unit tests
// operational_decision: test-only schema-v2 manifest and apply verification
// dry_run_required: false
// rollback_plan_required: false
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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

function apply0477InMemory() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE cv_voo_etapas (id INTEGER PRIMARY KEY);
    CREATE TABLE cv_voo_tripulantes (id INTEGER PRIMARY KEY);
  `);
  db.exec(readFileSync(MIGRATION, 'utf8'));
  return db;
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

test('0477 adds canonical semantics, preflight awareness and isolated eDB persistence', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const change = executable(readFileSync(manifest.filePath, 'utf8'));
  const migration = executable(readFileSync(MIGRATION, 'utf8'));

  for (const candidate of [change, migration]) {
    assert.match(candidate, /ALTER TABLE cv_voo_etapas ADD COLUMN tempo_voo_diurno_minutos/i);
    assert.match(candidate, /ALTER TABLE cv_voo_etapas ADD COLUMN tempo_ifr_real_minutos/i);
    assert.match(candidate, /ALTER TABLE cv_voo_etapas ADD COLUMN tempo_ifr_nao_classificado_minutos/i);
    assert.match(candidate, /ALTER TABLE cv_voo_tripulantes ADD COLUMN codigo_funcao_anac/i);
    assert.match(candidate, /CREATE TABLE IF NOT EXISTS edb_situacoes_tecnicas/i);
    assert.match(candidate, /CREATE TABLE IF NOT EXISTS edb_ciencias_tecnicas_pic/i);
    assert.match(candidate, /ciencia_tecnica_pic_id TEXT NOT NULL/i);
    assert.match(candidate, /CREATE TABLE IF NOT EXISTS edb_registro_revisoes/i);
    assert.match(candidate, /CREATE TABLE IF NOT EXISTS edb_registro_estado/i);
    assert.match(candidate, /CREATE TABLE IF NOT EXISTS edb_anac_outbox/i);
    assert.match(candidate, /CREATE TRIGGER IF NOT EXISTS trg_edb_situacoes_tecnicas_no_update/i);
    assert.match(candidate, /CREATE TRIGGER IF NOT EXISTS trg_edb_ciencias_tecnicas_no_update/i);
    assert.match(candidate, /CREATE TRIGGER IF NOT EXISTS trg_edb_revisoes_no_update/i);
    assert.match(candidate, /CREATE TRIGGER IF NOT EXISTS trg_edb_ciencia_require_snapshot_binding/i);
    assert.match(candidate, /CREATE TRIGGER IF NOT EXISTS trg_edb_revisao_require_scope_and_chain/i);
    assert.match(candidate, /CREATE TRIGGER IF NOT EXISTS trg_edb_assinatura_require_lifecycle/i);
    assert.match(candidate, /CREATE TRIGGER IF NOT EXISTS trg_edb_estado_transition_guard/i);
    assert.match(candidate, /CREATE TRIGGER IF NOT EXISTS trg_edb_anac_outbox_require_operator_signed/i);
    assert.match(candidate, /EDB_TECHNICAL_ACK_SNAPSHOT_BINDING_INVALID/);
    assert.match(candidate, /EDB_CORRECTION_CHAIN_INVALID/);
    assert.match(candidate, /EDB_STATE_TRANSITION_NOT_ALLOWED/);
    assert.match(candidate, /EDB_ANAC_QUEUE_REQUIRES_FINAL_SIGNATURES/);
    assert.doesNotMatch(candidate, /READY_FOR_PIC_TECHNICAL_ACK/i);
    assert.doesNotMatch(candidate, /CREATE TABLE IF NOT EXISTS cv_voo_etapas_regulatorio/i);
    assert.doesNotMatch(candidate, /CREATE TABLE IF NOT EXISTS cv_voo_tripulantes_regulatorio/i);
    assert.doesNotMatch(candidate, /\bDROP\s+(?:TABLE|COLUMN|INDEX)\b/i);
    assert.doesNotMatch(candidate, /\b(?:INSERT|REPLACE)\s+INTO\s+(?:cv_|edb_)/i);
    assert.doesNotMatch(candidate, /UPDATE\s+cv_voo_etapas/i);
    assert.doesNotMatch(candidate, /UPDATE\s+cv_voo_tripulantes/i);
  }
});

test('0477 executes as valid SQLite and installs its integrity guards', () => {
  const db = apply0477InMemory();
  const triggerNames = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
    .all()
    .map((row) => row.name);

  for (const required of [
    'trg_edb_ciencia_require_snapshot_binding',
    'trg_edb_revisao_require_scope_and_chain',
    'trg_edb_assinatura_require_lifecycle',
    'trg_edb_estado_transition_guard',
    'trg_edb_anac_outbox_require_operator_signed',
  ]) {
    assert.ok(triggerNames.includes(required), `missing trigger ${required}`);
  }

  db.close();
});

test('0477 D1 guards fail closed on broken evidence/lifecycle ordering', () => {
  const db = apply0477InMemory();

  assert.throws(
    () =>
      db.exec(`
        INSERT INTO edb_ciencias_tecnicas_pic (
          id, empresa_id, situacao_tecnica_id, voo_id,
          signer_nome, signed_at, canonical_snapshot_sha256,
          metodo, proof_reference
        ) VALUES (
          'sig-tech-orphan', 1, 'missing-snapshot', 100,
          'PIC Test', '2026-08-28T09:30:00Z', '${'a'.repeat(64)}',
          'ASYMMETRIC_DIGITAL_SIGNATURE', 'proof/orphan'
        );
      `),
    /EDB_TECHNICAL_ACK_SNAPSHOT_BINDING_INVALID/,
  );

  db.exec(`
    INSERT INTO edb_registro_estado (revision_id, empresa_id, status, versao)
    VALUES ('rev-state-test', 1, 'DRAFT', 1);
  `);
  assert.throws(
    () =>
      db.exec(`
        UPDATE edb_registro_estado
        SET status = 'ANAC_SYNCED', versao = 2
        WHERE revision_id = 'rev-state-test' AND empresa_id = 1;
      `),
    /EDB_STATE_TRANSITION_NOT_ALLOWED/,
  );

  db.exec(`
    INSERT INTO edb_registro_estado (revision_id, empresa_id, status, versao)
    VALUES ('rev-anac-test', 1, 'OPERATOR_SIGNED', 1);
  `);
  assert.throws(
    () =>
      db.exec(`
        INSERT INTO edb_anac_outbox (
          id, empresa_id, revision_id, operation_kind, idempotency_key
        ) VALUES ('outbox-orphan', 1, 'rev-anac-test', 'CREATE', 'idem-orphan');
      `),
    /EDB_ANAC_QUEUE_REQUIRES_FINAL_SIGNATURES/,
  );

  db.close();
});

test('0477 introduces exact names without reclassifying legacy data', () => {
  const migration = readFileSync(MIGRATION, 'utf8');
  for (const canonical of [
    'tempo_voo_diurno_minutos',
    'tempo_voo_noturno_minutos',
    'tempo_voo_total_minutos',
    'tempo_ifr_real_minutos',
    'tempo_ifr_simulado_minutos',
    'tempo_ifr_nao_classificado_minutos',
    'pousos_total',
    'ciclos',
    'combustivel_antes_partida_motor',
    'pessoas_a_bordo_total',
    'carga_regulatoria_kg',
    'codigo_funcao_anac',
  ]) {
    assert.match(migration, new RegExp(`\\b${canonical}\\b`));
  }
  assert.doesNotMatch(migration, /UPDATE\s+cv_voo_etapas/i);
  assert.doesNotMatch(migration, /UPDATE\s+cv_rdv_operacional/i);
});

test('migration copy and Schema V2 change carry the same executable SQL', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const normalize = (value) =>
    executable(value)
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
  assert.match(applied, /ALTER TABLE cv_voo_etapas ADD COLUMN tempo_voo_diurno_minutos/);
  assert.match(applied, /CREATE TABLE IF NOT EXISTS edb_situacoes_tecnicas/);
  assert.match(applied, /CREATE TABLE IF NOT EXISTS edb_registro_revisoes/);
  assert.match(applied, /CREATE TRIGGER IF NOT EXISTS trg_edb_estado_transition_guard/);
  assert.match(applied, /CREATE TRIGGER IF NOT EXISTS trg_edb_anac_outbox_require_operator_signed/);
  const ledgerRows = applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? [];
  assert.equal(ledgerRows.length, 1);
  assert.match(applied, /'edb-operational-core-0477'/);
});
