import { canonicalJson, sha256Hex } from '../../services/edb/canonicalization';
import type {
  EdbFlightRecord,
  EdbLifecycleStatus,
  EdbSignatureProof,
} from '../../services/edb/contracts';
import { assertEdbPicTechnicalAcknowledgementScope } from './edb-technical-awareness-repository';

export interface PersistEdbDraftRevisionParams {
  empresaId: number;
  diarioId: number;
  volumeId: string;
  technicalAcknowledgementSignatureId: string;
  record: EdbFlightRecord;
  createdBy?: number | null;
}

export interface PersistedEdbRevision {
  revisionId: string;
  logicalRecordId: string;
  revision: number;
  canonicalPayloadSha256: string;
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function requireRecordIdentity(record: EdbFlightRecord): {
  logicalRecordId: string;
  revisionId: string;
} {
  const logicalRecordId = record.logicalRecordId?.trim();
  const revisionId = record.revisionId?.trim();
  if (!logicalRecordId) throw new Error('EDB_LOGICAL_RECORD_ID_REQUIRED');
  if (!revisionId) throw new Error('EDB_REVISION_ID_REQUIRED');
  return { logicalRecordId, revisionId };
}

export async function persistEdbDraftRevision(
  db: D1Database,
  params: PersistEdbDraftRevisionParams,
): Promise<PersistedEdbRevision> {
  if (params.record.status !== 'DRAFT') {
    throw new Error('Only DRAFT eDB records can be persisted as a new revision');
  }
  if (params.record.identity.operatorCompanyId !== params.empresaId) {
    throw new Error('eDB record tenant does not match persistence tenant');
  }
  if (params.record.source.sourceStageId === null) {
    throw new Error('eDB revision requires an explicit source stage');
  }
  const { logicalRecordId, revisionId } = requireRecordIdentity(params.record);
  if (params.record.correction.revision < 1) {
    throw new Error('eDB revision must be >= 1');
  }
  if (params.record.correction.revision === 1 && params.record.correction.supersedesRevisionId !== null) {
    throw new Error('EDB_INITIAL_REVISION_CANNOT_SUPERSEDE');
  }
  if (params.record.correction.revision > 1 && !params.record.correction.supersedesRevisionId?.trim()) {
    throw new Error('EDB_CORRECTION_SUPERSEDES_REVISION_REQUIRED');
  }
  if (!params.technicalAcknowledgementSignatureId.trim()) {
    throw new Error('eDB revision requires the preflight PIC technical acknowledgement signature');
  }
  const technicalProof = params.record.signatures.picTechnicalAcknowledgement;
  if (!technicalProof) {
    throw new Error('eDB revision payload requires the preflight PIC technical acknowledgement evidence');
  }
  if (technicalProof.type !== 'PIC_TECHNICAL_ACK') {
    throw new Error('EDB_TECHNICAL_ACK_SIGNATURE_TYPE_INVALID');
  }
  if (technicalProof.signatureId !== params.technicalAcknowledgementSignatureId) {
    throw new Error('EDB_TECHNICAL_ACK_SIGNATURE_ID_MISMATCH');
  }
  if (technicalProof.targetType !== 'TECHNICAL_SITUATION' || !technicalProof.targetId?.trim()) {
    throw new Error('EDB_TECHNICAL_ACK_TARGET_REQUIRED');
  }

  const persistedTechnicalAcknowledgement = await assertEdbPicTechnicalAcknowledgementScope({
    db,
    empresaId: params.empresaId,
    vooId: params.record.source.sourceFlightId,
    signatureId: params.technicalAcknowledgementSignatureId,
    expectedCanonicalSnapshotSha256: technicalProof.canonicalPayloadHashSha256,
  });
  if (persistedTechnicalAcknowledgement.situacao_tecnica_id !== technicalProof.targetId) {
    throw new Error('EDB_TECHNICAL_ACK_TARGET_MISMATCH');
  }

  const payload = canonicalJson(params.record);
  const canonicalPayloadSha256 = await sha256Hex(payload);

  await db.batch([
    db
      .prepare(
        `
        INSERT INTO edb_registro_revisoes (
          id, empresa_id, diario_id, volume_id, logical_record_id, revisao,
          supersedes_revision_id, motivo_correcao, contract_version,
          voo_id, rdv_id, rdv_versao, etapa_id, ciencia_tecnica_pic_id,
          payload_json, canonical_payload_sha256, captured_at, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `,
      )
      .bind(
        revisionId,
        params.empresaId,
        params.diarioId,
        params.volumeId,
        logicalRecordId,
        params.record.correction.revision,
        params.record.correction.supersedesRevisionId,
        params.record.correction.correctionReason,
        params.record.contractVersion,
        params.record.source.sourceFlightId,
        params.record.source.sourceRdvId,
        params.record.source.sourceRdvVersion,
        params.record.source.sourceStageId,
        params.technicalAcknowledgementSignatureId,
        payload,
        canonicalPayloadSha256,
        params.record.source.capturedAt,
        params.createdBy ?? null,
      ),
    db
      .prepare(
        `
        INSERT INTO edb_registro_estado (
          revision_id, empresa_id, status, versao, updated_by, updated_at
        ) VALUES (?, ?, 'DRAFT', 1, ?, datetime('now'))
      `,
      )
      .bind(revisionId, params.empresaId, params.createdBy ?? null),
  ]);

  return {
    revisionId,
    logicalRecordId,
    revision: params.record.correction.revision,
    canonicalPayloadSha256,
  };
}

export interface EdbRevisionStateRow {
  revision_id: string;
  empresa_id: number;
  status: EdbLifecycleStatus;
  versao: number;
  updated_by: number | null;
  updated_at: string;
}

export async function getEdbRevisionState(
  db: D1Database,
  empresaId: number,
  revisionId: string,
): Promise<EdbRevisionStateRow | null> {
  return db
    .prepare(
      `
      SELECT revision_id, empresa_id, status, versao, updated_by, updated_at
      FROM edb_registro_estado
      WHERE empresa_id = ? AND revision_id = ?
      LIMIT 1
    `,
    )
    .bind(empresaId, revisionId)
    .first<EdbRevisionStateRow>();
}

export async function transitionEdbRevisionState(params: {
  db: D1Database;
  empresaId: number;
  revisionId: string;
  expectedStatus: EdbLifecycleStatus;
  nextStatus: EdbLifecycleStatus;
  expectedVersion: number;
  updatedBy?: number | null;
}): Promise<void> {
  const result = await params.db
    .prepare(
      `
      UPDATE edb_registro_estado
      SET status = ?, versao = versao + 1, updated_by = ?, updated_at = datetime('now')
      WHERE empresa_id = ?
        AND revision_id = ?
        AND status = ?
        AND versao = ?
    `,
    )
    .bind(
      params.nextStatus,
      params.updatedBy ?? null,
      params.empresaId,
      params.revisionId,
      params.expectedStatus,
      params.expectedVersion,
    )
    .run();

  if ((result.meta.changes ?? 0) !== 1) {
    throw new Error('EDB_STATE_CONFLICT');
  }
}

export async function appendEdbSignature(params: {
  db: D1Database;
  empresaId: number;
  revisionId: string;
  signature: EdbSignatureProof;
  signerUserId?: number | null;
  authenticationEvidence?: unknown;
}): Promise<void> {
  if (params.signature.type === 'PIC_TECHNICAL_ACK') {
    throw new Error('EDB_TECHNICAL_ACK_MUST_USE_PREFLIGHT_REPOSITORY');
  }
  if (
    params.signature.targetType !== 'FINAL_RECORD_REVISION' ||
    params.signature.targetId !== params.revisionId
  ) {
    throw new Error('EDB_FINAL_SIGNATURE_TARGET_MISMATCH');
  }

  await params.db
    .prepare(
      `
      INSERT INTO edb_assinaturas (
        id, empresa_id, revision_id, tipo,
        signer_funcionario_id, signer_user_id, signer_nome, signer_codigo_anac,
        signed_at, canonical_payload_sha256, metodo, proof_reference,
        auth_evidence_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    )
    .bind(
      params.signature.signatureId,
      params.empresaId,
      params.revisionId,
      params.signature.type,
      params.signature.signer.employeeId,
      params.signerUserId ?? null,
      params.signature.signer.fullName,
      params.signature.signer.anacCode,
      params.signature.signedAt,
      params.signature.canonicalPayloadHashSha256,
      params.signature.method,
      params.signature.proofReference,
      params.authenticationEvidence === undefined
        ? null
        : canonicalJson(params.authenticationEvidence),
    )
    .run();
}

export async function queueEdbAnacTransmission(params: {
  db: D1Database;
  empresaId: number;
  revisionId: string;
  operationKind: string;
  idempotencyKey: string;
  payload?: unknown;
  outboxId?: string;
}): Promise<string> {
  const outboxId = params.outboxId ?? newId('edbout');
  await params.db
    .prepare(
      `
      INSERT INTO edb_anac_outbox (
        id, empresa_id, revision_id, operation_kind, idempotency_key,
        payload_json, status, attempt_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, datetime('now'), datetime('now'))
    `,
    )
    .bind(
      outboxId,
      params.empresaId,
      params.revisionId,
      params.operationKind,
      params.idempotencyKey,
      params.payload === undefined ? null : canonicalJson(params.payload),
    )
    .run();
  return outboxId;
}

export async function appendEdbAnacReceipt(params: {
  db: D1Database;
  empresaId: number;
  outboxId: string;
  externalReceiptId: string;
  receivedAt: string;
  receipt: unknown;
  httpStatus?: number | null;
  receiptId?: string;
}): Promise<string> {
  const receiptId = params.receiptId ?? newId('edbrcpt');
  await params.db
    .prepare(
      `
      INSERT INTO edb_anac_recibos (
        id, empresa_id, outbox_id, external_receipt_id,
        http_status, received_at, receipt_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    )
    .bind(
      receiptId,
      params.empresaId,
      params.outboxId,
      params.externalReceiptId,
      params.httpStatus ?? null,
      params.receivedAt,
      canonicalJson(params.receipt),
    )
    .run();
  return receiptId;
}
