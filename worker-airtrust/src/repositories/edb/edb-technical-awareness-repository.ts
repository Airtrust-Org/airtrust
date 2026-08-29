import { canonicalJson } from '../../services/edb/canonicalization';
import type {
  EdbPicTechnicalAcknowledgement,
  EdbTechnicalSituationSnapshot,
} from '../../services/edb/technical-awareness';

export async function persistEdbTechnicalSituation(params: {
  db: D1Database;
  snapshot: EdbTechnicalSituationSnapshot;
  createdBy?: number | null;
}): Promise<void> {
  const { snapshot } = params;
  await params.db
    .prepare(
      `
      INSERT INTO edb_situacoes_tecnicas (
        id, empresa_id, voo_id, aeronave_id,
        aircraft_json, maintenance_json,
        technical_content_sha256, canonical_snapshot_sha256,
        captured_at, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    )
    .bind(
      snapshot.snapshotId,
      snapshot.operatorCompanyId,
      snapshot.sourceFlightId,
      snapshot.aircraft.aircraftId,
      canonicalJson(snapshot.aircraft),
      canonicalJson(snapshot.maintenance),
      snapshot.technicalContentSha256,
      snapshot.canonicalSnapshotSha256,
      snapshot.capturedAt,
      params.createdBy ?? null,
    )
    .run();
}

export async function appendEdbPicTechnicalAcknowledgement(params: {
  db: D1Database;
  acknowledgement: EdbPicTechnicalAcknowledgement;
  signerUserId?: number | null;
  authenticationEvidence?: unknown;
}): Promise<void> {
  const { acknowledgement } = params;
  const signature = acknowledgement.signature;
  if (signature.type !== 'PIC_TECHNICAL_ACK') {
    throw new Error('EDB_TECHNICAL_ACK_SIGNATURE_TYPE_INVALID');
  }

  await params.db
    .prepare(
      `
      INSERT INTO edb_ciencias_tecnicas_pic (
        id, empresa_id, situacao_tecnica_id, voo_id,
        signer_funcionario_id, signer_user_id, signer_nome, signer_codigo_anac,
        signed_at, canonical_snapshot_sha256, metodo, proof_reference,
        auth_evidence_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    )
    .bind(
      acknowledgement.acknowledgementId,
      acknowledgement.operatorCompanyId,
      acknowledgement.technicalSituationId,
      acknowledgement.sourceFlightId,
      signature.signer.employeeId,
      params.signerUserId ?? null,
      signature.signer.fullName,
      signature.signer.anacCode,
      signature.signedAt,
      signature.canonicalPayloadHashSha256,
      signature.method,
      signature.proofReference,
      params.authenticationEvidence === undefined
        ? null
        : canonicalJson(params.authenticationEvidence),
    )
    .run();
}

export interface EdbTechnicalSituationRow {
  id: string;
  empresa_id: number;
  voo_id: number;
  aeronave_id: number | null;
  aircraft_json: string;
  maintenance_json: string;
  technical_content_sha256: string;
  canonical_snapshot_sha256: string;
  captured_at: string;
  created_by: number | null;
  created_at: string;
}

export async function getLatestEdbTechnicalSituation(params: {
  db: D1Database;
  empresaId: number;
  vooId: number;
}): Promise<EdbTechnicalSituationRow | null> {
  return params.db
    .prepare(
      `
      SELECT id, empresa_id, voo_id, aeronave_id,
             aircraft_json, maintenance_json,
             technical_content_sha256, canonical_snapshot_sha256,
             captured_at, created_by, created_at
      FROM edb_situacoes_tecnicas
      WHERE empresa_id = ? AND voo_id = ?
      ORDER BY captured_at DESC, created_at DESC
      LIMIT 1
    `,
    )
    .bind(params.empresaId, params.vooId)
    .first<EdbTechnicalSituationRow>();
}
