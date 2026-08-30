import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

const EMPRESA_ID = 91001;
const AIRCRAFT_ID = 91002;
const FLIGHT_ID = 91003;
const STAGE_ID = 91004;
const DIARY_ID = 1;
const VOLUME_ID = 'qa-edb-persisted-volume-1';
const REVISION_ID = 'qa-edb-persisted-r1';
const TECHNICAL_ID = 'qa-edb-persisted-tech-1';
const TECHNICAL_ACK_ID = 'qa-edb-persisted-tech-ack-1';
const ZERO_HASH = '0'.repeat(64);
const ONE_HASH = '1'.repeat(64);
const TWO_HASH = '2'.repeat(64);

function applyEdbSchema(sqlite: DatabaseSync): void {
  sqlite.exec(`
    CREATE TABLE cv_voo_etapas (id INTEGER PRIMARY KEY);
    CREATE TABLE cv_voo_tripulantes (id INTEGER PRIMARY KEY);
    INSERT INTO cv_voo_etapas (id) VALUES (${STAGE_ID});
  `);

  for (const migration of [
    '0477_edb_operational_core.sql',
    '0478_edb_anac_receipt_integrity.sql',
    '0479_edb_relational_integrity.sql',
    '0480_edb_diary_lifecycle_integrity.sql',
  ]) {
    const url = new URL(`../../../migrations/${migration}`, import.meta.url);
    sqlite.exec(readFileSync(fileURLToPath(url.href), 'utf8'));
  }
}

function scalar(sqlite: DatabaseSync, sql: string, column: string): unknown {
  return (sqlite.prepare(sql).get() as Record<string, unknown> | undefined)?.[column];
}

describe('eDB full persisted lifecycle integration in isolated SQLite', () => {
  it('enforces the governed persisted lifecycle and immutable evidence chain without remote side effects', () => {
    const sqlite = new NodeDatabaseSync(':memory:');

    try {
      applyEdbSchema(sqlite);

      sqlite.exec(`
        INSERT INTO edb_diarios (
          id, empresa_id, aeronave_id, regulamento_operador, status, created_by, updated_by
        ) VALUES (
          ${DIARY_ID}, ${EMPRESA_ID}, ${AIRCRAFT_ID}, 'RBAC135', 'ATIVO', 91012, 91012
        );

        INSERT INTO edb_volumes (
          id, empresa_id, diario_id, numero_volume, status,
          aberto_em, aberto_por, ato_abertura_json
        ) VALUES (
          '${VOLUME_ID}', ${EMPRESA_ID}, ${DIARY_ID}, 1, 'ABERTO',
          '2026-08-30T08:00:00.000Z', 91012,
          '{"aircraftRegistrationMarks":"QA-PST","act":{"type":"OPENING","occurredAt":"2026-08-30T08:00:00.000Z","actor":{"employeeId":91012,"fullName":"QA Persisted Operator","anacCode":null},"observations":"QA isolated persisted lifecycle"}}'
        );

        INSERT INTO edb_situacoes_tecnicas (
          id, empresa_id, voo_id, aeronave_id, aircraft_json, maintenance_json,
          technical_content_sha256, canonical_snapshot_sha256, captured_at, created_by
        ) VALUES (
          '${TECHNICAL_ID}', ${EMPRESA_ID}, ${FLIGHT_ID}, ${AIRCRAFT_ID},
          '{"registrationMarks":"QA-PST"}', '{"synthetic":true}',
          '${ZERO_HASH}', '${ONE_HASH}', '2026-08-30T10:00:00.000Z', 91012
        );

        INSERT INTO edb_ciencias_tecnicas_pic (
          id, empresa_id, situacao_tecnica_id, voo_id,
          signer_funcionario_id, signer_user_id, signer_nome, signer_codigo_anac,
          signed_at, canonical_snapshot_sha256, metodo, proof_reference, auth_evidence_json
        ) VALUES (
          '${TECHNICAL_ACK_ID}', ${EMPRESA_ID}, '${TECHNICAL_ID}', ${FLIGHT_ID},
          91011, 91011, 'QA Persisted PIC', 'QA91011',
          '2026-08-30T10:30:00.000Z', '${ONE_HASH}',
          'ASYMMETRIC_DIGITAL_SIGNATURE', 'qa-proof/persisted/technical',
          '{"synthetic":true,"isolated":true}'
        );

        INSERT INTO edb_registro_revisoes (
          id, empresa_id, diario_id, volume_id, logical_record_id, revisao,
          supersedes_revision_id, motivo_correcao, contract_version,
          voo_id, rdv_id, rdv_versao, etapa_id, ciencia_tecnica_pic_id,
          payload_json, canonical_payload_sha256, captured_at, created_by
        ) VALUES (
          '${REVISION_ID}', ${EMPRESA_ID}, ${DIARY_ID}, '${VOLUME_ID}',
          'qa-edb-persisted-flight-stage', 1, NULL, NULL, 'edb.regulatory.v1',
          ${FLIGHT_ID}, 91005, 1, ${STAGE_ID}, '${TECHNICAL_ACK_ID}',
          '{"synthetic":true}', '${TWO_HASH}', '2026-08-30T12:05:00.000Z', 91012
        );

        INSERT INTO edb_registro_estado (
          revision_id, empresa_id, status, versao, updated_by
        ) VALUES ('${REVISION_ID}', ${EMPRESA_ID}, 'DRAFT', 1, 91012);

        UPDATE edb_registro_estado
        SET status = 'READY_FOR_PIC_SIGNATURE', versao = 2, updated_by = 91012
        WHERE empresa_id = ${EMPRESA_ID} AND revision_id = '${REVISION_ID}';

        INSERT INTO edb_assinaturas (
          id, empresa_id, revision_id, tipo,
          signer_funcionario_id, signer_user_id, signer_nome, signer_codigo_anac,
          signed_at, canonical_payload_sha256, metodo, proof_reference, auth_evidence_json
        ) VALUES (
          'qa-persisted-pic-flight-record', ${EMPRESA_ID}, '${REVISION_ID}', 'PIC_FLIGHT_RECORD',
          91011, 91011, 'QA Persisted PIC', 'QA91011',
          '2026-08-30T12:10:00.000Z', '${TWO_HASH}',
          'ASYMMETRIC_DIGITAL_SIGNATURE', 'qa-proof/persisted/pic', '{"synthetic":true}'
        );

        UPDATE edb_registro_estado
        SET status = 'PIC_SIGNED', versao = 3, updated_by = 91011
        WHERE empresa_id = ${EMPRESA_ID} AND revision_id = '${REVISION_ID}';

        INSERT INTO edb_assinaturas (
          id, empresa_id, revision_id, tipo,
          signer_funcionario_id, signer_user_id, signer_nome, signer_codigo_anac,
          signed_at, canonical_payload_sha256, metodo, proof_reference, auth_evidence_json
        ) VALUES (
          'qa-persisted-operator-record', ${EMPRESA_ID}, '${REVISION_ID}', 'OPERATOR_RECORD',
          91012, 91012, 'QA Persisted Operator', NULL,
          '2026-08-30T12:20:00.000Z', '${TWO_HASH}',
          'ASYMMETRIC_DIGITAL_SIGNATURE', 'qa-proof/persisted/operator', '{"synthetic":true}'
        );

        UPDATE edb_registro_estado
        SET status = 'OPERATOR_SIGNED', versao = 4, updated_by = 91012
        WHERE empresa_id = ${EMPRESA_ID} AND revision_id = '${REVISION_ID}';

        INSERT INTO edb_anac_outbox (
          id, empresa_id, revision_id, operation_kind, idempotency_key,
          payload_json, status, attempt_count
        ) VALUES (
          'qa-edb-persisted-outbox-1', ${EMPRESA_ID}, '${REVISION_ID}', 'CREATE',
          'qa-edb-persisted:create:r1', '{"synthetic":true,"externalTransmission":false}',
          'PENDING', 0
        );

        UPDATE edb_registro_estado
        SET status = 'ANAC_PENDING', versao = 5, updated_by = 91012
        WHERE empresa_id = ${EMPRESA_ID} AND revision_id = '${REVISION_ID}';
      `);

      expect(
        scalar(
          sqlite,
          `SELECT status FROM edb_registro_estado WHERE revision_id = '${REVISION_ID}'`,
          'status',
        ),
      ).toBe('ANAC_PENDING');
      expect(scalar(sqlite, 'SELECT COUNT(*) AS count FROM edb_anac_recibos', 'count')).toBe(0);

      sqlite.exec(`
        INSERT INTO edb_discrepancias_tecnicas (
          id, empresa_id, revision_id, descricao,
          detectado_por_funcionario_id, detectado_por_nome, detectado_por_codigo_anac,
          detectado_em, created_at
        ) VALUES (
          'qa-persisted-disc-1', ${EMPRESA_ID}, '${REVISION_ID}',
          'QA isolated persisted discrepancy', 91011, 'QA Persisted PIC', 'QA91011',
          '2026-08-30T11:50:00.000Z', '2026-08-30T12:55:00.000Z'
        );

        INSERT INTO edb_acoes_manutencao (
          id, empresa_id, discrepancia_id, tipo, referencia_acao_id,
          descricao, executado_por_funcionario_id, executado_por_nome, executado_em, evidencia_json
        ) VALUES (
          'qa-persisted-deferred-1', ${EMPRESA_ID}, 'qa-persisted-disc-1',
          'DEFERRED_ACTION_AUTHORIZATION', NULL, 'QA isolated deferred authorization',
          91013, 'QA Persisted Maintenance', '2026-08-30T13:00:00.000Z',
          '{"reference":"QA-MEL-PERSISTED-1"}'
        );

        INSERT INTO edb_acoes_manutencao (
          id, empresa_id, discrepancia_id, tipo, referencia_acao_id,
          descricao, executado_por_funcionario_id, executado_por_nome, executado_em, evidencia_json
        ) VALUES (
          'qa-persisted-corrective-1', ${EMPRESA_ID}, 'qa-persisted-disc-1',
          'CORRECTIVE_ACTION', NULL, 'QA isolated corrective action',
          91013, 'QA Persisted Maintenance', '2026-08-30T13:30:00.000Z',
          '{"reference":"QA-OS-PERSISTED-1"}'
        );

        INSERT INTO edb_acoes_manutencao (
          id, empresa_id, discrepancia_id, tipo, referencia_acao_id,
          descricao, executado_por_funcionario_id, executado_por_nome, executado_em, evidencia_json
        ) VALUES (
          'qa-persisted-rts-1', ${EMPRESA_ID}, 'qa-persisted-disc-1',
          'RTS_APPROVAL', 'qa-persisted-corrective-1', 'QA isolated return to service',
          91013, 'QA Persisted Maintenance', '2026-08-30T13:45:00.000Z',
          '{"reference":"QA-RTS-PERSISTED-1"}'
        );
      `);

      expect(
        scalar(
          sqlite,
          "SELECT COUNT(*) AS count FROM edb_acoes_manutencao WHERE discrepancia_id = 'qa-persisted-disc-1'",
          'count',
        ),
      ).toBe(3);

      sqlite.exec(`
        INSERT INTO edb_auditoria_eventos (
          id, empresa_id, diario_id, voo_id, situacao_tecnica_id, revision_id,
          event_type, actor_user_id, actor_funcionario_id, actor_json,
          payload_json, previous_event_hash_sha256, event_hash_sha256, occurred_at
        ) VALUES (
          'qa-persisted-audit-1', ${EMPRESA_ID}, ${DIARY_ID}, ${FLIGHT_ID},
          '${TECHNICAL_ID}', '${REVISION_ID}', 'PIC_FLIGHT_RECORD_SIGNED',
          91011, 91011, '{"employeeId":91011,"fullName":"QA Persisted PIC","anacCode":"QA91011"}',
          '{"signatureId":"qa-persisted-pic-flight-record"}', NULL, '${ONE_HASH}',
          '2026-08-30T12:10:00.000Z'
        );

        INSERT INTO edb_auditoria_eventos (
          id, empresa_id, diario_id, voo_id, situacao_tecnica_id, revision_id,
          event_type, actor_user_id, actor_funcionario_id, actor_json,
          payload_json, previous_event_hash_sha256, event_hash_sha256, occurred_at
        ) VALUES (
          'qa-persisted-audit-2', ${EMPRESA_ID}, ${DIARY_ID}, ${FLIGHT_ID},
          '${TECHNICAL_ID}', '${REVISION_ID}', 'ANAC_SYNC_QUEUED',
          91012, 91012, '{"employeeId":91012,"fullName":"QA Persisted Operator","anacCode":null}',
          '{"outboxId":"qa-edb-persisted-outbox-1"}', '${ONE_HASH}', '${TWO_HASH}',
          '2026-08-30T12:25:00.000Z'
        );
      `);

      expect(
        scalar(sqlite, `SELECT COUNT(*) AS count FROM edb_auditoria_eventos WHERE diario_id = ${DIARY_ID}`, 'count'),
      ).toBe(2);

      sqlite.exec(`
        INSERT INTO edb_incidentes_integridade (
          id, empresa_id, diario_id, volume_id, tipo, ocorrido_em, descricao,
          police_report_reference, anac_notification_reference, status,
          reconstitution_evidence_json, created_by, updated_by
        ) VALUES (
          'qa-persisted-incident-1', ${EMPRESA_ID}, ${DIARY_ID}, '${VOLUME_ID}',
          'CORRUPTION', '2026-08-30T14:00:00.000Z', 'QA isolated persisted integrity incident',
          NULL, NULL, 'OPEN',
          '{"policeReportedAt":null,"anacNotifiedAt":null,"reconstitutionCompletedAt":null,"newDiaryOpeningObservation":null}',
          91012, 91012
        );

        UPDATE edb_incidentes_integridade
        SET police_report_reference = 'QA-BO-PERSISTED-1',
            reconstitution_evidence_json = '{"policeReportedAt":"2026-08-30T14:10:00.000Z","anacNotifiedAt":null,"reconstitutionCompletedAt":null,"newDiaryOpeningObservation":null}',
            updated_by = 91012
        WHERE id = 'qa-persisted-incident-1';

        UPDATE edb_incidentes_integridade
        SET anac_notification_reference = 'QA-INTERNAL-ANAC-PERSISTED-1',
            reconstitution_evidence_json = '{"policeReportedAt":"2026-08-30T14:10:00.000Z","anacNotifiedAt":"2026-08-30T14:20:00.000Z","reconstitutionCompletedAt":null,"newDiaryOpeningObservation":null}',
            updated_by = 91012
        WHERE id = 'qa-persisted-incident-1';

        UPDATE edb_incidentes_integridade
        SET status = 'RECONSTITUTED',
            reconstitution_evidence_json = '{"policeReportedAt":"2026-08-30T14:10:00.000Z","anacNotifiedAt":"2026-08-30T14:20:00.000Z","reconstitutionCompletedAt":"2026-08-30T14:30:00.000Z","newDiaryOpeningObservation":null}',
            updated_by = 91012
        WHERE id = 'qa-persisted-incident-1';
      `);

      expect(
        scalar(
          sqlite,
          "SELECT status FROM edb_incidentes_integridade WHERE id = 'qa-persisted-incident-1'",
          'status',
        ),
      ).toBe('RECONSTITUTED');

      sqlite.exec(`
        UPDATE edb_volumes
        SET status = 'ENCERRADO',
            encerrado_em = '2026-08-30T15:00:00.000Z',
            encerrado_por = 91012,
            ato_encerramento_json = '{"act":{"type":"CLOSING","occurredAt":"2026-08-30T15:00:00.000Z","actor":{"employeeId":91012,"fullName":"QA Persisted Operator","anacCode":null},"observations":"QA isolated persisted lifecycle completed"}}',
            retencao_minima_ate = '2031-08-31'
        WHERE empresa_id = ${EMPRESA_ID} AND id = '${VOLUME_ID}';

        UPDATE edb_diarios
        SET status = 'ENCERRADO', updated_by = 91012
        WHERE empresa_id = ${EMPRESA_ID} AND id = ${DIARY_ID};
      `);

      expect(
        scalar(sqlite, `SELECT status FROM edb_diarios WHERE id = ${DIARY_ID}`, 'status'),
      ).toBe('ENCERRADO');
      expect(
        scalar(sqlite, `SELECT status FROM edb_volumes WHERE id = '${VOLUME_ID}'`, 'status'),
      ).toBe('ENCERRADO');

      expect(() =>
        sqlite.exec(`UPDATE edb_registro_revisoes SET payload_json = '{}' WHERE id = '${REVISION_ID}'`),
      ).toThrow(/EDB_REVISION_IMMUTABLE/);
      expect(() =>
        sqlite.exec(`UPDATE edb_assinaturas SET signer_nome = 'tampered' WHERE revision_id = '${REVISION_ID}'`),
      ).toThrow(/EDB_SIGNATURE_IMMUTABLE/);
      expect(() =>
        sqlite.exec(`UPDATE edb_auditoria_eventos SET payload_json = '{}' WHERE empresa_id = ${EMPRESA_ID}`),
      ).toThrow(/EDB_AUDIT_IMMUTABLE/);
      expect(() =>
        sqlite.exec(`DELETE FROM edb_diarios WHERE id = ${DIARY_ID}`),
      ).toThrow(/EDB_DIARY_IMMUTABLE/);
    } finally {
      sqlite.close();
    }
  });
});
