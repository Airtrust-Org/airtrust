import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const MIG0483 = join(ROOT, 'worker-airtrust/migrations/0483_edb_diary_persistence_foundation.sql');
const MIG0485 = join(ROOT, 'worker-airtrust/migrations/0485_edb_technical_awareness_persistence.sql');
const MIG0486 = join(ROOT, 'worker-airtrust/migrations/0486_edb_final_revision_persistence.sql');
const dirs: string[] = [];

function createDb() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-edb-0486-scope-'));
  dirs.push(dir);
  const path = join(dir, 'test.sqlite');
  const setup = execSql(path, `
    CREATE TABLE aeronaves (id INTEGER PRIMARY KEY, empresa_id INTEGER, prefixo TEXT, deleted_at TEXT);
    INSERT INTO aeronaves (id, empresa_id, prefixo) VALUES (10, 1, 'PR-A'), (20, 2, 'PR-B');

    CREATE TABLE cv_voos (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, aeronave_id INTEGER, deleted_at TEXT);
    INSERT INTO cv_voos (id, empresa_id, aeronave_id) VALUES (100, 1, 10), (200, 2, 20);

    CREATE TABLE cv_voo_etapas (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, voo_id INTEGER NOT NULL, deleted_at TEXT);
    INSERT INTO cv_voo_etapas (id, empresa_id, voo_id) VALUES (1001, 1, 100), (2001, 2, 200);
  `);
  expect(setup.code, setup.stderr).toBe(0);

  for (const migration of [MIG0483, MIG0485, MIG0486]) {
    const applied = execSql(path, readFileSync(migration, 'utf8'));
    expect(applied.code, applied.stderr).toBe(0);
  }

  const seed = execSql(path, `
    INSERT INTO edb_diarios (id, empresa_id, aeronave_id) VALUES (1, 1, 10), (2, 2, 20);
    INSERT INTO edb_volumes (id, empresa_id, diario_id, numero_volume, opened_at, opening_act_json)
    VALUES ('vol-1', 1, 1, 1, '2026-09-05T09:00:00Z', '{}'),
           ('vol-2', 2, 2, 1, '2026-09-05T09:00:00Z', '{}');

    INSERT INTO edb_situacoes_tecnicas (
      id, empresa_id, voo_id, aeronave_id, aircraft_json, maintenance_json,
      technical_content_sha256, canonical_snapshot_sha256, captured_at
    ) VALUES
      ('snap-1', 1, 100, 10, '{}', '{}', '${'a'.repeat(64)}', '${'b'.repeat(64)}', '2026-09-05T09:30:00Z'),
      ('snap-2', 2, 200, 20, '{}', '{}', '${'c'.repeat(64)}', '${'d'.repeat(64)}', '2026-09-05T09:30:00Z');

    INSERT INTO edb_ciencias_tecnicas_pic (
      id, empresa_id, situacao_tecnica_id, voo_id, signer_nome, signed_at,
      canonical_snapshot_sha256, metodo, proof_reference
    ) VALUES
      ('ack-1', 1, 'snap-1', 100, 'PIC 1', '2026-09-05T09:40:00Z', '${'b'.repeat(64)}', 'ASYMMETRIC_DIGITAL_SIGNATURE', 'proof-1'),
      ('ack-2', 2, 'snap-2', 200, 'PIC 2', '2026-09-05T09:40:00Z', '${'d'.repeat(64)}', 'ASYMMETRIC_DIGITAL_SIGNATURE', 'proof-2');
  `);
  expect(seed.code, seed.stderr).toBe(0);
  return path;
}

function payload(overrides: { company?: number; flight?: number; stage?: number; ack?: string; target?: string; ackHash?: string } = {}) {
  return JSON.stringify({
    contractVersion: 'edb.regulatory.v1',
    logicalRecordId: 'logical-1',
    revisionId: 'rev-1',
    status: 'DRAFT',
    identity: { operatorCompanyId: overrides.company ?? 1 },
    source: { sourceFlightId: overrides.flight ?? 100, sourceStageId: overrides.stage ?? 1001 },
    correction: { revision: 1, supersedesRevisionId: null, correctionReason: null },
    signatures: {
      picTechnicalAcknowledgement: {
        signatureId: overrides.ack ?? 'ack-1',
        targetId: overrides.target ?? 'snap-1',
        canonicalPayloadHashSha256: overrides.ackHash ?? 'b'.repeat(64),
      },
    },
  });
}

function insertRevision(path: string, overrides: { company?: number; diary?: number; volume?: string; flight?: number; stage?: number; ack?: string; payload?: string } = {}) {
  const company = overrides.company ?? 1;
  const diary = overrides.diary ?? 1;
  const volume = overrides.volume ?? 'vol-1';
  const flight = overrides.flight ?? 100;
  const stage = overrides.stage ?? 1001;
  const ack = overrides.ack ?? 'ack-1';
  const json = overrides.payload ?? payload({ company, flight, stage, ack });
  return execSql(path, `
    INSERT INTO edb_registro_revisoes (
      id, empresa_id, diario_id, volume_id, logical_record_id, revisao,
      contract_version, voo_id, etapa_id, ciencia_tecnica_pic_id,
      payload_json, canonical_payload_sha256, captured_at
    ) VALUES (
      'rev-1', ${company}, ${diary}, '${volume}', 'logical-1', 1,
      'edb.regulatory.v1', ${flight}, ${stage}, '${ack}',
      '${json.replaceAll("'", "''")}', '${'e'.repeat(64)}', '2026-09-05T10:00:00Z'
    );
  `);
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('0486 eDB scope and immutability invariants', () => {
  it('fails closed when a revision mixes tenant-scoped diary, volume, flight, stage or acknowledgement evidence', () => {
    const cases = [
      { overrides: { company: 2, diary: 1, volume: 'vol-2', flight: 200, stage: 2001, ack: 'ack-2', payload: payload({ company: 2, flight: 200, stage: 2001, ack: 'ack-2', target: 'snap-2', ackHash: 'd'.repeat(64) }) }, error: 'EDB_REVISION_DIARY_SCOPE_MISMATCH' },
      { overrides: { company: 2, diary: 2, volume: 'vol-1', flight: 200, stage: 2001, ack: 'ack-2', payload: payload({ company: 2, flight: 200, stage: 2001, ack: 'ack-2', target: 'snap-2', ackHash: 'd'.repeat(64) }) }, error: 'EDB_REVISION_VOLUME_SCOPE_MISMATCH' },
      // A cross-tenant flight cannot retain a valid technical acknowledgement:
      // payload/ack binding is deliberately checked before the lower-level
      // flight-scope lookup, so the earlier fail-closed invariant is expected.
      { overrides: { company: 2, diary: 2, volume: 'vol-2', flight: 100, stage: 2001, ack: 'ack-2', payload: payload({ company: 2, flight: 100, stage: 2001, ack: 'ack-2', target: 'snap-2', ackHash: 'd'.repeat(64) }) }, error: 'EDB_REVISION_PAYLOAD_TECHNICAL_ACK_MISMATCH' },
      { overrides: { company: 2, diary: 2, volume: 'vol-2', flight: 200, stage: 1001, ack: 'ack-2', payload: payload({ company: 2, flight: 200, stage: 1001, ack: 'ack-2', target: 'snap-2', ackHash: 'd'.repeat(64) }) }, error: 'EDB_REVISION_STAGE_SCOPE_MISMATCH' },
      // Same ordering rule applies to a cross-tenant acknowledgement: the
      // payload binding may fail before the lower-level scope trigger.
      { overrides: { company: 2, diary: 2, volume: 'vol-2', flight: 200, stage: 2001, ack: 'ack-1', payload: payload({ company: 2, flight: 200, stage: 2001, ack: 'ack-1', target: 'snap-1', ackHash: 'b'.repeat(64) }) }, error: 'EDB_REVISION_PAYLOAD_TECHNICAL_ACK_MISMATCH' },
    ];

    for (const { overrides, error } of cases) {
      const path = createDb();
      const result = insertRevision(path, overrides);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain(error);
    }
  });

  it('keeps lifecycle identity and persisted signature evidence immutable and rejects duplicate signature types', () => {
    const path = createDb();
    expect(insertRevision(path).code).toBe(0);
    expect(execSql(path, `
      INSERT INTO edb_registro_estado (revision_id, empresa_id, status, versao)
      VALUES ('rev-1', 1, 'DRAFT', 1);
      UPDATE edb_registro_estado SET status='READY_FOR_PIC_SIGNATURE', versao=2 WHERE revision_id='rev-1';
      INSERT INTO edb_assinaturas (
        id, empresa_id, revision_id, tipo, signer_nome, signed_at,
        canonical_payload_sha256, metodo, proof_reference
      ) VALUES (
        'sig-pic', 1, 'rev-1', 'PIC_FLIGHT_RECORD', 'PIC', '2026-09-05T10:30:00Z',
        '${'f'.repeat(64)}', 'ASYMMETRIC_DIGITAL_SIGNATURE', 'proof-pic'
      );
    `).code).toBe(0);

    const stateTenantSwap = execSql(path, `UPDATE edb_registro_estado SET empresa_id=2 WHERE revision_id='rev-1';`);
    expect(stateTenantSwap.code).not.toBe(0);
    expect(stateTenantSwap.stderr).toContain('EDB_STATE_IDENTITY_IMMUTABLE');

    const stateDelete = execSql(path, `DELETE FROM edb_registro_estado WHERE revision_id='rev-1';`);
    expect(stateDelete.code).not.toBe(0);
    expect(stateDelete.stderr).toContain('EDB_STATE_DELETE_FORBIDDEN');

    const duplicatePic = execSql(path, `
      INSERT INTO edb_assinaturas (
        id, empresa_id, revision_id, tipo, signer_nome, signed_at,
        canonical_payload_sha256, metodo, proof_reference
      ) VALUES (
        'sig-pic-2', 1, 'rev-1', 'PIC_FLIGHT_RECORD', 'PIC 2', '2026-09-05T10:31:00Z',
        '${'a'.repeat(64)}', 'ASYMMETRIC_DIGITAL_SIGNATURE', 'proof-pic-2'
      );
    `);
    expect(duplicatePic.code).not.toBe(0);
    expect(duplicatePic.stderr).toContain('UNIQUE constraint failed');

    const signatureDelete = execSql(path, `DELETE FROM edb_assinaturas WHERE id='sig-pic';`);
    expect(signatureDelete.code).not.toBe(0);
    expect(signatureDelete.stderr).toContain('EDB_SIGNATURE_DELETE_FORBIDDEN');
  });
});
