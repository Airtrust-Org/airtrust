import { canonicalJson } from '../../services/edb/canonicalization';
import type { EdbOperatorRegulation, EdbPersonIdentity } from '../../services/edb/contracts';
import {
  closeEdbDiaryVolume,
  createEdbInformationLossIncident,
  openEdbDiaryVolume,
  recordAnacInformationLossNotification,
  recordImpossibleReconstitution,
  recordPoliceOccurrence,
  recordSuccessfulReconstitution,
  type EdbDiaryVolume,
  type EdbInformationLossIncident,
  type EdbInformationLossKind,
  type EdbVolumeBoundaryAct,
} from '../../services/edb/diary-governance';

export interface EdbDiaryRecord {
  diaryId: number;
  empresaId: number;
  aircraftId: number;
  operatorRegulation: EdbOperatorRegulation;
  status: 'ACTIVE' | 'CLOSED';
}

export interface EdbStoredVolumeRow {
  id: string;
  empresa_id: number;
  diario_id: number;
  numero_volume: number;
  status: 'ABERTO' | 'ENCERRADO';
  aberto_em: string;
  aberto_por: number;
  ato_abertura_json: string;
  encerrado_em: string | null;
  encerrado_por: number | null;
  ato_encerramento_json: string | null;
  retencao_minima_ate: string | null;
}

export interface EdbStoredIntegrityIncidentRow {
  id: string;
  empresa_id: number;
  diario_id: number;
  volume_id: string | null;
  tipo: EdbInformationLossKind;
  ocorrido_em: string;
  descricao: string;
  police_report_reference: string | null;
  anac_notification_reference: string | null;
  status: 'OPEN' | 'RECONSTITUTED' | 'IMPOSSIBLE_TO_RECONSTITUTE' | 'CLOSED';
  reconstitution_evidence_json: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
}

interface StoredOpeningActEnvelope {
  aircraftRegistrationMarks: string;
  act: EdbVolumeBoundaryAct;
}

interface StoredClosingActEnvelope {
  act: EdbVolumeBoundaryAct;
}

interface StoredIncidentEvidence {
  policeReportedAt: string | null;
  anacNotifiedAt: string | null;
  reconstitutionCompletedAt: string | null;
  newDiaryOpeningObservation: string | null;
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(code);
  return value;
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

function parseOptionalTimestamp(value: unknown, code: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(code);
  return value;
}

function requireDate(value: string | null | undefined, code: string): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) throw new Error(code);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(code);
  }
  return normalized;
}

function requireEmployeeId(person: EdbPersonIdentity, code: string): number {
  if (person.employeeId === null) throw new Error(code);
  return requirePositiveInteger(person.employeeId, code);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePerson(value: unknown, code: string): EdbPersonIdentity {
  if (!isObject(value)) throw new Error(code);
  if (value.employeeId !== null && (!Number.isInteger(value.employeeId) || Number(value.employeeId) < 1)) {
    throw new Error(code);
  }
  if (typeof value.fullName !== 'string' || !value.fullName.trim()) throw new Error(code);
  if (value.anacCode !== null && typeof value.anacCode !== 'string') throw new Error(code);
  return {
    employeeId: value.employeeId as number | null,
    fullName: value.fullName.trim(),
    anacCode: value.anacCode as string | null,
  };
}

function parseBoundaryAct(value: unknown, expectedType: 'OPENING' | 'CLOSING'): EdbVolumeBoundaryAct {
  if (!isObject(value) || value.type !== expectedType) throw new Error('EDB_VOLUME_ACT_INVALID');
  return {
    type: expectedType,
    occurredAt: requireTimestamp(
      typeof value.occurredAt === 'string' ? value.occurredAt : '',
      'EDB_VOLUME_ACT_TIMESTAMP_INVALID',
    ),
    actor: parsePerson(value.actor, 'EDB_VOLUME_ACT_ACTOR_INVALID'),
    observations:
      value.observations === null
        ? null
        : typeof value.observations === 'string'
          ? value.observations
          : (() => {
              throw new Error('EDB_VOLUME_ACT_OBSERVATIONS_INVALID');
            })(),
  };
}

function parseOpeningEnvelope(value: string): StoredOpeningActEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('EDB_VOLUME_OPENING_ACT_INVALID_JSON');
  }
  if (!isObject(parsed) || typeof parsed.aircraftRegistrationMarks !== 'string') {
    throw new Error('EDB_VOLUME_OPENING_ACT_INVALID');
  }
  return {
    aircraftRegistrationMarks: requireText(
      parsed.aircraftRegistrationMarks,
      'EDB_VOLUME_AIRCRAFT_REGISTRATION_REQUIRED',
    ),
    act: parseBoundaryAct(parsed.act, 'OPENING'),
  };
}

function parseClosingEnvelope(value: string): StoredClosingActEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('EDB_VOLUME_CLOSING_ACT_INVALID_JSON');
  }
  if (!isObject(parsed)) throw new Error('EDB_VOLUME_CLOSING_ACT_INVALID');
  return { act: parseBoundaryAct(parsed.act, 'CLOSING') };
}

function emptyIncidentEvidence(): StoredIncidentEvidence {
  return {
    policeReportedAt: null,
    anacNotifiedAt: null,
    reconstitutionCompletedAt: null,
    newDiaryOpeningObservation: null,
  };
}

function incidentEvidence(incident: EdbInformationLossIncident): StoredIncidentEvidence {
  return {
    policeReportedAt: incident.policeReportedAt,
    anacNotifiedAt: incident.anacNotifiedAt,
    reconstitutionCompletedAt: incident.reconstitutionCompletedAt,
    newDiaryOpeningObservation: incident.newDiaryOpeningObservation,
  };
}

function parseIncidentEvidence(value: string | null): StoredIncidentEvidence {
  if (value === null) return emptyIncidentEvidence();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('EDB_INTEGRITY_INCIDENT_EVIDENCE_INVALID_JSON');
  }
  if (!isObject(parsed)) throw new Error('EDB_INTEGRITY_INCIDENT_EVIDENCE_INVALID');
  const observation = parsed.newDiaryOpeningObservation;
  if (observation !== null && typeof observation !== 'string') {
    throw new Error('EDB_INTEGRITY_INCIDENT_OPENING_OBSERVATION_INVALID');
  }
  return {
    policeReportedAt: parseOptionalTimestamp(
      parsed.policeReportedAt,
      'EDB_INTEGRITY_INCIDENT_POLICE_TIMESTAMP_INVALID',
    ),
    anacNotifiedAt: parseOptionalTimestamp(
      parsed.anacNotifiedAt,
      'EDB_INTEGRITY_INCIDENT_ANAC_TIMESTAMP_INVALID',
    ),
    reconstitutionCompletedAt: parseOptionalTimestamp(
      parsed.reconstitutionCompletedAt,
      'EDB_INTEGRITY_INCIDENT_RECONSTITUTION_TIMESTAMP_INVALID',
    ),
    newDiaryOpeningObservation: observation as string | null,
  };
}

function mapIncidentStatus(incident: EdbInformationLossIncident): EdbStoredIntegrityIncidentRow['status'] {
  if (incident.reconstitutionOutcome === 'PENDING') return 'OPEN';
  if (incident.reconstitutionOutcome === 'RECONSTITUTED') return 'RECONSTITUTED';
  return 'IMPOSSIBLE_TO_RECONSTITUTE';
}

export function hydrateEdbDiaryVolumeRow(row: EdbStoredVolumeRow): EdbDiaryVolume {
  requirePositiveInteger(row.diario_id, 'EDB_VOLUME_DIARY_ID_INVALID');
  requirePositiveInteger(row.numero_volume, 'EDB_VOLUME_SEQUENCE_INVALID');
  const opening = parseOpeningEnvelope(row.ato_abertura_json);
  if (opening.act.occurredAt !== row.aberto_em) throw new Error('EDB_VOLUME_OPENING_TIMESTAMP_MISMATCH');
  if (opening.act.actor.employeeId !== row.aberto_por) throw new Error('EDB_VOLUME_OPENING_ACTOR_MISMATCH');

  const opened = openEdbDiaryVolume({
    diaryId: row.diario_id,
    volumeId: row.id,
    aircraftRegistrationMarks: opening.aircraftRegistrationMarks,
    sequence: row.numero_volume,
    openedAt: opening.act.occurredAt,
    openedBy: opening.act.actor,
    observations: opening.act.observations,
  });

  if (row.status === 'ABERTO') {
    if (row.encerrado_em !== null || row.encerrado_por !== null || row.ato_encerramento_json !== null) {
      throw new Error('EDB_OPEN_VOLUME_HAS_CLOSING_EVIDENCE');
    }
    return opened;
  }

  if (row.encerrado_em === null || row.encerrado_por === null || row.ato_encerramento_json === null) {
    throw new Error('EDB_CLOSED_VOLUME_MISSING_CLOSING_EVIDENCE');
  }
  const closing = parseClosingEnvelope(row.ato_encerramento_json);
  if (closing.act.occurredAt !== row.encerrado_em) throw new Error('EDB_VOLUME_CLOSING_TIMESTAMP_MISMATCH');
  if (closing.act.actor.employeeId !== row.encerrado_por) throw new Error('EDB_VOLUME_CLOSING_ACTOR_MISMATCH');
  return closeEdbDiaryVolume(opened, {
    closedAt: closing.act.occurredAt,
    closedBy: closing.act.actor,
    observations: closing.act.observations,
  });
}

export function hydrateEdbInformationLossIncidentRow(
  row: EdbStoredIntegrityIncidentRow,
): EdbInformationLossIncident {
  if (row.status === 'CLOSED') throw new Error('EDB_INTEGRITY_INCIDENT_CLOSED_UNSUPPORTED');
  const evidence = parseIncidentEvidence(row.reconstitution_evidence_json);
  let incident = createEdbInformationLossIncident({
    incidentId: row.id,
    diaryId: row.diario_id,
    volumeId: row.volume_id,
    kind: row.tipo,
    detectedAt: row.ocorrido_em,
    description: row.descricao,
  });

  if (row.police_report_reference !== null) {
    if (evidence.policeReportedAt === null) throw new Error('EDB_INTEGRITY_INCIDENT_POLICE_TIMESTAMP_REQUIRED');
    incident = recordPoliceOccurrence(incident, {
      reference: row.police_report_reference,
      reportedAt: evidence.policeReportedAt,
    });
  } else if (evidence.policeReportedAt !== null) {
    throw new Error('EDB_INTEGRITY_INCIDENT_POLICE_REFERENCE_REQUIRED');
  }

  if (row.anac_notification_reference !== null) {
    if (evidence.anacNotifiedAt === null) throw new Error('EDB_INTEGRITY_INCIDENT_ANAC_TIMESTAMP_REQUIRED');
    incident = recordAnacInformationLossNotification(incident, {
      reference: row.anac_notification_reference,
      notifiedAt: evidence.anacNotifiedAt,
    });
  } else if (evidence.anacNotifiedAt !== null) {
    throw new Error('EDB_INTEGRITY_INCIDENT_ANAC_REFERENCE_REQUIRED');
  }

  if (row.status === 'RECONSTITUTED') {
    if (evidence.reconstitutionCompletedAt === null) {
      throw new Error('EDB_INTEGRITY_INCIDENT_RECONSTITUTION_TIMESTAMP_REQUIRED');
    }
    incident = recordSuccessfulReconstitution(incident, evidence.reconstitutionCompletedAt);
  } else if (row.status === 'IMPOSSIBLE_TO_RECONSTITUTE') {
    if (evidence.reconstitutionCompletedAt === null || !evidence.newDiaryOpeningObservation?.trim()) {
      throw new Error('EDB_INTEGRITY_INCIDENT_IMPOSSIBLE_EVIDENCE_REQUIRED');
    }
    incident = recordImpossibleReconstitution(incident, {
      completedAt: evidence.reconstitutionCompletedAt,
      newDiaryOpeningObservation: evidence.newDiaryOpeningObservation,
    });
  } else if (
    evidence.reconstitutionCompletedAt !== null ||
    evidence.newDiaryOpeningObservation !== null
  ) {
    throw new Error('EDB_OPEN_INTEGRITY_INCIDENT_HAS_RECONSTITUTION_EVIDENCE');
  }

  return incident;
}

function validateRegulation(value: EdbOperatorRegulation): EdbOperatorRegulation {
  if (value !== 'RBAC121' && value !== 'RBAC135' && value !== 'OTHER') {
    throw new Error('EDB_OPERATOR_REGULATION_INVALID');
  }
  return value;
}

export async function createEdbDiary(params: {
  db: D1Database;
  empresaId: number;
  aircraftId: number;
  operatorRegulation: EdbOperatorRegulation;
  createdBy?: number | null;
}): Promise<EdbDiaryRecord> {
  requirePositiveInteger(params.empresaId, 'EDB_DIARY_TENANT_INVALID');
  requirePositiveInteger(params.aircraftId, 'EDB_DIARY_AIRCRAFT_ID_INVALID');
  const regulation = validateRegulation(params.operatorRegulation);
  const row = await params.db
    .prepare(
      `
      INSERT INTO edb_diarios (
        empresa_id, aeronave_id, contract_version, regulamento_operador,
        status, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, 'edb.regulatory.v1', ?, 'ATIVO', ?, ?, datetime('now'), datetime('now'))
      RETURNING id, empresa_id, aeronave_id, regulamento_operador, status
    `,
    )
    .bind(
      params.empresaId,
      params.aircraftId,
      regulation,
      params.createdBy ?? null,
      params.createdBy ?? null,
    )
    .first<{
      id: number;
      empresa_id: number;
      aeronave_id: number;
      regulamento_operador: EdbOperatorRegulation;
      status: 'ATIVO';
    }>();
  if (!row) throw new Error('EDB_DIARY_CREATE_FAILED');
  return {
    diaryId: row.id,
    empresaId: row.empresa_id,
    aircraftId: row.aeronave_id,
    operatorRegulation: validateRegulation(row.regulamento_operador),
    status: 'ACTIVE',
  };
}

export async function getActiveEdbDiaryForAircraft(params: {
  db: D1Database;
  empresaId: number;
  aircraftId: number;
}): Promise<EdbDiaryRecord | null> {
  const row = await params.db
    .prepare(
      `
      SELECT id, empresa_id, aeronave_id, regulamento_operador, status
      FROM edb_diarios
      WHERE empresa_id = ? AND aeronave_id = ? AND status = 'ATIVO'
      LIMIT 1
    `,
    )
    .bind(params.empresaId, params.aircraftId)
    .first<{
      id: number;
      empresa_id: number;
      aeronave_id: number;
      regulamento_operador: EdbOperatorRegulation;
      status: 'ATIVO';
    }>();
  if (!row) return null;
  return {
    diaryId: row.id,
    empresaId: row.empresa_id,
    aircraftId: row.aeronave_id,
    operatorRegulation: validateRegulation(row.regulamento_operador),
    status: 'ACTIVE',
  };
}

async function assertActiveDiary(params: {
  db: D1Database;
  empresaId: number;
  diaryId: number;
}): Promise<void> {
  const row = await params.db
    .prepare(`SELECT id FROM edb_diarios WHERE empresa_id = ? AND id = ? AND status = 'ATIVO' LIMIT 1`)
    .bind(params.empresaId, params.diaryId)
    .first<{ id: number }>();
  if (!row || row.id !== params.diaryId) throw new Error('EDB_ACTIVE_DIARY_NOT_FOUND_OR_SCOPE_MISMATCH');
}

export async function createEdbDiaryVolume(params: {
  db: D1Database;
  empresaId: number;
  diaryId: number;
  volumeId: string;
  aircraftRegistrationMarks: string;
  sequence: number;
  openedAt: string;
  openedBy: EdbPersonIdentity;
  observations?: string | null;
}): Promise<EdbDiaryVolume> {
  const volume = openEdbDiaryVolume(params);
  const openedByEmployeeId = requireEmployeeId(
    volume.openingAct.actor,
    'EDB_VOLUME_OPENING_EMPLOYEE_ID_REQUIRED',
  );
  await assertActiveDiary({ db: params.db, empresaId: params.empresaId, diaryId: volume.diaryId });

  await params.db
    .prepare(
      `
      INSERT INTO edb_volumes (
        id, empresa_id, diario_id, numero_volume, status,
        aberto_em, aberto_por, ato_abertura_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'ABERTO', ?, ?, ?, datetime('now'), datetime('now'))
    `,
    )
    .bind(
      volume.volumeId,
      params.empresaId,
      volume.diaryId,
      volume.sequence,
      volume.openingAct.occurredAt,
      openedByEmployeeId,
      canonicalJson({
        aircraftRegistrationMarks: volume.aircraftRegistrationMarks,
        act: volume.openingAct,
      } satisfies StoredOpeningActEnvelope),
    )
    .run();
  return volume;
}

export async function loadEdbDiaryVolume(params: {
  db: D1Database;
  empresaId: number;
  volumeId: string;
}): Promise<EdbDiaryVolume | null> {
  const volumeId = requireText(params.volumeId, 'EDB_VOLUME_ID_REQUIRED');
  const row = await params.db
    .prepare(
      `
      SELECT id, empresa_id, diario_id, numero_volume, status,
             aberto_em, aberto_por, ato_abertura_json,
             encerrado_em, encerrado_por, ato_encerramento_json,
             retencao_minima_ate
      FROM edb_volumes
      WHERE empresa_id = ? AND id = ?
      LIMIT 1
    `,
    )
    .bind(params.empresaId, volumeId)
    .first<EdbStoredVolumeRow>();
  if (!row) return null;
  if (row.empresa_id !== params.empresaId || row.id !== volumeId) throw new Error('EDB_VOLUME_SCOPE_MISMATCH');
  return hydrateEdbDiaryVolumeRow(row);
}

export async function closePersistedEdbDiaryVolume(params: {
  db: D1Database;
  empresaId: number;
  volumeId: string;
  closedAt: string;
  closedBy: EdbPersonIdentity;
  observations?: string | null;
  retentionMinimumUntil?: string | null;
}): Promise<EdbDiaryVolume> {
  const current = await loadEdbDiaryVolume(params);
  if (!current) throw new Error('EDB_VOLUME_NOT_FOUND_OR_SCOPE_MISMATCH');
  const closed = closeEdbDiaryVolume(current, params);
  const closedByEmployeeId = requireEmployeeId(
    closed.closingAct!.actor,
    'EDB_VOLUME_CLOSING_EMPLOYEE_ID_REQUIRED',
  );
  const retention = requireDate(
    params.retentionMinimumUntil,
    'EDB_VOLUME_RETENTION_DATE_INVALID',
  );

  const result = await params.db
    .prepare(
      `
      UPDATE edb_volumes
      SET status = 'ENCERRADO', encerrado_em = ?, encerrado_por = ?,
          ato_encerramento_json = ?, retencao_minima_ate = ?, updated_at = datetime('now')
      WHERE empresa_id = ? AND id = ? AND diario_id = ?
        AND status = 'ABERTO' AND encerrado_em IS NULL AND ato_encerramento_json IS NULL
    `,
    )
    .bind(
      closed.closingAct!.occurredAt,
      closedByEmployeeId,
      canonicalJson({ act: closed.closingAct! } satisfies StoredClosingActEnvelope),
      retention,
      params.empresaId,
      closed.volumeId,
      closed.diaryId,
    )
    .run();
  if ((result.meta.changes ?? 0) !== 1) throw new Error('EDB_VOLUME_CLOSE_CONFLICT');
  return closed;
}

export async function closeEdbDiary(params: {
  db: D1Database;
  empresaId: number;
  diaryId: number;
  updatedBy?: number | null;
}): Promise<void> {
  await assertActiveDiary(params);
  const openVolume = await params.db
    .prepare(`SELECT id FROM edb_volumes WHERE empresa_id = ? AND diario_id = ? AND status = 'ABERTO' LIMIT 1`)
    .bind(params.empresaId, params.diaryId)
    .first<{ id: string }>();
  if (openVolume) throw new Error('EDB_DIARY_OPEN_VOLUME_MUST_BE_CLOSED_FIRST');

  const result = await params.db
    .prepare(
      `
      UPDATE edb_diarios
      SET status = 'ENCERRADO', updated_by = ?, updated_at = datetime('now')
      WHERE empresa_id = ? AND id = ? AND status = 'ATIVO'
    `,
    )
    .bind(params.updatedBy ?? null, params.empresaId, params.diaryId)
    .run();
  if ((result.meta.changes ?? 0) !== 1) throw new Error('EDB_DIARY_CLOSE_CONFLICT');
}

async function assertIncidentScope(params: {
  db: D1Database;
  empresaId: number;
  diaryId: number;
  volumeId: string | null;
}): Promise<void> {
  const diary = await params.db
    .prepare('SELECT id FROM edb_diarios WHERE empresa_id = ? AND id = ? LIMIT 1')
    .bind(params.empresaId, params.diaryId)
    .first<{ id: number }>();
  if (!diary || diary.id !== params.diaryId) throw new Error('EDB_INTEGRITY_INCIDENT_DIARY_SCOPE_MISMATCH');
  if (params.volumeId === null) return;
  const volume = await params.db
    .prepare('SELECT id FROM edb_volumes WHERE empresa_id = ? AND diario_id = ? AND id = ? LIMIT 1')
    .bind(params.empresaId, params.diaryId, params.volumeId)
    .first<{ id: string }>();
  if (!volume || volume.id !== params.volumeId) throw new Error('EDB_INTEGRITY_INCIDENT_VOLUME_SCOPE_MISMATCH');
}

export async function createEdbIntegrityIncident(params: {
  db: D1Database;
  empresaId: number;
  incidentId: string;
  diaryId: number;
  volumeId?: string | null;
  kind: EdbInformationLossKind;
  detectedAt: string;
  description: string;
  createdBy?: number | null;
}): Promise<EdbInformationLossIncident> {
  const incident = createEdbInformationLossIncident(params);
  await assertIncidentScope({
    db: params.db,
    empresaId: params.empresaId,
    diaryId: incident.diaryId,
    volumeId: incident.volumeId,
  });
  await params.db
    .prepare(
      `
      INSERT INTO edb_incidentes_integridade (
        id, empresa_id, diario_id, volume_id, tipo, ocorrido_em, descricao,
        police_report_reference, anac_notification_reference, status,
        reconstitution_evidence_json, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'OPEN', ?, ?, ?, datetime('now'), datetime('now'))
    `,
    )
    .bind(
      incident.incidentId,
      params.empresaId,
      incident.diaryId,
      incident.volumeId,
      incident.kind,
      incident.detectedAt,
      incident.description,
      canonicalJson(emptyIncidentEvidence()),
      params.createdBy ?? null,
      params.createdBy ?? null,
    )
    .run();
  return incident;
}

export async function loadEdbIntegrityIncident(params: {
  db: D1Database;
  empresaId: number;
  incidentId: string;
}): Promise<EdbInformationLossIncident | null> {
  const incidentId = requireText(params.incidentId, 'EDB_INTEGRITY_INCIDENT_ID_REQUIRED');
  const row = await params.db
    .prepare(
      `
      SELECT id, empresa_id, diario_id, volume_id, tipo, ocorrido_em, descricao,
             police_report_reference, anac_notification_reference, status,
             reconstitution_evidence_json, created_by, updated_by, created_at, updated_at
      FROM edb_incidentes_integridade
      WHERE empresa_id = ? AND id = ?
      LIMIT 1
    `,
    )
    .bind(params.empresaId, incidentId)
    .first<EdbStoredIntegrityIncidentRow>();
  if (!row) return null;
  if (row.empresa_id !== params.empresaId || row.id !== incidentId) {
    throw new Error('EDB_INTEGRITY_INCIDENT_SCOPE_MISMATCH');
  }
  return hydrateEdbInformationLossIncidentRow(row);
}

async function requireIncident(params: {
  db: D1Database;
  empresaId: number;
  incidentId: string;
}): Promise<EdbInformationLossIncident> {
  const incident = await loadEdbIntegrityIncident(params);
  if (!incident) throw new Error('EDB_INTEGRITY_INCIDENT_NOT_FOUND_OR_SCOPE_MISMATCH');
  return incident;
}

async function persistIncidentProgress(params: {
  db: D1Database;
  empresaId: number;
  previous: EdbInformationLossIncident;
  next: EdbInformationLossIncident;
  updatedBy?: number | null;
}): Promise<void> {
  const result = await params.db
    .prepare(
      `
      UPDATE edb_incidentes_integridade
      SET police_report_reference = ?, anac_notification_reference = ?,
          status = ?, reconstitution_evidence_json = ?,
          updated_by = ?, updated_at = datetime('now')
      WHERE empresa_id = ? AND id = ?
        AND status = ?
        AND COALESCE(police_report_reference, '') = COALESCE(?, '')
        AND COALESCE(anac_notification_reference, '') = COALESCE(?, '')
    `,
    )
    .bind(
      params.next.policeOccurrenceReference,
      params.next.anacNotificationReference,
      mapIncidentStatus(params.next),
      canonicalJson(incidentEvidence(params.next)),
      params.updatedBy ?? null,
      params.empresaId,
      params.previous.incidentId,
      mapIncidentStatus(params.previous),
      params.previous.policeOccurrenceReference,
      params.previous.anacNotificationReference,
    )
    .run();
  if ((result.meta.changes ?? 0) !== 1) throw new Error('EDB_INTEGRITY_INCIDENT_STATE_CONFLICT');
}

export async function recordEdbPoliceOccurrence(params: {
  db: D1Database;
  empresaId: number;
  incidentId: string;
  reference: string;
  reportedAt: string;
  updatedBy?: number | null;
}): Promise<EdbInformationLossIncident> {
  const previous = await requireIncident(params);
  const next = recordPoliceOccurrence(previous, params);
  await persistIncidentProgress({ ...params, previous, next });
  return next;
}

export async function recordEdbAnacInformationLossNotification(params: {
  db: D1Database;
  empresaId: number;
  incidentId: string;
  reference: string;
  notifiedAt: string;
  updatedBy?: number | null;
}): Promise<EdbInformationLossIncident> {
  const previous = await requireIncident(params);
  const next = recordAnacInformationLossNotification(previous, params);
  await persistIncidentProgress({ ...params, previous, next });
  return next;
}

export async function recordEdbSuccessfulReconstitution(params: {
  db: D1Database;
  empresaId: number;
  incidentId: string;
  completedAt: string;
  updatedBy?: number | null;
}): Promise<EdbInformationLossIncident> {
  const previous = await requireIncident(params);
  const next = recordSuccessfulReconstitution(previous, params.completedAt);
  await persistIncidentProgress({ ...params, previous, next });
  return next;
}

export async function recordEdbImpossibleReconstitution(params: {
  db: D1Database;
  empresaId: number;
  incidentId: string;
  completedAt: string;
  newDiaryOpeningObservation: string;
  updatedBy?: number | null;
}): Promise<EdbInformationLossIncident> {
  const previous = await requireIncident(params);
  const next = recordImpossibleReconstitution(previous, params);
  await persistIncidentProgress({ ...params, previous, next });
  return next;
}
