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

interface RevisionViewRow {
  id: string;
  empresa_id: number;
  logical_record_id: string;
  payload_json: string;
  canonical_payload_sha256: string;
  status: EdbLifecycleStatus;
  state_version: number;
  diario_id: number;
  volume_id: string;
  revisao: number;
  voo_id: number;
  etapa_id: number;
}

interface SignatureRow {
  id: string;
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

export interface EdbRevisionView {
  record: EdbFlightRecord;
  stateVersion: number;
  canonicalPayloadSha256: string;
  diaryId: number;
  volumeId: string;
  revision: number;
  sourceFlightId: number;
  sourceStageId: number;
}

const PIC_REQUIRED_STATES = new Set<EdbLifecycleStatus>([
  'PIC_SIGNED',
  'OPERATOR_SIGNED',
  'ANAC_PENDING',
  'ANAC_SYNCED',
  'SUPERSEDED',
]);

const OPERATOR_REQUIRED_STATES = new Set<EdbLifecycleStatus>([
  'OPERATOR_SIGNED',
  'ANAC_PENDING',
  'ANAC_SYNCED',
]);

function parseMethod(value: string): EdbSignatureMethod {
  if (
    value !== 'ASYMMETRIC_DIGITAL_SIGNATURE' &&
    value !== 'ELECTRONIC_SIGNATURE_WITH_CERTIFICATE'
  ) {
    throw new Error('EDB_STORED_SIGNATURE_METHOD_INVALID');
  }
  return value;
}

function hydrateSignature(row: SignatureRow): EdbSignatureProof {
  if (!row.id.trim() || !row.revision_id.trim() || !row.signer_nome.trim() || !row.proof_reference.trim()) {
    throw new Error('EDB_STORED_SIGNATURE_INVALID');
  }
  if (!Number.isFinite(Date.parse(row.signed_at))) throw new Error('EDB_STORED_SIGNATURE_TIMESTAMP_INVALID');
  if (!/^[a-f0-9]{64}$/.test(row.canonical_payload_sha256)) {
    throw new Error('EDB_STORED_SIGNATURE_HASH_INVALID');
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
    method: parseMethod(row.metodo),
    proofReference: row.proof_reference,
  };
}

function cloneRecord(record: EdbFlightRecord): EdbFlightRecord {
  return JSON.parse(JSON.stringify(record)) as EdbFlightRecord;
}

export async function loadVerifiedEdbRevisionView(params: {
  db: D1Database;
  empresaId: number;
  revisionId: string;
}): Promise<EdbRevisionView | null> {
  const row = await params.db
    .prepare(
      `
      SELECT r.id, r.empresa_id, r.logical_record_id, r.payload_json,
             r.canonical_payload_sha256, r.diario_id, r.volume_id, r.revisao,
             r.voo_id, r.etapa_id, s.status, s.versao AS state_version
      FROM edb_registro_revisoes r
      INNER JOIN edb_registro_estado s
        ON s.revision_id = r.id AND s.empresa_id = r.empresa_id
      WHERE r.empresa_id = ? AND r.id = ?
      LIMIT 1
    `,
    )
    .bind(params.empresaId, params.revisionId)
    .first<RevisionViewRow>();

  if (!row) return null;
  if (!Number.isInteger(row.state_version) || row.state_version < 1) {
    throw new Error('EDB_REVISION_STATE_VERSION_INVALID');
  }
  if (!/^[a-f0-9]{64}$/.test(row.canonical_payload_sha256)) {
    throw new Error('EDB_REVISION_PERSISTED_HASH_INVALID');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.payload_json);
  } catch {
    throw new Error('EDB_REVISION_PAYLOAD_INVALID_JSON');
  }
  if (!isPersistedEdbFlightRecord(parsed)) throw new Error('EDB_REVISION_PAYLOAD_INVALID');

  const recalculated = await sha256Hex(canonicalJson(parsed));
  if (recalculated !== row.canonical_payload_sha256) {
    throw new Error('EDB_REVISION_PERSISTED_HASH_MISMATCH');
  }
  if (
    parsed.identity.operatorCompanyId !== row.empresa_id ||
    parsed.logicalRecordId !== row.logical_record_id ||
    parsed.revisionId !== row.id ||
    parsed.source.sourceFlightId !== row.voo_id ||
    parsed.source.sourceStageId !== row.etapa_id ||
    parsed.correction.revision !== row.revisao
  ) {
    throw new Error('EDB_REVISION_PERSISTED_SCOPE_MISMATCH');
  }

  const record = cloneRecord(parsed);
  const signatures = await params.db
    .prepare(
      `
      SELECT id, revision_id, tipo, signer_funcionario_id, signer_nome,
             signer_codigo_anac, signed_at, canonical_payload_sha256,
             metodo, proof_reference
      FROM edb_assinaturas
      WHERE empresa_id = ? AND revision_id = ?
      ORDER BY CASE tipo WHEN 'PIC_FLIGHT_RECORD' THEN 1 ELSE 2 END ASC
    `,
    )
    .bind(params.empresaId, params.revisionId)
    .all<SignatureRow>();

  const picRow = (signatures.results ?? []).find((item) => item.tipo === 'PIC_FLIGHT_RECORD');
  const operatorRow = (signatures.results ?? []).find((item) => item.tipo === 'OPERATOR_RECORD');
  const pic = picRow ? hydrateSignature(picRow) : null;
  if (pic) {
    const expectedPicHash = await hashSignableEdbPayload(record, 'PIC_FLIGHT_RECORD');
    if (pic.canonicalPayloadHashSha256 !== expectedPicHash) {
      throw new Error('EDB_PIC_FLIGHT_SIGNATURE_PERSISTED_HASH_MISMATCH');
    }
    record.signatures.picFlightRecord = pic;
  }

  const operator = operatorRow ? hydrateSignature(operatorRow) : null;
  if (operator) {
    if (!pic) throw new Error('EDB_OPERATOR_SIGNATURE_WITHOUT_PIC');
    const expectedOperatorHash = await hashSignableEdbPayload(record, 'OPERATOR_RECORD');
    if (operator.canonicalPayloadHashSha256 !== expectedOperatorHash) {
      throw new Error('EDB_OPERATOR_SIGNATURE_PERSISTED_HASH_MISMATCH');
    }
    record.signatures.operatorRecord = operator;
  }

  if (PIC_REQUIRED_STATES.has(row.status) && !pic) {
    throw new Error('EDB_PIC_SIGNATURE_REQUIRED_FOR_STATE');
  }
  if (OPERATOR_REQUIRED_STATES.has(row.status) && !operator) {
    throw new Error('EDB_OPERATOR_SIGNATURE_REQUIRED_FOR_STATE');
  }

  record.status = row.status;
  return {
    record,
    stateVersion: row.state_version,
    canonicalPayloadSha256: row.canonical_payload_sha256,
    diaryId: row.diario_id,
    volumeId: row.volume_id,
    revision: row.revisao,
    sourceFlightId: row.voo_id,
    sourceStageId: row.etapa_id,
  };
}

export async function listVerifiedEdbRevisionViewsForFlight(params: {
  db: D1Database;
  empresaId: number;
  vooId: number;
}): Promise<EdbRevisionView[]> {
  const rows = await params.db
    .prepare(
      `
      SELECT id
      FROM edb_registro_revisoes
      WHERE empresa_id = ? AND voo_id = ?
      ORDER BY etapa_id ASC, revisao ASC, created_at ASC
    `,
    )
    .bind(params.empresaId, params.vooId)
    .all<{ id: string }>();

  const views: EdbRevisionView[] = [];
  for (const row of rows.results ?? []) {
    const view = await loadVerifiedEdbRevisionView({ ...params, revisionId: row.id });
    if (!view) throw new Error('EDB_REVISION_DISAPPEARED_DURING_READ');
    views.push(view);
  }
  return views;
}
