import { canonicalJson } from '../../services/edb/canonical-json';
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
import type { EdbRegulatedActor } from '../../services/edb/technical-discrepancy-ledger';

export interface EdbDiaryRecord {
  diaryId: number;
  empresaId: number;
  aircraftId: number;
  contractVersion: string;
  status: 'ACTIVE' | 'CLOSED';
}

export interface EdbStoredVolumeRow {
  id: string;
  empresa_id: number;
  diario_id: number;
  numero_volume: number;
  status: 'OPEN' | 'CLOSED';
  opened_at: string;
  opening_act_json: string;
  closed_at: string | null;
  closing_act_json: string | null;
  retencao_minima_ate: string | null;
  aircraft_registration: string;
}

export interface EdbStoredIntegrityIncidentRow {
  id: string;
  empresa_id: number;
  diario_id: number;
  volume_id: string | null;
  tipo: EdbInformationLossKind;
  detected_at: string;
  descricao: string;
  police_occurrence_reference: string | null;
  police_reported_at: string | null;
  anac_notification_reference: string | null;
  anac_notified_at: string | null;
  reconstitution_outcome: 'PENDING' | 'RECONSTITUTED' | 'IMPOSSIBLE';
  reconstitution_completed_at: string | null;
  new_diary_opening_observation: string | null;
}

function positiveInteger(value: number, code: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(code);
  return value;
}

function text(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function optionalDate(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error('EDB_VOLUME_RETENTION_DATE_INVALID');
  }
  return normalized;
}

function actorFromUnknown(value: unknown): EdbRegulatedActor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('EDB_VOLUME_ACTOR_INVALID');
  }
  const actor = value as Record<string, unknown>;
  if (typeof actor.actorRef !== 'string' || !actor.actorRef.trim()) {
    throw new Error('EDB_VOLUME_ACTOR_INVALID');
  }
  if (typeof actor.displayName !== 'string' || !actor.displayName.trim()) {
    throw new Error('EDB_VOLUME_ACTOR_INVALID');
  }
  return { actorRef: actor.actorRef.trim(), displayName: actor.displayName.trim() };
}

function parseBoundaryAct(value: string, expected: 'OPENING' | 'CLOSING'): EdbVolumeBoundaryAct {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('EDB_VOLUME_ACT_INVALID_JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('EDB_VOLUME_ACT_INVALID');
  }
  const act = parsed as Record<string, unknown>;
  if (act.type !== expected || typeof act.occurredAt !== 'string' || !Number.isFinite(Date.parse(act.occurredAt))) {
    throw new Error('EDB_VOLUME_ACT_INVALID');
  }
  if (act.observations !== null && typeof act.observations !== 'string') {
    throw new Error('EDB_VOLUME_ACT_INVALID');
  }
  return {
    type: expected,
    occurredAt: act.occurredAt,
    actor: actorFromUnknown(act.actor),
    observations: act.observations as string | null,
  };
}

export function hydrateEdbDiaryVolumeRow(row: EdbStoredVolumeRow): EdbDiaryVolume {
  const opening = parseBoundaryAct(row.opening_act_json, 'OPENING');
  if (opening.occurredAt !== row.opened_at) throw new Error('EDB_VOLUME_OPENING_TIMESTAMP_MISMATCH');

  const opened = openEdbDiaryVolume({
    diaryId: positiveInteger(row.diario_id, 'EDB_VOLUME_DIARY_ID_INVALID'),
    volumeId: text(row.id, 'EDB_VOLUME_ID_INVALID'),
    aircraftRegistration: text(row.aircraft_registration, 'EDB_VOLUME_AIRCRAFT_REGISTRATION_INVALID'),
    sequence: positiveInteger(row.numero_volume, 'EDB_VOLUME_SEQUENCE_INVALID'),
    openedAt: opening.occurredAt,
    openedBy: opening.actor,
    observations: opening.observations,
  });

  if (row.status === 'OPEN') {
    if (row.closed_at !== null || row.closing_act_json !== null) {
      throw new Error('EDB_OPEN_VOLUME_HAS_CLOSING_EVIDENCE');
    }
    return opened;
  }

  if (row.closed_at === null || row.closing_act_json === null) {
    throw new Error('EDB_CLOSED_VOLUME_MISSING_CLOSING_EVIDENCE');
  }
  const closing = parseBoundaryAct(row.closing_act_json, 'CLOSING');
  if (closing.occurredAt !== row.closed_at) throw new Error('EDB_VOLUME_CLOSING_TIMESTAMP_MISMATCH');

  return closeEdbDiaryVolume(opened, {
    closedAt: closing.occurredAt,
    closedBy: closing.actor,
    observations: closing.observations,
  });
}

export function hydrateEdbIntegrityIncidentRow(
  row: EdbStoredIntegrityIncidentRow,
): EdbInformationLossIncident {
  let incident = createEdbInformationLossIncident({
    incidentId: row.id,
    diaryId: row.diario_id,
    volumeId: row.volume_id,
    kind: row.tipo,
    detectedAt: row.detected_at,
    description: row.descricao,
  });

  if (row.police_occurrence_reference !== null || row.police_reported_at !== null) {
    if (row.police_occurrence_reference === null || row.police_reported_at === null) {
      throw new Error('EDB_INCIDENT_POLICE_EVIDENCE_INCOMPLETE');
    }
    incident = recordPoliceOccurrence(incident, {
      reference: row.police_occurrence_reference,
      reportedAt: row.police_reported_at,
    });
  }

  if (row.anac_notification_reference !== null || row.anac_notified_at !== null) {
    if (row.anac_notification_reference === null || row.anac_notified_at === null) {
      throw new Error('EDB_INCIDENT_ANAC_NOTIFICATION_EVIDENCE_INCOMPLETE');
    }
    incident = recordAnacInformationLossNotification(incident, {
      reference: row.anac_notification_reference,
      notifiedAt: row.anac_notified_at,
    });
  }

  if (row.reconstitution_outcome === 'RECONSTITUTED') {
    if (!row.reconstitution_completed_at || row.new_diary_opening_observation !== null) {
      throw new Error('EDB_INCIDENT_RECONSTITUTION_EVIDENCE_INVALID');
    }
    incident = recordSuccessfulReconstitution(incident, row.reconstitution_completed_at);
  } else if (row.reconstitution_outcome === 'IMPOSSIBLE') {
    if (!row.reconstitution_completed_at || !row.new_diary_opening_observation?.trim()) {
      throw new Error('EDB_INCIDENT_RECONSTITUTION_EVIDENCE_INVALID');
    }
    incident = recordImpossibleReconstitution(incident, {
      completedAt: row.reconstitution_completed_at,
      newDiaryOpeningObservation: row.new_diary_opening_observation,
    });
  } else if (row.reconstitution_completed_at !== null || row.new_diary_opening_observation !== null) {
    throw new Error('EDB_PENDING_INCIDENT_HAS_RECONSTITUTION_EVIDENCE');
  }

  return incident;
}

export async function createEdbDiary(params: {
  db: D1Database;
  empresaId: number;
  aircraftId: number;
}): Promise<EdbDiaryRecord> {
  positiveInteger(params.empresaId, 'EDB_DIARY_TENANT_INVALID');
  positiveInteger(params.aircraftId, 'EDB_DIARY_AIRCRAFT_ID_INVALID');

  const row = await params.db.prepare(
    `INSERT INTO edb_diarios (empresa_id, aeronave_id)
     VALUES (?, ?)
     RETURNING id, empresa_id, aeronave_id, contract_version, status`,
  ).bind(params.empresaId, params.aircraftId).first<{
    id: number;
    empresa_id: number;
    aeronave_id: number;
    contract_version: string;
    status: 'ACTIVE' | 'CLOSED';
  }>();

  if (!row) throw new Error('EDB_DIARY_CREATE_FAILED');
  return {
    diaryId: row.id,
    empresaId: row.empresa_id,
    aircraftId: row.aeronave_id,
    contractVersion: row.contract_version,
    status: row.status,
  };
}

export async function getActiveEdbDiaryForAircraft(params: {
  db: D1Database;
  empresaId: number;
  aircraftId: number;
}): Promise<EdbDiaryRecord | null> {
  const row = await params.db.prepare(
    `SELECT id, empresa_id, aeronave_id, contract_version, status
       FROM edb_diarios
      WHERE empresa_id = ? AND aeronave_id = ? AND status = 'ACTIVE'
      LIMIT 1`,
  ).bind(params.empresaId, params.aircraftId).first<{
    id: number;
    empresa_id: number;
    aeronave_id: number;
    contract_version: string;
    status: 'ACTIVE';
  }>();

  return row ? {
    diaryId: row.id,
    empresaId: row.empresa_id,
    aircraftId: row.aeronave_id,
    contractVersion: row.contract_version,
    status: row.status,
  } : null;
}

async function getActiveDiaryContext(params: {
  db: D1Database;
  empresaId: number;
  diaryId: number;
}): Promise<{ aircraftRegistration: string }> {
  const row = await params.db.prepare(
    `SELECT COALESCE(NULLIF(TRIM(a.prefixo), ''), NULLIF(TRIM(a.codigo), '')) AS aircraft_registration
       FROM edb_diarios d
       JOIN aeronaves a
         ON a.id = d.aeronave_id
        AND a.empresa_id = d.empresa_id
        AND a.deleted_at IS NULL
      WHERE d.id = ? AND d.empresa_id = ? AND d.status = 'ACTIVE'
      LIMIT 1`,
  ).bind(params.diaryId, params.empresaId).first<{ aircraft_registration: string | null }>();

  if (!row?.aircraft_registration) throw new Error('EDB_ACTIVE_DIARY_NOT_FOUND_OR_SCOPE_MISMATCH');
  return { aircraftRegistration: row.aircraft_registration };
}

export async function createEdbDiaryVolume(params: {
  db: D1Database;
  empresaId: number;
  diaryId: number;
  volumeId: string;
  sequence: number;
  openedAt: string;
  openedBy: EdbRegulatedActor;
  observations?: string | null;
}): Promise<EdbDiaryVolume> {
  const context = await getActiveDiaryContext(params);
  const volume = openEdbDiaryVolume({
    diaryId: params.diaryId,
    volumeId: params.volumeId,
    aircraftRegistration: context.aircraftRegistration,
    sequence: params.sequence,
    openedAt: params.openedAt,
    openedBy: params.openedBy,
    observations: params.observations,
  });

  const result = await params.db.prepare(
    `INSERT INTO edb_volumes (
       id, empresa_id, diario_id, numero_volume, status,
       opened_at, opening_act_json
     ) VALUES (?, ?, ?, ?, 'OPEN', ?, ?)`,
  ).bind(
    volume.volumeId,
    params.empresaId,
    volume.diaryId,
    volume.sequence,
    volume.openingAct.occurredAt,
    canonicalJson(volume.openingAct),
  ).run();

  if ((result.meta.changes ?? 0) !== 1) throw new Error('EDB_VOLUME_CREATE_FAILED');
  return volume;
}

export async function loadEdbDiaryVolume(params: {
  db: D1Database;
  empresaId: number;
  volumeId: string;
}): Promise<EdbDiaryVolume | null> {
  const row = await params.db.prepare(
    `SELECT v.id, v.empresa_id, v.diario_id, v.numero_volume, v.status,
            v.opened_at, v.opening_act_json, v.closed_at, v.closing_act_json,
            v.retencao_minima_ate,
            COALESCE(NULLIF(TRIM(a.prefixo), ''), NULLIF(TRIM(a.codigo), '')) AS aircraft_registration
       FROM edb_volumes v
       JOIN edb_diarios d ON d.id = v.diario_id AND d.empresa_id = v.empresa_id
       JOIN aeronaves a ON a.id = d.aeronave_id AND a.empresa_id = d.empresa_id
      WHERE v.empresa_id = ? AND v.id = ?
      LIMIT 1`,
  ).bind(params.empresaId, text(params.volumeId, 'EDB_VOLUME_ID_REQUIRED')).first<EdbStoredVolumeRow>();

  return row ? hydrateEdbDiaryVolumeRow(row) : null;
}

export async function closePersistedEdbDiaryVolume(params: {
  db: D1Database;
  empresaId: number;
  volumeId: string;
  closedAt: string;
  closedBy: EdbRegulatedActor;
  observations?: string | null;
  retentionMinimumUntil?: string | null;
}): Promise<EdbDiaryVolume> {
  const current = await loadEdbDiaryVolume(params);
  if (!current) throw new Error('EDB_VOLUME_NOT_FOUND_OR_SCOPE_MISMATCH');

  const closed = closeEdbDiaryVolume(current, {
    closedAt: params.closedAt,
    closedBy: params.closedBy,
    observations: params.observations,
  });

  const result = await params.db.prepare(
    `UPDATE edb_volumes
        SET status = 'CLOSED',
            closed_at = ?,
            closing_act_json = ?,
            retencao_minima_ate = ?,
            updated_at = datetime('now')
      WHERE empresa_id = ? AND id = ? AND diario_id = ? AND status = 'OPEN'`,
  ).bind(
    closed.closingAct!.occurredAt,
    canonicalJson(closed.closingAct),
    optionalDate(params.retentionMinimumUntil),
    params.empresaId,
    closed.volumeId,
    closed.diaryId,
  ).run();

  if ((result.meta.changes ?? 0) !== 1) throw new Error('EDB_VOLUME_CLOSE_CONFLICT');
  return closed;
}

export async function closeEdbDiary(params: {
  db: D1Database;
  empresaId: number;
  diaryId: number;
}): Promise<void> {
  const result = await params.db.prepare(
    `UPDATE edb_diarios
        SET status = 'CLOSED', updated_at = datetime('now')
      WHERE empresa_id = ? AND id = ? AND status = 'ACTIVE'`,
  ).bind(params.empresaId, params.diaryId).run();

  if ((result.meta.changes ?? 0) !== 1) throw new Error('EDB_DIARY_CLOSE_CONFLICT');
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
}): Promise<EdbInformationLossIncident> {
  const incident = createEdbInformationLossIncident(params);
  const result = await params.db.prepare(
    `INSERT INTO edb_incidentes_integridade (
       id, empresa_id, diario_id, volume_id, tipo, detected_at, descricao
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    incident.incidentId,
    params.empresaId,
    incident.diaryId,
    incident.volumeId,
    incident.kind,
    incident.detectedAt,
    incident.description,
  ).run();

  if ((result.meta.changes ?? 0) !== 1) throw new Error('EDB_INCIDENT_CREATE_FAILED');
  return incident;
}

export async function loadEdbIntegrityIncident(params: {
  db: D1Database;
  empresaId: number;
  incidentId: string;
}): Promise<EdbInformationLossIncident | null> {
  const row = await params.db.prepare(
    `SELECT id, empresa_id, diario_id, volume_id, tipo, detected_at, descricao,
            police_occurrence_reference, police_reported_at,
            anac_notification_reference, anac_notified_at,
            reconstitution_outcome, reconstitution_completed_at,
            new_diary_opening_observation
       FROM edb_incidentes_integridade
      WHERE empresa_id = ? AND id = ?
      LIMIT 1`,
  ).bind(params.empresaId, text(params.incidentId, 'EDB_INCIDENT_ID_REQUIRED'))
    .first<EdbStoredIntegrityIncidentRow>();

  return row ? hydrateEdbIntegrityIncidentRow(row) : null;
}

async function mutateIncident(params: {
  db: D1Database;
  empresaId: number;
  incidentId: string;
  mutate: (incident: EdbInformationLossIncident) => EdbInformationLossIncident;
}): Promise<EdbInformationLossIncident> {
  const previous = await loadEdbIntegrityIncident(params);
  if (!previous) throw new Error('EDB_INCIDENT_NOT_FOUND_OR_SCOPE_MISMATCH');
  const next = params.mutate(previous);

  const result = await params.db.prepare(
    `UPDATE edb_incidentes_integridade
        SET police_occurrence_reference = ?,
            police_reported_at = ?,
            anac_notification_reference = ?,
            anac_notified_at = ?,
            reconstitution_outcome = ?,
            reconstitution_completed_at = ?,
            new_diary_opening_observation = ?,
            updated_at = datetime('now')
      WHERE empresa_id = ? AND id = ?
        AND reconstitution_outcome = ?
        AND COALESCE(police_occurrence_reference, '') = COALESCE(?, '')
        AND COALESCE(anac_notification_reference, '') = COALESCE(?, '')`,
  ).bind(
    next.policeOccurrenceReference,
    next.policeReportedAt,
    next.anacNotificationReference,
    next.anacNotifiedAt,
    next.reconstitutionOutcome,
    next.reconstitutionCompletedAt,
    next.newDiaryOpeningObservation,
    params.empresaId,
    next.incidentId,
    previous.reconstitutionOutcome,
    previous.policeOccurrenceReference,
    previous.anacNotificationReference,
  ).run();

  if ((result.meta.changes ?? 0) !== 1) throw new Error('EDB_INCIDENT_STATE_CONFLICT');
  return next;
}

export function recordPersistedEdbPoliceOccurrence(params: {
  db: D1Database;
  empresaId: number;
  incidentId: string;
  reference: string;
  reportedAt: string;
}): Promise<EdbInformationLossIncident> {
  return mutateIncident({
    ...params,
    mutate: (incident) => recordPoliceOccurrence(incident, params),
  });
}

export function recordPersistedEdbAnacNotification(params: {
  db: D1Database;
  empresaId: number;
  incidentId: string;
  reference: string;
  notifiedAt: string;
}): Promise<EdbInformationLossIncident> {
  return mutateIncident({
    ...params,
    mutate: (incident) => recordAnacInformationLossNotification(incident, params),
  });
}

export function recordPersistedEdbSuccessfulReconstitution(params: {
  db: D1Database;
  empresaId: number;
  incidentId: string;
  completedAt: string;
}): Promise<EdbInformationLossIncident> {
  return mutateIncident({
    ...params,
    mutate: (incident) => recordSuccessfulReconstitution(incident, params.completedAt),
  });
}

export function recordPersistedEdbImpossibleReconstitution(params: {
  db: D1Database;
  empresaId: number;
  incidentId: string;
  completedAt: string;
  newDiaryOpeningObservation: string;
}): Promise<EdbInformationLossIncident> {
  return mutateIncident({
    ...params,
    mutate: (incident) => recordImpossibleReconstitution(incident, params),
  });
}
