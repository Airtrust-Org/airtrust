import type { EdbRegulatedActor } from '../../services/edb/technical-discrepancy-ledger';
import {
  closeEdbDiaryVolume,
  openEdbDiaryVolume,
  type EdbDiaryVolume,
  type EdbVolumeBoundaryAct,
} from '../../services/edb/diary-governance';

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
}

interface StoredOpeningActEnvelope {
  aircraftRegistration: string;
  act: EdbVolumeBoundaryAct;
}

interface StoredClosingActEnvelope {
  act: EdbVolumeBoundaryAct;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(code);
  return value;
}

function requireTimestamp(value: unknown, code: string): string {
  const normalized = requireText(value, code);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(code);
  return normalized;
}

function parseActor(value: unknown, code: string): EdbRegulatedActor {
  if (!isObject(value)) throw new Error(code);
  return {
    actorRef: requireText(value.actorRef, code),
    displayName: requireText(value.displayName, code),
  };
}

function parseBoundaryAct(value: unknown, expectedType: 'OPENING' | 'CLOSING'): EdbVolumeBoundaryAct {
  if (!isObject(value) || value.type !== expectedType) throw new Error('EDB_VOLUME_ACT_INVALID');
  return {
    type: expectedType,
    occurredAt: requireTimestamp(value.occurredAt, 'EDB_VOLUME_ACT_TIMESTAMP_INVALID'),
    actor: parseActor(value.actor, 'EDB_VOLUME_ACT_ACTOR_INVALID'),
    observations:
      value.observations === null || value.observations === undefined
        ? null
        : requireText(value.observations, 'EDB_VOLUME_ACT_OBSERVATIONS_INVALID'),
  };
}

function parseOpeningEnvelope(value: string): StoredOpeningActEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('EDB_VOLUME_OPENING_ACT_INVALID_JSON');
  }
  if (!isObject(parsed)) throw new Error('EDB_VOLUME_OPENING_ACT_INVALID');
  return {
    aircraftRegistration: requireText(
      parsed.aircraftRegistration,
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

/**
 * Reconstructs the merged pure-domain diary-volume contract from a 0483 row.
 *
 * This is deliberately read-only and fail-closed: duplicated relational/JSON
 * evidence must agree before the row is exposed as a regulated domain object.
 */
export function hydrateEdbDiaryVolumeRow(row: EdbStoredVolumeRow): EdbDiaryVolume {
  requireText(row.id, 'EDB_VOLUME_ID_REQUIRED');
  requirePositiveInteger(row.empresa_id, 'EDB_VOLUME_TENANT_ID_INVALID');
  requirePositiveInteger(row.diario_id, 'EDB_VOLUME_DIARY_ID_INVALID');
  requirePositiveInteger(row.numero_volume, 'EDB_VOLUME_SEQUENCE_INVALID');
  const openedAt = requireTimestamp(row.opened_at, 'EDB_VOLUME_OPENED_AT_INVALID');
  const opening = parseOpeningEnvelope(row.opening_act_json);

  if (opening.act.occurredAt !== openedAt) {
    throw new Error('EDB_VOLUME_OPENING_TIMESTAMP_MISMATCH');
  }

  const opened = openEdbDiaryVolume({
    diaryId: row.diario_id,
    volumeId: row.id,
    aircraftRegistration: opening.aircraftRegistration,
    sequence: row.numero_volume,
    openedAt: opening.act.occurredAt,
    openedBy: opening.act.actor,
    observations: opening.act.observations,
  });

  if (row.status === 'OPEN') {
    if (row.closed_at !== null || row.closing_act_json !== null || row.retencao_minima_ate !== null) {
      throw new Error('EDB_OPEN_VOLUME_HAS_CLOSING_EVIDENCE');
    }
    return opened;
  }

  if (row.status !== 'CLOSED') throw new Error('EDB_VOLUME_STATUS_INVALID');
  if (row.closed_at === null || row.closing_act_json === null) {
    throw new Error('EDB_CLOSED_VOLUME_MISSING_CLOSING_EVIDENCE');
  }

  const closedAt = requireTimestamp(row.closed_at, 'EDB_VOLUME_CLOSED_AT_INVALID');
  const closing = parseClosingEnvelope(row.closing_act_json);
  if (closing.act.occurredAt !== closedAt) {
    throw new Error('EDB_VOLUME_CLOSING_TIMESTAMP_MISMATCH');
  }

  return closeEdbDiaryVolume(opened, {
    closedAt,
    closedBy: closing.act.actor,
    observations: closing.act.observations,
  });
}
