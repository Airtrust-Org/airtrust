import { canonicalJson } from '../../services/edb/canonicalization';
import type {
  EdbAircraftIdentity,
  EdbMaintenanceSnapshot,
  EdbSignatureMethod,
} from '../../services/edb/contracts';
import {
  hashTechnicalSituationContent,
  hashTechnicalSituationSnapshot,
  verifyPicTechnicalAcknowledgementBinding,
  type EdbPicTechnicalAcknowledgement,
  type EdbTechnicalSituationSnapshot,
} from '../../services/edb/technical-awareness';

export async function persistEdbTechnicalSituation(params: {
  db: D1Database;
  snapshot: EdbTechnicalSituationSnapshot;
  createdBy?: number | null;
}): Promise<void> {
  const { snapshot } = params;
  const expectedTechnicalHash = await hashTechnicalSituationContent({
    operatorCompanyId: snapshot.operatorCompanyId,
    sourceFlightId: snapshot.sourceFlightId,
    aircraft: snapshot.aircraft,
    maintenance: snapshot.maintenance,
  });
  if (expectedTechnicalHash !== snapshot.technicalContentSha256) {
    throw new Error('EDB_TECHNICAL_CONTENT_HASH_MISMATCH');
  }

  const expectedSnapshotHash = await hashTechnicalSituationSnapshot(snapshot);
  if (expectedSnapshotHash !== snapshot.canonicalSnapshotSha256) {
    throw new Error('EDB_TECHNICAL_SNAPSHOT_HASH_MISMATCH');
  }

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

interface StoredTechnicalSituationBindingRow {
  id: string;
  canonical_snapshot_sha256: string;
  captured_at: string;
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
  if (!signature.signatureId.trim()) throw new Error('EDB_TECHNICAL_ACK_SIGNATURE_ID_REQUIRED');
  if (
    signature.targetType !== 'TECHNICAL_SITUATION' ||
    signature.targetId !== acknowledgement.technicalSituationId
  ) {
    throw new Error('EDB_TECHNICAL_ACK_TARGET_MISMATCH');
  }

  const situation = await params.db
    .prepare(
      `
      SELECT id, canonical_snapshot_sha256, captured_at
      FROM edb_situacoes_tecnicas
      WHERE id = ? AND empresa_id = ? AND voo_id = ?
      LIMIT 1
    `,
    )
    .bind(
      acknowledgement.technicalSituationId,
      acknowledgement.operatorCompanyId,
      acknowledgement.sourceFlightId,
    )
    .first<StoredTechnicalSituationBindingRow>();

  if (!situation) {
    throw new Error('EDB_TECHNICAL_SNAPSHOT_NOT_FOUND_OR_SCOPE_MISMATCH');
  }
  if (situation.canonical_snapshot_sha256 !== signature.canonicalPayloadHashSha256) {
    throw new Error('EDB_TECHNICAL_ACK_HASH_MISMATCH');
  }
  if (Date.parse(signature.signedAt) < Date.parse(situation.captured_at)) {
    throw new Error('EDB_TECHNICAL_ACK_PREDATES_SNAPSHOT');
  }

  // The acknowledgement row is the signature event; its id is the signature id.
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
      signature.signatureId,
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

export interface EdbPicTechnicalAcknowledgementRow {
  id: string;
  empresa_id: number;
  situacao_tecnica_id: string;
  voo_id: number;
  signer_funcionario_id: number | null;
  signer_user_id: number | null;
  signer_nome: string;
  signer_codigo_anac: string | null;
  signed_at: string;
  canonical_snapshot_sha256: string;
  metodo: string;
  proof_reference: string;
  auth_evidence_json: string | null;
  created_at: string;
}

export interface EdbLoadedPreflightEvidence {
  technicalSituation: EdbTechnicalSituationSnapshot | null;
  technicalAcknowledgement: EdbPicTechnicalAcknowledgement | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseObjectJson(value: string, field: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${field} must contain valid JSON`);
  }
  if (!isObject(parsed)) throw new Error(`${field} must contain a JSON object`);
  return parsed;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${field} must be string or null`);
  return value;
}

function nullableFiniteNumber(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be finite number or null`);
  }
  return value;
}

function nullableStringArray(value: unknown, field: string): string[] | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${field} must be string[] or null`);
  }
  return [...value];
}

function parseAircraftJson(value: string): EdbAircraftIdentity {
  const parsed = parseObjectJson(value, 'aircraft_json');
  const aircraftId = parsed.aircraftId;
  if (aircraftId !== null && (typeof aircraftId !== 'number' || !Number.isInteger(aircraftId))) {
    throw new Error('aircraft_json.aircraftId must be integer or null');
  }
  return {
    aircraftId: aircraftId as number | null,
    manufacturer: nullableString(parsed.manufacturer, 'aircraft_json.manufacturer'),
    model: nullableString(parsed.model, 'aircraft_json.model'),
    serialNumber: nullableString(parsed.serialNumber, 'aircraft_json.serialNumber'),
    registrationMarks: nullableString(parsed.registrationMarks, 'aircraft_json.registrationMarks'),
    owners: nullableStringArray(parsed.owners, 'aircraft_json.owners'),
    operators: nullableStringArray(parsed.operators, 'aircraft_json.operators'),
  };
}

function parseMaintenanceJson(value: string): EdbMaintenanceSnapshot {
  const parsed = parseObjectJson(value, 'maintenance_json');
  if (!isObject(parsed.lastIntervention) || !isObject(parsed.nextIntervention)) {
    throw new Error('maintenance_json must contain lastIntervention and nextIntervention objects');
  }
  return {
    lastIntervention: {
      type: nullableString(parsed.lastIntervention.type, 'maintenance_json.lastIntervention.type'),
      date: nullableString(parsed.lastIntervention.date, 'maintenance_json.lastIntervention.date'),
      returnToServiceApprovedBy: nullableString(
        parsed.lastIntervention.returnToServiceApprovedBy,
        'maintenance_json.lastIntervention.returnToServiceApprovedBy',
      ),
    },
    nextIntervention: {
      type: nullableString(parsed.nextIntervention.type, 'maintenance_json.nextIntervention.type'),
      dueAtAirframeHours: nullableFiniteNumber(
        parsed.nextIntervention.dueAtAirframeHours,
        'maintenance_json.nextIntervention.dueAtAirframeHours',
      ),
    },
  };
}

function assertHash(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field} must be a lowercase SHA-256 digest`);
}

function parseSignatureMethod(value: string): EdbSignatureMethod {
  if (
    value !== 'ASYMMETRIC_DIGITAL_SIGNATURE' &&
    value !== 'ELECTRONIC_SIGNATURE_WITH_CERTIFICATE'
  ) {
    throw new Error('EDB_TECHNICAL_ACK_SIGNATURE_METHOD_INVALID');
  }
  return value;
}

export async function hydrateEdbTechnicalSituationRow(
  row: EdbTechnicalSituationRow,
): Promise<EdbTechnicalSituationSnapshot> {
  if (!row.id.trim()) throw new Error('EDB_TECHNICAL_SNAPSHOT_ID_REQUIRED');
  if (!Number.isInteger(row.empresa_id) || row.empresa_id < 1) throw new Error('EDB_TECHNICAL_SNAPSHOT_TENANT_INVALID');
  if (!Number.isInteger(row.voo_id) || row.voo_id < 1) throw new Error('EDB_TECHNICAL_SNAPSHOT_FLIGHT_INVALID');
  if (!Number.isFinite(Date.parse(row.captured_at))) throw new Error('EDB_TECHNICAL_SNAPSHOT_CAPTURED_AT_INVALID');
  assertHash(row.technical_content_sha256, 'technical_content_sha256');
  assertHash(row.canonical_snapshot_sha256, 'canonical_snapshot_sha256');

  const snapshot: EdbTechnicalSituationSnapshot = {
    snapshotId: row.id,
    operatorCompanyId: row.empresa_id,
    sourceFlightId: row.voo_id,
    aircraft: parseAircraftJson(row.aircraft_json),
    maintenance: parseMaintenanceJson(row.maintenance_json),
    capturedAt: row.captured_at,
    technicalContentSha256: row.technical_content_sha256,
    canonicalSnapshotSha256: row.canonical_snapshot_sha256,
  };

  const technicalHash = await hashTechnicalSituationContent({
    operatorCompanyId: snapshot.operatorCompanyId,
    sourceFlightId: snapshot.sourceFlightId,
    aircraft: snapshot.aircraft,
    maintenance: snapshot.maintenance,
  });
  if (technicalHash !== snapshot.technicalContentSha256) {
    throw new Error('EDB_TECHNICAL_CONTENT_HASH_MISMATCH');
  }

  const snapshotHash = await hashTechnicalSituationSnapshot(snapshot);
  if (snapshotHash !== snapshot.canonicalSnapshotSha256) {
    throw new Error('EDB_TECHNICAL_SNAPSHOT_HASH_MISMATCH');
  }
  return snapshot;
}

export async function hydrateEdbPicTechnicalAcknowledgementRow(params: {
  row: EdbPicTechnicalAcknowledgementRow;
  snapshot: EdbTechnicalSituationSnapshot;
}): Promise<EdbPicTechnicalAcknowledgement> {
  const { row, snapshot } = params;
  if (!row.id.trim()) throw new Error('EDB_TECHNICAL_ACK_SIGNATURE_ID_REQUIRED');
  if (
    row.empresa_id !== snapshot.operatorCompanyId ||
    row.voo_id !== snapshot.sourceFlightId ||
    row.situacao_tecnica_id !== snapshot.snapshotId
  ) {
    throw new Error('EDB_TECHNICAL_ACK_NOT_FOUND_OR_SCOPE_MISMATCH');
  }
  if (!row.signer_nome.trim()) throw new Error('EDB_TECHNICAL_ACK_SIGNER_NAME_REQUIRED');
  if (!Number.isFinite(Date.parse(row.signed_at))) throw new Error('EDB_TECHNICAL_ACK_SIGNED_AT_INVALID');
  assertHash(row.canonical_snapshot_sha256, 'canonical_snapshot_sha256');
  if (!row.proof_reference.trim()) throw new Error('EDB_TECHNICAL_ACK_PROOF_REFERENCE_REQUIRED');

  const acknowledgement: EdbPicTechnicalAcknowledgement = {
    technicalSituationId: row.situacao_tecnica_id,
    operatorCompanyId: row.empresa_id,
    sourceFlightId: row.voo_id,
    signature: {
      signatureId: row.id,
      type: 'PIC_TECHNICAL_ACK',
      targetType: 'TECHNICAL_SITUATION',
      targetId: row.situacao_tecnica_id,
      signer: {
        employeeId: row.signer_funcionario_id,
        fullName: row.signer_nome,
        anacCode: row.signer_codigo_anac,
      },
      signedAt: row.signed_at,
      canonicalPayloadHashSha256: row.canonical_snapshot_sha256,
      method: parseSignatureMethod(row.metodo),
      proofReference: row.proof_reference,
    },
  };

  const binding = await verifyPicTechnicalAcknowledgementBinding({
    snapshot,
    acknowledgement,
  });
  if (!binding.snapshotIntegrity) throw new Error('EDB_TECHNICAL_SNAPSHOT_HASH_MISMATCH');
  if (!binding.matchesSnapshot) throw new Error('EDB_TECHNICAL_ACK_HASH_MISMATCH');
  return acknowledgement;
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

export async function getEdbPicTechnicalAcknowledgementForSituation(params: {
  db: D1Database;
  empresaId: number;
  vooId: number;
  technicalSituationId: string;
}): Promise<EdbPicTechnicalAcknowledgementRow | null> {
  return params.db
    .prepare(
      `
      SELECT id, empresa_id, situacao_tecnica_id, voo_id,
             signer_funcionario_id, signer_user_id, signer_nome, signer_codigo_anac,
             signed_at, canonical_snapshot_sha256, metodo, proof_reference,
             auth_evidence_json, created_at
      FROM edb_ciencias_tecnicas_pic
      WHERE empresa_id = ? AND voo_id = ? AND situacao_tecnica_id = ?
      ORDER BY signed_at DESC, created_at DESC
      LIMIT 1
    `,
    )
    .bind(params.empresaId, params.vooId, params.technicalSituationId)
    .first<EdbPicTechnicalAcknowledgementRow>();
}

export async function loadLatestEdbPreflightEvidence(params: {
  db: D1Database;
  empresaId: number;
  vooId: number;
}): Promise<EdbLoadedPreflightEvidence> {
  const situationRow = await getLatestEdbTechnicalSituation(params);
  if (!situationRow) {
    return { technicalSituation: null, technicalAcknowledgement: null };
  }

  const technicalSituation = await hydrateEdbTechnicalSituationRow(situationRow);
  const acknowledgementRow = await getEdbPicTechnicalAcknowledgementForSituation({
    ...params,
    technicalSituationId: technicalSituation.snapshotId,
  });
  if (!acknowledgementRow) {
    return { technicalSituation, technicalAcknowledgement: null };
  }

  const technicalAcknowledgement = await hydrateEdbPicTechnicalAcknowledgementRow({
    row: acknowledgementRow,
    snapshot: technicalSituation,
  });
  return { technicalSituation, technicalAcknowledgement };
}

export async function assertEdbPicTechnicalAcknowledgementScope(params: {
  db: D1Database;
  empresaId: number;
  vooId: number;
  signatureId: string;
  expectedCanonicalSnapshotSha256: string;
}): Promise<EdbPicTechnicalAcknowledgementRow> {
  const row = await params.db
    .prepare(
      `
      SELECT id, empresa_id, situacao_tecnica_id, voo_id,
             signer_funcionario_id, signer_user_id, signer_nome, signer_codigo_anac,
             signed_at, canonical_snapshot_sha256, metodo, proof_reference,
             auth_evidence_json, created_at
      FROM edb_ciencias_tecnicas_pic
      WHERE id = ? AND empresa_id = ? AND voo_id = ?
      LIMIT 1
    `,
    )
    .bind(params.signatureId, params.empresaId, params.vooId)
    .first<EdbPicTechnicalAcknowledgementRow>();

  if (!row) throw new Error('EDB_TECHNICAL_ACK_NOT_FOUND_OR_SCOPE_MISMATCH');
  if (row.canonical_snapshot_sha256 !== params.expectedCanonicalSnapshotSha256) {
    throw new Error('EDB_TECHNICAL_ACK_PERSISTED_HASH_MISMATCH');
  }
  return row;
}
