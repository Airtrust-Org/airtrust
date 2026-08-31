import {
  canonicalJson,
  hashSignableEdbPayload,
  sha256Hex,
} from '../../services/edb/canonicalization';
import type {
  EdbFlightRecord,
  EdbLifecycleStatus,
  EdbSignatureMethod,
  EdbSignatureProof,
} from '../../services/edb/contracts';
import { isPersistedEdbFlightRecord } from '../../services/edb/persisted-record-validation';
import { validateForPicFlightSignature } from '../../services/edb/regulatory-validation';
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

interface StoredEdbRevisionRow {
  id: string;
  empresa_id: number;
  logical_record_id: string;
  payload_json: string;
  canonical_payload_sha256: string;
  status: EdbLifecycleStatus;
  state_version: number;
}

interface StoredFinalSignatureRow {
  id: string;
  empresa_id: number;
  revision_id: string;
  tipo: 'PIC_FLIGHT_RECORD' | 'OPERATOR_RECORD';
  signer_funcionario_id: number | null;
  signer_nome: string;
  signer_codigo_anac: string | null;
  signed_at: string;
  canonical_payload_sha256: string;
  metodo: string;
  proof_reference: string;
}

interface StoredAnacOutboxRow {
  id: string;
  empresa_id: number;
  revision_id: string;
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function requireText(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function requireTimestamp(value: string, code: string): string {
  const normalized = requireText(value, code);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(code);
  return normalized;
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

function parseSignatureMethod(value: string): EdbSignatureMethod {
  if (
    value !== 'ASYMMETRIC_DIGITAL_SIGNATURE' &&
    value !== 'ELECTRONIC_SIGNATURE_WITH_CERTIFICATE'
  ) {
    throw new Error('EDB_STORED_SIGNATURE_METHOD_INVALID');
  }
  return value;
}

async function loadPersistedEdbRevision(params: {
  db: D1Database;
  empresaId: number;
  revisionId: string;
}): Promise<{ row: StoredEdbRevisionRow; record: EdbFlightRecord }> {
  const row = await params.db
    .prepare(
      `
      SELECT r.id, r.empresa_id, r.logical_record_id,
             r.payload_json, r.canonical_payload_sha256,
             s.status, s.versao AS state_version
      FROM edb_registro_revisoes r
      INNER JOIN edb_registro_estado s
        ON s.revision_id = r.id AND s.empresa_id = r.empresa_id
      WHERE r.empresa_id = ? AND r.id = ?
      LIMIT 1
    `,
    )
    .bind(params.empresaId, params.revisionId)
    .first<StoredEdbRevisionRow>();

  if (!row) throw new Error('EDB_REVISION_NOT_FOUND_OR_SCOPE_MISMATCH');

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.payload_json);
  } catch {
    throw new Error('EDB_REVISION_PAYLOAD_INVALID_JSON');
  }
  if (!isPersistedEdbFlightRecord(parsed)) throw new Error('EDB_REVISION_PAYLOAD_INVALID');

  const recalculatedHash = await sha256Hex(canonicalJson(parsed));
  if (recalculatedHash !== row.canonical_payload_sha256) {
    throw new Error('EDB_REVISION_PERSISTED_HASH_MISMATCH');
  }
  if (parsed.logicalRecordId !== row.logical_record_id || parsed.revisionId !== row.id) {
    throw new Error('EDB_REVISION_IDENTITY_MISMATCH');
  }
  if (parsed.identity.operatorCompanyId !== row.empresa_id) {
    throw new Error('EDB_REVISION_TENANT_MISMATCH');
  }

  return { row, record: parsed };
}

async function loadStoredFinalSignature(params: {
  db: D1Database;
  empresaId: number;
  revisionId: string;
  type: 'PIC_FLIGHT_RECORD' | 'OPERATOR_RECORD';
}): Promise<EdbSignatureProof | null> {
  const row = await params.db
    .prepare(
      `
      SELECT id, empresa_id, revision_id, tipo,
             signer_funcionario_id, signer_nome, signer_codigo_anac,
             signed_at, canonical_payload_sha256, metodo, proof_reference
      FROM edb_assinaturas
      WHERE empresa_id = ? AND revision_id = ? AND tipo = ?
      LIMIT 1
    `,
    )
    .bind(params.empresaId, params.revisionId, params.type)
    .first<StoredFinalSignatureRow>();

  if (!row) return null;
  if (row.empresa_id !== params.empresaId || row.revision_id !== params.revisionId || row.tipo !== params.type) {
    throw new Error('EDB_STORED_SIGNATURE_SCOPE_MISMATCH');
  }
  if (!row.id.trim() || !row.signer_nome.trim() || !row.proof_reference.trim()) {
    throw new Error('EDB_STORED_SIGNATURE_INVALID');
  }

  return {
    signatureId: row.id,
    type: row.tipo,
    targetType: 'FINAL_RECORD_REVISION',
    targetId: row.revision_id,
    signer: {
      employeeId: row.signer_funcionario_id,
      fullName: row.signer_nome,
      anacCode: row.signer_codigo_anac,
    },
    signedAt: row.signed_at,
    canonicalPayloadHashSha256: row.canonical_payload_sha256,
    method: parseSignatureMethod(row.metodo),
    proofReference: row.proof_reference,
  };
}

async function assertStoredPicSignatureIntegrity(params: {
  db: D1Database;
  empresaId: number;
  revisionId: string;
  record: EdbFlightRecord;
}): Promise<EdbSignatureProof> {
  const pic = await loadStoredFinalSignature({ ...params, type: 'PIC_FLIGHT_RECORD' });
  if (!pic) throw new Error('EDB_PIC_FLIGHT_SIGNATURE_NOT_PERSISTED');
  const expectedPicHash = await hashSignableEdbPayload(params.record, 'PIC_FLIGHT_RECORD');
  if (pic.canonicalPayloadHashSha256 !== expectedPicHash) {
    throw new Error('EDB_PIC_FLIGHT_SIGNATURE_PERSISTED_HASH_MISMATCH');
  }
  return pic;
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
  if (params.record.correction.revision < 1) throw new Error('eDB revision must be >= 1');
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
  if (technicalProof.type !== 'PIC_TECHNICAL_ACK') throw new Error('EDB_TECHNICAL_ACK_SIGNATURE_TYPE_INVALID');
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

export async function markEdbRevisionReadyForPicSignature(params: {
  db: D1Database;
  empresaId: number;
  revisionId: string;
  updatedBy?: number | null;
}): Promise<void> {
  const { row, record } = await loadPersistedEdbRevision(params);
  if (row.status !== 'DRAFT') throw new Error('EDB_READY_TRANSITION_REQUIRES_DRAFT');

  const validation = validateForPicFlightSignature(record);
  const blockingCodes = validation.issues
    .filter((issue) => issue.severity === 'BLOCKING')
    .map((issue) => issue.code);
  if (blockingCodes.length > 0) {
    throw new Error(`EDB_REVISION_NOT_READY:${blockingCodes.join(',')}`);
  }

  const result = await params.db
    .prepare(
      `
      UPDATE edb_registro_estado
      SET status = 'READY_FOR_PIC_SIGNATURE', versao = versao + 1,
          updated_by = ?, updated_at = datetime('now')
      WHERE empresa_id = ? AND revision_id = ? AND status = 'DRAFT' AND versao = ?
    `,
    )
    .bind(params.updatedBy ?? null, params.empresaId, params.revisionId, row.state_version)
    .run();
  if ((result.meta.changes ?? 0) !== 1) throw new Error('EDB_STATE_CONFLICT');
}

const ALLOWED_ADMINISTRATIVE_TRANSITIONS: ReadonlySet<string> = new Set([
  'PIC_SIGNED>SUPERSEDED',
  'OPERATOR_SIGNED>SUPERSEDED',
  'ANAC_PENDING>SUPERSEDED',
  'ANAC_SYNCED>SUPERSEDED',
  'DRAFT>CANCELLED',
  'READY_FOR_PIC_SIGNATURE>CANCELLED',
]);

export async function transitionEdbRevisionState(params: {
  db: D1Database;
  empresaId: number;
  revisionId: string;
  expectedStatus: EdbLifecycleStatus;
  nextStatus: EdbLifecycleStatus;
  expectedVersion: number;
  updatedBy?: number | null;
}): Promise<void> {
  if (!ALLOWED_ADMINISTRATIVE_TRANSITIONS.has(`${params.expectedStatus}>${params.nextStatus}`)) {
    throw new Error('EDB_STATE_TRANSITION_NOT_ALLOWED');
  }
  if (!Number.isInteger(params.expectedVersion) || params.expectedVersion < 1) {
    throw new Error('EDB_STATE_VERSION_INVALID');
  }

  const result = await params.db
    .prepare(
      `
      UPDATE edb_registro_estado
      SET status = ?, versao = versao + 1, updated_by = ?, updated_at = datetime('now')
      WHERE empresa_id = ? AND revision_id = ? AND status = ? AND versao = ?
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

  if ((result.meta.changes ?? 0) !== 1) throw new Error('EDB_STATE_CONFLICT');
}

export async function appendEdbSignature(params: {
  db: D1Database;
  empresaId: number;
  revisionId: string;
  signature: EdbSignatureProof;
  signerUserId?: number | null;
  authenticationEvidence?: unknown;
  updatedBy?: number | null;
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

  const { row, record } = await loadPersistedEdbRevision({
    db: params.db,
    empresaId: params.empresaId,
    revisionId: params.revisionId,
  });
  const expectedState: EdbLifecycleStatus =
    params.signature.type === 'PIC_FLIGHT_RECORD' ? 'READY_FOR_PIC_SIGNATURE' : 'PIC_SIGNED';
  const nextState: EdbLifecycleStatus =
    params.signature.type === 'PIC_FLIGHT_RECORD' ? 'PIC_SIGNED' : 'OPERATOR_SIGNED';
  if (row.status !== expectedState) {
    throw new Error(`EDB_SIGNATURE_STATE_INVALID_EXPECTED_${expectedState}`);
  }

  if (params.signature.type === 'OPERATOR_RECORD') {
    record.signatures.picFlightRecord = await assertStoredPicSignatureIntegrity({
      db: params.db,
      empresaId: params.empresaId,
      revisionId: params.revisionId,
      record,
    });
  }

  const expectedHash = await hashSignableEdbPayload(record, params.signature.type);
  if (params.signature.canonicalPayloadHashSha256 !== expectedHash) {
    throw new Error('EDB_FINAL_SIGNATURE_HASH_MISMATCH');
  }

  const results = await params.db.batch([
    params.db
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
        params.authenticationEvidence === undefined ? null : canonicalJson(params.authenticationEvidence),
      ),
    params.db
      .prepare(
        `
        UPDATE edb_registro_estado
        SET status = ?, versao = versao + 1, updated_by = ?, updated_at = datetime('now')
        WHERE empresa_id = ? AND revision_id = ? AND status = ? AND versao = ?
      `,
      )
      .bind(
        nextState,
        params.updatedBy ?? params.signerUserId ?? null,
        params.empresaId,
        params.revisionId,
        expectedState,
        row.state_version,
      ),
  ]);

  if ((results[1]?.meta.changes ?? 0) !== 1) throw new Error('EDB_STATE_CONFLICT');
}

async function assertEdbReadyForAnacQueue(params: {
  db: D1Database;
  empresaId: number;
  revisionId: string;
}): Promise<number> {
  const { row, record } = await loadPersistedEdbRevision(params);
  if (row.status !== 'OPERATOR_SIGNED') {
    throw new Error('EDB_ANAC_QUEUE_REQUIRES_OPERATOR_SIGNED');
  }

  record.signatures.picFlightRecord = await assertStoredPicSignatureIntegrity({ ...params, record });
  const operator = await loadStoredFinalSignature({ ...params, type: 'OPERATOR_RECORD' });
  if (!operator) throw new Error('EDB_OPERATOR_SIGNATURE_NOT_PERSISTED');
  const expectedOperatorHash = await hashSignableEdbPayload(record, 'OPERATOR_RECORD');
  if (operator.canonicalPayloadHashSha256 !== expectedOperatorHash) {
    throw new Error('EDB_OPERATOR_SIGNATURE_PERSISTED_HASH_MISMATCH');
  }
  return row.state_version;
}

export async function queueEdbAnacTransmission(params: {
  db: D1Database;
  empresaId: number;
  revisionId: string;
  operationKind: string;
  idempotencyKey: string;
  payload?: unknown;
  outboxId?: string;
  updatedBy?: number | null;
}): Promise<string> {
  const stateVersion = await assertEdbReadyForAnacQueue(params);
  const operationKind = requireText(params.operationKind, 'EDB_ANAC_OPERATION_KIND_REQUIRED');
  const idempotencyKey = requireText(params.idempotencyKey, 'EDB_ANAC_IDEMPOTENCY_KEY_REQUIRED');
  const outboxId = params.outboxId?.trim() || newId('edbout');

  const results = await params.db.batch([
    params.db
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
        operationKind,
        idempotencyKey,
        params.payload === undefined ? null : canonicalJson(params.payload),
      ),
    params.db
      .prepare(
        `
        UPDATE edb_registro_estado
        SET status = 'ANAC_PENDING', versao = versao + 1, updated_by = ?, updated_at = datetime('now')
        WHERE empresa_id = ? AND revision_id = ? AND status = 'OPERATOR_SIGNED' AND versao = ?
      `,
      )
      .bind(params.updatedBy ?? null, params.empresaId, params.revisionId, stateVersion),
  ]);

  if ((results[1]?.meta.changes ?? 0) !== 1) throw new Error('EDB_STATE_CONFLICT');
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
  const outboxId = requireText(params.outboxId, 'EDB_ANAC_OUTBOX_ID_REQUIRED');
  const externalReceiptId = requireText(params.externalReceiptId, 'EDB_ANAC_RECEIPT_EXTERNAL_ID_REQUIRED');
  const receivedAt = requireTimestamp(params.receivedAt, 'EDB_ANAC_RECEIPT_TIMESTAMP_INVALID');
  if (
    params.httpStatus !== undefined &&
    params.httpStatus !== null &&
    (!Number.isInteger(params.httpStatus) || params.httpStatus < 100 || params.httpStatus > 599)
  ) {
    throw new Error('EDB_ANAC_RECEIPT_HTTP_STATUS_INVALID');
  }

  const outbox = await params.db
    .prepare(
      `
      SELECT id, empresa_id, revision_id
      FROM edb_anac_outbox
      WHERE id = ? AND empresa_id = ?
      LIMIT 1
    `,
    )
    .bind(outboxId, params.empresaId)
    .first<StoredAnacOutboxRow>();
  if (!outbox || outbox.id !== outboxId || outbox.empresa_id !== params.empresaId || !outbox.revision_id.trim()) {
    throw new Error('EDB_ANAC_OUTBOX_NOT_FOUND_OR_SCOPE_MISMATCH');
  }

  const receiptId = params.receiptId?.trim() || newId('edbrcpt');
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
      outboxId,
      externalReceiptId,
      params.httpStatus ?? null,
      receivedAt,
      canonicalJson(params.receipt),
    )
    .run();
  return receiptId;
}
