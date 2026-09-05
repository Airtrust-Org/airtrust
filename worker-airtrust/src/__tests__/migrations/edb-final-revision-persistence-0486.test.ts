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
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-edb-0486-'));
  dirs.push(dir);
  const path = join(dir, 'test.sqlite');
  const setup = execSql(path, `
    CREATE TABLE aeronaves (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER,
      prefixo TEXT,
      deleted_at TEXT
    );
    INSERT INTO aeronaves (id, empresa_id, prefixo) VALUES (10, 1, 'PR-A');

    CREATE TABLE cv_voos (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      aeronave_id INTEGER,
      deleted_at TEXT
    );
    INSERT INTO cv_voos (id, empresa_id, aeronave_id) VALUES (100, 1, 10);

    CREATE TABLE cv_voo_etapas (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      voo_id INTEGER NOT NULL,
      deleted_at TEXT
    );
    INSERT INTO cv_voo_etapas (id, empresa_id, voo_id) VALUES (1001, 1, 100);
  `);
  expect(setup.code, setup.stderr).toBe(0);

  for (const migration of [MIG0483, MIG0485, MIG0486]) {
    const applied = execSql(path, readFileSync(migration, 'utf8'));
    expect(applied.code, applied.stderr).toBe(0);
  }

  const seed = execSql(path, `
    INSERT INTO edb_diarios (id, empresa_id, aeronave_id) VALUES (1, 1, 10);
    INSERT INTO edb_volumes (
      id, empresa_id, diario_id, numero_volume, opened_at, opening_act_json
    ) VALUES ('vol-1', 1, 1, 1, '2026-09-05T09:00:00Z', '{}');

    INSERT INTO edb_situacoes_tecnicas (
      id, empresa_id, voo_id, aeronave_id,
      aircraft_json, maintenance_json,
      technical_content_sha256, canonical_snapshot_sha256, captured_at
    ) VALUES (
      'snap-1', 1, 100, 10, '{}', '{}',
      '${'a'.repeat(64)}', '${'b'.repeat(64)}', '2026-09-05T09:30:00Z'
    );

    INSERT INTO edb_ciencias_tecnicas_pic (
      id, empresa_id, situacao_tecnica_id, voo_id,
      signer_nome, signed_at, canonical_snapshot_sha256,
      metodo, proof_reference
    ) VALUES (
      'tech-ack-1', 1, 'snap-1', 100,
      'PIC', '2026-09-05T09:40:00Z', '${'b'.repeat(64)}',
      'ASYMMETRIC_DIGITAL_SIGNATURE', 'proof-tech'
    );
  `);
  expect(seed.code, seed.stderr).toBe(0);
  return path;
}

function payload(params: {
  logical?: string;
  revisionId?: string;
  revision?: number;
  supersedes?: string | null;
  reason?: string | null;
  ackId?: string;
  ackTarget?: string;
  ackHash?: string;
  company?: number;
  flight?: number;
  stage?: number;
} = {}) {
  return JSON.stringify({
    contractVersion: 'edb.regulatory.v1',
    logicalRecordId: params.logical ?? 'logical-1',
    revisionId: params.revisionId ?? 'rev-1',
    status: 'DRAFT',
    identity: { operatorCompanyId: params.company ?? 1 },
    source: {
      sourceFlightId: params.flight ?? 100,
      sourceStageId: params.stage ?? 1001,
    },
    correction: {
      revision: params.revision ?? 1,
      supersedesRevisionId: params.supersedes ?? null,
      correctionReason: params.reason ?? null,
    },
    signatures: {
      picTechnicalAcknowledgement: {
        signatureId: params.ackId ?? 'tech-ack-1',
        targetId: params.ackTarget ?? 'snap-1',
        canonicalPayloadHashSha256: params.ackHash ?? 'b'.repeat(64),
      },
    },
  });
}

function insertRevision(path: string, params: {
  id?: string;
  logical?: string;
  revision?: number;
  supersedes?: string | null;
  reason?: string | null;
  payloadOverride?: string;
} = {}) {
  const id = params.id ?? 'rev-1';
  const logical = params.logical ?? 'logical-1';
  const revision = params.revision ?? 1;
  const supersedes = params.supersedes ?? null;
  const reason = params.reason ?? null;
  const json = params.payloadOverride ?? payload({
    logical,
    revisionId: id,
    revision,
    supersedes,
    reason,
  });
  const sql = `
    INSERT INTO edb_registro_revisoes (
      id, empresa_id, diario_id, volume_id, logical_record_id, revisao,
      supersedes_revision_id, motivo_correcao, contract_version,
      voo_id, etapa_id, ciencia_tecnica_pic_id,
      payload_json, canonical_payload_sha256, captured_at
    ) VALUES (
      '${id}', 1, 1, 'vol-1', '${logical}', ${revision},
      ${supersedes === null ? 'NULL' : `'${supersedes}'`},
      ${reason === null ? 'NULL' : `'${reason}'`},
      'edb.regulatory.v1',
      100, 1001, 'tech-ack-1',
      '${json.replaceAll("'", "''")}',
      '${'c'.repeat(64)}', '2026-09-05T10:00:00Z'
    );
  `;
  return execSql(path, sql);
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('0486 eDB final revision persistence', () => {
  it('persists one immutable revision bound to tenant, stage and technical acknowledgement', () => {
    const path = createDb();
    const inserted = insertRevision(path);
    expect(inserted.code, inserted.stderr).toBe(0);

    const state = execSql(path, `
      INSERT INTO edb_registro_estado (revision_id, empresa_id, status, versao)
      VALUES ('rev-1', 1, 'DRAFT', 1);
    `);
    expect(state.code, state.stderr).toBe(0);

    const mutate = execSql(path, `UPDATE edb_registro_revisoes SET logical_record_id='changed' WHERE id='rev-1';`);
    expect(mutate.code).not.toBe(0);
    expect(mutate.stderr).toContain('EDB_REVISION_UPDATE_FORBIDDEN');

    const del = execSql(path, `DELETE FROM edb_registro_revisoes WHERE id='rev-1';`);
    expect(del.code).not.toBe(0);
    expect(del.stderr).toContain('EDB_REVISION_DELETE_FORBIDDEN');
  });

  it('rejects payload identity and technical acknowledgement mismatches', () => {
    const path = createDb();

    const badTenant = insertRevision(path, {
      payloadOverride: payload({ company: 2 }),
    });
    expect(badTenant.code).not.toBe(0);
    expect(badTenant.stderr).toContain('EDB_REVISION_PAYLOAD_TENANT_MISMATCH');

    const badStage = insertRevision(path, {
      payloadOverride: payload({ stage: 999 }),
    });
    expect(badStage.code).not.toBe(0);
    expect(badStage.stderr).toContain('EDB_REVISION_PAYLOAD_STAGE_MISMATCH');

    const badAck = insertRevision(path, {
      payloadOverride: payload({ ackHash: 'd'.repeat(64) }),
    });
    expect(badAck.code).not.toBe(0);
    expect(badAck.stderr).toContain('EDB_REVISION_PAYLOAD_TECHNICAL_ACK_MISMATCH');
  });

  it('requires an exact chronological correction chain', () => {
    const path = createDb();
    expect(insertRevision(path).code).toBe(0);

    const missingPrior = insertRevision(path, {
      id: 'rev-3',
      revision: 3,
      supersedes: 'rev-2',
      reason: 'correction',
    });
    expect(missingPrior.code).not.toBe(0);
    expect(missingPrior.stderr).toContain('EDB_REVISION_SUPERSESSION_CHAIN_MISMATCH');

    const second = insertRevision(path, {
      id: 'rev-2',
      revision: 2,
      supersedes: 'rev-1',
      reason: 'correct field',
    });
    expect(second.code, second.stderr).toBe(0);
  });

  it('enforces local lifecycle order and optimistic version increments', () => {
    const path = createDb();
    expect(insertRevision(path).code).toBe(0);
    expect(execSql(path, `
      INSERT INTO edb_registro_estado (revision_id, empresa_id, status, versao)
      VALUES ('rev-1', 1, 'DRAFT', 1);
    `).code).toBe(0);

    const skip = execSql(path, `
      UPDATE edb_registro_estado SET status='PIC_SIGNED', versao=2 WHERE revision_id='rev-1';
    `);
    expect(skip.code).not.toBe(0);
    expect(skip.stderr).toContain('EDB_STATE_TRANSITION_NOT_ALLOWED');

    const badVersion = execSql(path, `
      UPDATE edb_registro_estado SET status='READY_FOR_PIC_SIGNATURE', versao=3 WHERE revision_id='rev-1';
    `);
    expect(badVersion.code).not.toBe(0);
    expect(badVersion.stderr).toContain('EDB_STATE_VERSION_MUST_INCREMENT');

    const ready = execSql(path, `
      UPDATE edb_registro_estado SET status='READY_FOR_PIC_SIGNATURE', versao=2 WHERE revision_id='rev-1';
    `);
    expect(ready.code, ready.stderr).toBe(0);
  });

  it('requires signatures in order and stores them immutably', () => {
    const path = createDb();
    expect(insertRevision(path).code).toBe(0);
    expect(execSql(path, `
      INSERT INTO edb_registro_estado (revision_id, empresa_id, status, versao)
      VALUES ('rev-1', 1, 'DRAFT', 1);
      UPDATE edb_registro_estado SET status='READY_FOR_PIC_SIGNATURE', versao=2
      WHERE revision_id='rev-1';
    `).code).toBe(0);

    const operatorEarly = execSql(path, `
      INSERT INTO edb_assinaturas (
        id, empresa_id, revision_id, tipo, signer_nome, signed_at,
        canonical_payload_sha256, metodo, proof_reference
      ) VALUES (
        'sig-op-early', 1, 'rev-1', 'OPERATOR_RECORD', 'Operator',
        '2026-09-05T11:00:00Z', '${'e'.repeat(64)}',
        'ASYMMETRIC_DIGITAL_SIGNATURE', 'proof-op'
      );
    `);
    expect(operatorEarly.code).not.toBe(0);
    expect(operatorEarly.stderr).toContain('EDB_OPERATOR_SIGNATURE_STATE_INVALID');

    const pic = execSql(path, `
      INSERT INTO edb_assinaturas (
        id, empresa_id, revision_id, tipo, signer_nome, signed_at,
        canonical_payload_sha256, metodo, proof_reference
      ) VALUES (
        'sig-pic', 1, 'rev-1', 'PIC_FLIGHT_RECORD', 'PIC',
        '2026-09-05T10:30:00Z', '${'d'.repeat(64)}',
        'ASYMMETRIC_DIGITAL_SIGNATURE', 'proof-pic'
      );
      UPDATE edb_registro_estado SET status='PIC_SIGNED', versao=3
      WHERE revision_id='rev-1';
    `);
    expect(pic.code, pic.stderr).toBe(0);

    const operator = execSql(path, `
      INSERT INTO edb_assinaturas (
        id, empresa_id, revision_id, tipo, signer_nome, signed_at,
        canonical_payload_sha256, metodo, proof_reference
      ) VALUES (
        'sig-op', 1, 'rev-1', 'OPERATOR_RECORD', 'Operator',
        '2026-09-05T11:00:00Z', '${'e'.repeat(64)}',
        'ELECTRONIC_SIGNATURE_WITH_CERTIFICATE', 'proof-op'
      );
      UPDATE edb_registro_estado SET status='OPERATOR_SIGNED', versao=4
      WHERE revision_id='rev-1';
    `);
    expect(operator.code, operator.stderr).toBe(0);

    const mutate = execSql(path, `UPDATE edb_assinaturas SET signer_nome='Other' WHERE id='sig-pic';`);
    expect(mutate.code).not.toBe(0);
    expect(mutate.stderr).toContain('EDB_SIGNATURE_UPDATE_FORBIDDEN');
  });

  it('contains no external ANAC lifecycle or transport schema', () => {
    const sql = readFileSync(MIG0486, 'utf8');
    expect(sql).not.toMatch(/ANAC_PENDING|ANAC_SYNCED|edb_anac_/);
    expect(sql).not.toMatch(/tempo_ifr_real_minutos|tempo_ifr_simulado_minutos|\bciclos\b/i);
  });
});
