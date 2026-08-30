// source_reference: 0480 schema-v2 unit tests
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

const MANIFEST = 'worker-airtrust/schema-v2/edb-diary-lifecycle-integrity-0480.json';
const MIGRATION = 'worker-airtrust/migrations/0480_edb_diary_lifecycle_integrity.sql';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function executable(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

function apply0480InMemory() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE edb_diarios (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      aeronave_id INTEGER NOT NULL,
      contract_version TEXT NOT NULL,
      regulamento_operador TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by INTEGER,
      updated_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
      retencao_minima_ate TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE edb_incidentes_integridade (
      id TEXT PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      diario_id INTEGER NOT NULL,
      volume_id TEXT,
      tipo TEXT NOT NULL,
      ocorrido_em TEXT NOT NULL,
      descricao TEXT NOT NULL,
      police_report_reference TEXT,
      anac_notification_reference TEXT,
      status TEXT NOT NULL,
      reconstitution_evidence_json TEXT,
      created_by INTEGER,
      updated_by INTEGER,
      created_at TEXT,
      updated_at TEXT
    );
  `);
  db.exec(readFileSync(MIGRATION, 'utf8'));
  return db;
}

test('pins reviewed hashes for edb-diary-lifecycle-integrity-0480', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.changeId, 'edb-diary-lifecycle-integrity-0480');
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(readFileSync(manifest.filePath)), manifest.fileHash);
  assert.equal(sha256(readFileSync(manifest.planPath)), manifest.planHash);
});

test('0480 migration and Schema V2 copy carry the same executable SQL', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const normalize = (value) => executable(value).replace(/\s+/g, ' ').trim();
  assert.equal(
    normalize(readFileSync(manifest.filePath, 'utf8')),
    normalize(readFileSync(MIGRATION, 'utf8')),
  );
});

test('0480 makes diary identity immutable and prevents reopen/delete', () => {
  const db = apply0480InMemory();
  db.exec(`INSERT INTO edb_diarios (
    id, empresa_id, aeronave_id, contract_version, regulamento_operador,
    status, created_by, created_at, updated_at
  ) VALUES (1, 10, 20, 'edb.regulatory.v1', 'RBAC135', 'ATIVO', 1,
    '2026-08-29T00:00:00Z', '2026-08-29T00:00:00Z');`);

  assert.throws(
    () => db.exec(`UPDATE edb_diarios SET aeronave_id = 21 WHERE id = 1;`),
    /EDB_DIARY_IDENTITY_IMMUTABLE/,
  );
  db.exec(`UPDATE edb_diarios SET status = 'ENCERRADO' WHERE id = 1;`);
  assert.throws(
    () => db.exec(`UPDATE edb_diarios SET status = 'ATIVO' WHERE id = 1;`),
    /EDB_DIARY_STATUS_TRANSITION_NOT_ALLOWED/,
  );
  assert.throws(() => db.exec(`DELETE FROM edb_diarios WHERE id = 1;`), /EDB_DIARY_IMMUTABLE/);
  db.close();
});

test('0480 requires coherent volume closing evidence and freezes it after closure', () => {
  const db = apply0480InMemory();
  db.exec(`INSERT INTO edb_volumes (
    id, empresa_id, diario_id, numero_volume, status,
    aberto_em, aberto_por, ato_abertura_json
  ) VALUES ('vol-1', 10, 1, 1, 'ABERTO', '2026-08-01T00:00:00Z', 10, '{}');`);

  assert.throws(
    () => db.exec(`UPDATE edb_volumes SET encerrado_em = '2026-08-31T00:00:00Z' WHERE id = 'vol-1';`),
    /EDB_OPEN_VOLUME_CLOSING_EVIDENCE_NOT_ALLOWED/,
  );

  db.exec(`UPDATE edb_volumes SET
    status = 'ENCERRADO',
    encerrado_em = '2026-08-31T00:00:00Z',
    encerrado_por = 10,
    ato_encerramento_json = '{"act":{"type":"CLOSING"}}'
    WHERE id = 'vol-1';`);

  assert.throws(
    () => db.exec(`UPDATE edb_volumes SET encerrado_em = '2026-09-01T00:00:00Z' WHERE id = 'vol-1';`),
    /EDB_VOLUME_CLOSING_EVIDENCE_IMMUTABLE/,
  );
  assert.throws(
    () => db.exec(`UPDATE edb_volumes SET status = 'ABERTO' WHERE id = 'vol-1';`),
    /EDB_VOLUME_STATUS_TRANSITION_NOT_ALLOWED|EDB_VOLUME_CLOSING_EVIDENCE_IMMUTABLE/,
  );
  assert.throws(() => db.exec(`DELETE FROM edb_volumes WHERE id = 'vol-1';`), /EDB_VOLUME_IMMUTABLE/);
  db.close();
});

test('0480 keeps incident references monotonic and requires evidence timestamps/outcomes', () => {
  const db = apply0480InMemory();
  const emptyEvidence = JSON.stringify({
    policeReportedAt: null,
    anacNotifiedAt: null,
    reconstitutionCompletedAt: null,
    newDiaryOpeningObservation: null,
  });
  db.prepare(`INSERT INTO edb_incidentes_integridade (
    id, empresa_id, diario_id, tipo, ocorrido_em, descricao,
    status, reconstitution_evidence_json
  ) VALUES (?, 10, 1, 'LOSS', '2026-08-28T15:00:00Z', 'Perda', 'OPEN', ?);`)
    .run('incident-1', emptyEvidence);

  assert.throws(
    () => db.exec(`UPDATE edb_incidentes_integridade SET police_report_reference = 'BO-1' WHERE id = 'incident-1';`),
    /EDB_INTEGRITY_INCIDENT_POLICE_TIMESTAMP_REQUIRED/,
  );

  const policeEvidence = JSON.stringify({
    policeReportedAt: '2026-08-28T15:30:00Z',
    anacNotifiedAt: null,
    reconstitutionCompletedAt: null,
    newDiaryOpeningObservation: null,
  });
  db.prepare(`UPDATE edb_incidentes_integridade
    SET police_report_reference = 'BO-1', reconstitution_evidence_json = ?
    WHERE id = 'incident-1';`).run(policeEvidence);

  assert.throws(
    () => db.exec(`UPDATE edb_incidentes_integridade SET police_report_reference = 'BO-2' WHERE id = 'incident-1';`),
    /EDB_INTEGRITY_INCIDENT_POLICE_REFERENCE_IMMUTABLE/,
  );

  const notifiedEvidence = JSON.stringify({
    policeReportedAt: '2026-08-28T15:30:00Z',
    anacNotifiedAt: '2026-08-28T16:00:00Z',
    reconstitutionCompletedAt: null,
    newDiaryOpeningObservation: null,
  });
  db.prepare(`UPDATE edb_incidentes_integridade
    SET anac_notification_reference = 'ANAC-1', reconstitution_evidence_json = ?
    WHERE id = 'incident-1';`).run(notifiedEvidence);

  assert.throws(
    () => db.exec(`UPDATE edb_incidentes_integridade SET status = 'RECONSTITUTED' WHERE id = 'incident-1';`),
    /EDB_INTEGRITY_INCIDENT_RECONSTITUTION_EVIDENCE_REQUIRED/,
  );

  const completedEvidence = JSON.stringify({
    policeReportedAt: '2026-08-28T15:30:00Z',
    anacNotifiedAt: '2026-08-28T16:00:00Z',
    reconstitutionCompletedAt: '2026-08-29T10:00:00Z',
    newDiaryOpeningObservation: null,
  });
  db.prepare(`UPDATE edb_incidentes_integridade
    SET status = 'RECONSTITUTED', reconstitution_evidence_json = ?
    WHERE id = 'incident-1';`).run(completedEvidence);

  assert.throws(
    () => db.exec(`UPDATE edb_incidentes_integridade SET status = 'OPEN' WHERE id = 'incident-1';`),
    /EDB_INTEGRITY_INCIDENT_STATUS_TRANSITION_NOT_ALLOWED/,
  );
  assert.throws(
    () => db.exec(`UPDATE edb_incidentes_integridade SET status = 'CLOSED' WHERE id = 'incident-1';`),
    /EDB_INTEGRITY_INCIDENT_STATUS_TRANSITION_NOT_ALLOWED/,
  );
  assert.throws(
    () => db.exec(`DELETE FROM edb_incidentes_integridade WHERE id = 'incident-1';`),
    /EDB_INTEGRITY_INCIDENT_IMMUTABLE/,
  );
  db.close();
});

test('0480 requires opening observation for impossible reconstitution', () => {
  const db = apply0480InMemory();
  const evidence = JSON.stringify({
    policeReportedAt: '2026-08-28T15:30:00Z',
    anacNotifiedAt: '2026-08-28T16:00:00Z',
    reconstitutionCompletedAt: '2026-08-29T10:00:00Z',
    newDiaryOpeningObservation: null,
  });
  db.prepare(`INSERT INTO edb_incidentes_integridade (
    id, empresa_id, diario_id, tipo, ocorrido_em, descricao,
    police_report_reference, anac_notification_reference,
    status, reconstitution_evidence_json
  ) VALUES ('incident-2', 10, 1, 'LOSS', '2026-08-28T15:00:00Z', 'Perda',
    'BO-2', 'ANAC-2', 'OPEN', ?);`).run(evidence);

  assert.throws(
    () => db.exec(`UPDATE edb_incidentes_integridade SET status = 'IMPOSSIBLE_TO_RECONSTITUTE' WHERE id = 'incident-2';`),
    /EDB_INTEGRITY_INCIDENT_IMPOSSIBLE_EVIDENCE_REQUIRED/,
  );
  db.close();
});

test('official Schema V2 apply builder accepts 0480 and appends exactly one ledger row', () => {
  const outputPath = path.join(
    mkdtempSync(path.join(tmpdir(), 'airtrust-0480-')),
    '0480-apply.sql',
  );
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: 'edb-diary-lifecycle-integrity-0480',
    githubSha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  });
  assert.equal(result.changeId, 'edb-diary-lifecycle-integrity-0480');
  const applied = readFileSync(outputPath, 'utf8');
  assert.match(applied, /trg_edb_diario_status_transition_guard/);
  assert.match(applied, /trg_edb_volume_closed_evidence_immutable/);
  assert.match(applied, /trg_edb_incidente_status_transition_guard/);
  assert.equal((applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? []).length, 1);
  assert.match(applied, /'edb-diary-lifecycle-integrity-0480'/);
});
