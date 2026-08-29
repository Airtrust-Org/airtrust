// source_reference: 0479 schema-v2 unit tests
// operational_decision: test-only schema-v2 manifest and SQLite guard verification
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

const MANIFEST = 'worker-airtrust/schema-v2/edb-relational-integrity-0479.json';
const MIGRATION = 'worker-airtrust/migrations/0479_edb_relational_integrity.sql';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function executable(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

function apply0479InMemory() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE edb_diarios (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL
    );
    CREATE TABLE edb_volumes (
      id TEXT PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      diario_id INTEGER NOT NULL,
      numero_volume INTEGER NOT NULL,
      status TEXT NOT NULL,
      aberto_em TEXT NOT NULL,
      aberto_por INTEGER NOT NULL,
      ato_abertura_json TEXT NOT NULL,
      encerrado_em TEXT,
      encerrado_por INTEGER,
      ato_encerramento_json TEXT,
      retencao_minima_ate TEXT
    );
    CREATE TABLE edb_registro_revisoes (
      id TEXT PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      diario_id INTEGER NOT NULL,
      voo_id INTEGER NOT NULL
    );
    CREATE TABLE edb_discrepancias_tecnicas (
      id TEXT PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      revision_id TEXT NOT NULL,
      detectado_em TEXT NOT NULL
    );
    CREATE TABLE edb_acoes_manutencao (
      id TEXT PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      discrepancia_id TEXT NOT NULL,
      tipo TEXT NOT NULL,
      referencia_acao_id TEXT,
      executado_em TEXT NOT NULL
    );
    CREATE TABLE edb_situacoes_tecnicas (
      id TEXT PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      voo_id INTEGER NOT NULL
    );
    CREATE TABLE edb_auditoria_eventos (
      id TEXT PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      diario_id INTEGER,
      revision_id TEXT,
      event_type TEXT NOT NULL,
      actor_user_id INTEGER,
      actor_funcionario_id INTEGER,
      payload_json TEXT NOT NULL,
      previous_event_hash_sha256 TEXT,
      event_hash_sha256 TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );
    CREATE TABLE edb_incidentes_integridade (
      id TEXT PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      diario_id INTEGER NOT NULL,
      volume_id TEXT,
      tipo TEXT NOT NULL,
      ocorrido_em TEXT NOT NULL,
      descricao TEXT NOT NULL,
      status TEXT NOT NULL
    );
  `);
  db.exec(readFileSync(MIGRATION, 'utf8'));
  db.exec(`
    INSERT INTO edb_diarios (id, empresa_id) VALUES (1, 10), (2, 20);
    INSERT INTO edb_volumes (
      id, empresa_id, diario_id, numero_volume, status,
      aberto_em, aberto_por, ato_abertura_json
    ) VALUES ('vol-1', 10, 1, 1, 'ABERTO', '2026-08-29T00:00:00Z', 1, '{}');
    INSERT INTO edb_registro_revisoes (id, empresa_id, diario_id, voo_id)
      VALUES ('rev-1', 10, 1, 100);
    INSERT INTO edb_situacoes_tecnicas (id, empresa_id, voo_id)
      VALUES ('tech-1', 10, 100);
  `);
  return db;
}

test('pins reviewed hashes for edb-relational-integrity-0479', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.changeId, 'edb-relational-integrity-0479');
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(readFileSync(manifest.filePath)), manifest.fileHash);
  assert.equal(sha256(readFileSync(manifest.planPath)), manifest.planHash);
});

test('0479 migration and Schema V2 copy carry the same executable SQL', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const normalize = (value) => executable(value).replace(/\s+/g, ' ').trim();
  assert.equal(
    normalize(readFileSync(manifest.filePath, 'utf8')),
    normalize(readFileSync(MIGRATION, 'utf8')),
  );
});

test('0479 rejects cross-tenant diary, discrepancy and maintenance bindings', () => {
  const db = apply0479InMemory();
  assert.throws(
    () =>
      db.exec(`INSERT INTO edb_volumes (
        id, empresa_id, diario_id, numero_volume, status, aberto_em, aberto_por, ato_abertura_json
      ) VALUES ('cross-vol', 20, 1, 2, 'ABERTO', '2026-08-29T00:00:00Z', 1, '{}');`),
    /EDB_VOLUME_DIARY_SCOPE_MISMATCH/,
  );
  assert.throws(
    () => db.exec(`INSERT INTO edb_discrepancias_tecnicas (id, empresa_id, revision_id, detectado_em)
      VALUES ('disc-cross', 20, 'rev-1', '2026-08-29T01:00:00Z');`),
    /EDB_DISCREPANCY_REVISION_SCOPE_MISMATCH/,
  );

  db.exec(`INSERT INTO edb_discrepancias_tecnicas (id, empresa_id, revision_id, detectado_em)
    VALUES ('disc-1', 10, 'rev-1', '2026-08-29T01:00:00Z');`);
  assert.throws(
    () => db.exec(`INSERT INTO edb_acoes_manutencao (
      id, empresa_id, discrepancia_id, tipo, referencia_acao_id, executado_em
    ) VALUES ('rts-orphan', 10, 'disc-1', 'RTS_APPROVAL', 'missing', '2026-08-29T02:00:00Z');`),
    /EDB_RTS_CORRECTIVE_ACTION_SCOPE_INVALID/,
  );
  db.exec(`INSERT INTO edb_acoes_manutencao (
    id, empresa_id, discrepancia_id, tipo, executado_em
  ) VALUES ('corrective-1', 10, 'disc-1', 'CORRECTIVE_ACTION', '2026-08-29T02:00:00Z');`);
  db.exec(`INSERT INTO edb_acoes_manutencao (
    id, empresa_id, discrepancia_id, tipo, referencia_acao_id, executado_em
  ) VALUES ('rts-1', 10, 'disc-1', 'RTS_APPROVAL', 'corrective-1', '2026-08-29T03:00:00Z');`);
  assert.throws(
    () => db.exec(`INSERT INTO edb_acoes_manutencao (
      id, empresa_id, discrepancia_id, tipo, referencia_acao_id, executado_em
    ) VALUES ('rts-duplicate', 10, 'disc-1', 'RTS_APPROVAL', 'corrective-1', '2026-08-29T04:00:00Z');`),
    /EDB_RTS_ALREADY_RECORDED_FOR_CORRECTIVE_ACTION/,
  );
  db.close();
});

test('0479 materializes audit scope/actor and enforces one diary hash chain', () => {
  const db = apply0479InMemory();
  const hash1 = 'a'.repeat(64);
  const hash2 = 'b'.repeat(64);
  const actorJson = '{"anacCode":"123456","employeeId":10,"fullName":"PIC Test"}';

  assert.throws(
    () => db.exec(`INSERT INTO edb_auditoria_eventos (
      id, empresa_id, diario_id, event_type, actor_json, payload_json,
      previous_event_hash_sha256, event_hash_sha256, occurred_at,
      voo_id, situacao_tecnica_id
    ) VALUES ('audit-invalid-actor', 10, 1, 'SOURCE_SNAPSHOT_CAPTURED', '{bad', '{}',
      NULL, '${hash1}', '2026-08-29T00:00:00Z', 100, 'tech-1');`),
    /EDB_AUDIT_ACTOR_JSON_INVALID/,
  );
  assert.throws(
    () => db.exec(`INSERT INTO edb_auditoria_eventos (
      id, empresa_id, diario_id, event_type, actor_json, payload_json,
      previous_event_hash_sha256, event_hash_sha256, occurred_at,
      voo_id, situacao_tecnica_id
    ) VALUES ('audit-bad-first', 10, 1, 'SOURCE_SNAPSHOT_CAPTURED', '${actorJson}', '{}',
      '${'f'.repeat(64)}', '${hash1}', '2026-08-29T00:00:00Z', 100, 'tech-1');`),
    /EDB_AUDIT_FIRST_EVENT_PREVIOUS_HASH_NOT_NULL/,
  );
  db.exec(`INSERT INTO edb_auditoria_eventos (
    id, empresa_id, diario_id, event_type, actor_json, payload_json,
    previous_event_hash_sha256, event_hash_sha256, occurred_at,
    voo_id, situacao_tecnica_id
  ) VALUES ('audit-1', 10, 1, 'SOURCE_SNAPSHOT_CAPTURED', '${actorJson}', '{}',
    NULL, '${hash1}', '2026-08-29T00:00:00Z', 100, 'tech-1');`);
  assert.throws(
    () => db.exec(`INSERT INTO edb_auditoria_eventos (
      id, empresa_id, diario_id, revision_id, event_type, actor_json, payload_json,
      previous_event_hash_sha256, event_hash_sha256, occurred_at, voo_id
    ) VALUES ('audit-wrong-chain', 10, 1, 'rev-1', 'RECORD_CREATED', '${actorJson}', '{}',
      '${'c'.repeat(64)}', '${hash2}', '2026-08-29T01:00:00Z', 100);`),
    /EDB_AUDIT_PREVIOUS_HASH_MISMATCH/,
  );
  db.exec(`INSERT INTO edb_auditoria_eventos (
    id, empresa_id, diario_id, revision_id, event_type, actor_json, payload_json,
    previous_event_hash_sha256, event_hash_sha256, occurred_at, voo_id
  ) VALUES ('audit-2', 10, 1, 'rev-1', 'RECORD_CREATED', '${actorJson}', '{}',
    '${hash1}', '${hash2}', '2026-08-29T01:00:00Z', 100);`);

  const row = db.prepare(`SELECT voo_id, situacao_tecnica_id, actor_json FROM edb_auditoria_eventos WHERE id = 'audit-1'`).get();
  assert.equal(row.voo_id, 100);
  assert.equal(row.situacao_tecnica_id, 'tech-1');
  assert.equal(row.actor_json, actorJson);
  db.close();
});

test('0479 protects integrity incident diary/volume identity', () => {
  const db = apply0479InMemory();
  assert.throws(
    () => db.exec(`INSERT INTO edb_incidentes_integridade (
      id, empresa_id, diario_id, volume_id, tipo, ocorrido_em, descricao, status
    ) VALUES ('incident-cross', 20, 2, 'vol-1', 'LOSS', '2026-08-29T01:00:00Z', 'x', 'OPEN');`),
    /EDB_INTEGRITY_INCIDENT_VOLUME_SCOPE_MISMATCH/,
  );
  db.exec(`INSERT INTO edb_incidentes_integridade (
    id, empresa_id, diario_id, volume_id, tipo, ocorrido_em, descricao, status
  ) VALUES ('incident-1', 10, 1, 'vol-1', 'LOSS', '2026-08-29T01:00:00Z', 'x', 'OPEN');`);
  assert.throws(
    () => db.exec(`UPDATE edb_incidentes_integridade SET diario_id = 2 WHERE id = 'incident-1';`),
    /EDB_INTEGRITY_INCIDENT_IDENTITY_IMMUTABLE/,
  );
  db.close();
});

test('official Schema V2 apply builder accepts 0479 and appends exactly one ledger row', () => {
  const outputPath = path.join(
    mkdtempSync(path.join(tmpdir(), 'airtrust-0479-')),
    '0479-apply.sql',
  );
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: 'edb-relational-integrity-0479',
    githubSha: 'dddddddddddddddddddddddddddddddddddddddd',
  });
  assert.equal(result.changeId, 'edb-relational-integrity-0479');
  const applied = readFileSync(outputPath, 'utf8');
  assert.match(applied, /ALTER TABLE edb_auditoria_eventos ADD COLUMN voo_id/);
  assert.match(applied, /ALTER TABLE edb_auditoria_eventos ADD COLUMN actor_json/);
  assert.match(applied, /trg_edb_auditoria_require_scope_and_chain/);
  assert.equal((applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? []).length, 1);
  assert.match(applied, /'edb-relational-integrity-0479'/);
});
