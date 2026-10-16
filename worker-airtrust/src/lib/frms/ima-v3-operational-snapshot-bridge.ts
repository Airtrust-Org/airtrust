/**
 * FRMS V3 — shadow-only bridge between the tenant-scoped operational snapshot
 * and descriptive schedule exposure. It is NOT a dispatch or readiness hook.
 *
 * The caller must authorize crew scope BEFORE loading data. This pure function
 * repeats tenant+crew guards and returns aggregate hours, without identifiers.
 * No DB, network, persistence, REST route, physiological score or flight clearance.
 */
import type { FrmsOperationalSnapshotItem } from './operational-snapshot';
import {
  describeImaScheduleExposure,
  type ScheduleExposureEvent,
  type ScheduleExposureResult,
} from './ima-v3-schedule-exposure';

export type ImaSnapshotEvidenceRow = Pick<
  FrmsOperationalSnapshotItem,
  | 'empresa_id' | 'funcionario_id' | 'data_operacional'
  | 'hora_apresentacao' | 'hora_termino'
  | 'jornada_data_source' | 'operational_data_source'
  | 'escala_source' | 'escalado' | 'teve_jornada'
  | 'snapshot_status'
>;

export interface ImaSnapshotBridgeInput {
  expectedEmpresaId: number;
  expectedFuncionarioId: number;
  snapshotRows: readonly ImaSnapshotEvidenceRow[];
  windowStartAt: string;
  windowEndAt: string;
  /** Fixed operational UTC offset, not the device timezone. */
  referenceUtcOffsetMinutes: number;
}

type RejectionReason = 'INCONSISTENT_SNAPSHOT' | 'UNKNOWN_PROVENANCE' | 'INCOMPLETE_BOUNDARY';

export interface ImaSnapshotBridgeResult {
  exposure: ScheduleExposureResult;
  sourceRows: number;
  mappedActualRows: number;
  mappedPlannedRows: number;
  mappedEstimatedRows: number;
  rejectedRows: number;
  rejectedReasons: Record<RejectionReason, number>;
  operationalDecision: 'NOT_ASSESSED';
  modelValidation: 'NOT_VALIDATED';
}

const ACTUAL_SOURCES = new Set(['CONTROLE_VOOS', 'SIGVOOS']);

function assertAuthorizedId(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('IMA_BRIDGE_AUTHORIZED_ID_REQUIRED');
}

function assertDate(value: string): void {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('IMA_BRIDGE_INVALID_DATE');
  }
  const parts = value.split('-').map(Number);
  const ms = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
    throw new Error('IMA_BRIDGE_INVALID_DATE');
  }
}

function parseClock(value: string | null): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 ||
      Number(match[3] ?? 0) > 59) return null;
  return match[1] + ':' + match[2] + ':' + (match[3] ?? '00');
}

function offsetString(value: number): string {
  if (!Number.isInteger(value) || value < -720 || value > 840) {
    throw new Error('IMA_BRIDGE_INVALID_OFFSET');
  }
  const abs = Math.abs(value);
  return (value >= 0 ? '+' : '-') +
    String(Math.floor(abs / 60)).padStart(2, '0') + ':' +
    String(abs % 60).padStart(2, '0');
}

function nextDate(date: string): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Conservative source precedence. A real jornada can be considered ACTUAL
 * only when backed by canonical Controle de Voos/SIGVOOS provenance.
 * Mixed fallback and manual/unclear lineage are ESTIMATED, never actual.
 * An EVD scale with no real jornada is PLANNED. No roster-only rows.
 */
function classify(row: ImaSnapshotEvidenceRow):
  | 'ACTUAL' | 'PLANNED' | 'ESTIMATED' | RejectionReason {
  if (row.snapshot_status === 'INCOMPLETO' || row.jornada_data_source === 'INCONSISTENTE') {
    return 'INCONSISTENT_SNAPSHOT';
  }
  if (row.teve_jornada && row.jornada_data_source === 'REAL') {
    return ACTUAL_SOURCES.has(row.operational_data_source ?? '') ? 'ACTUAL' : 'ESTIMATED';
  }
  if (row.teve_jornada && row.jornada_data_source !== 'AUSENTE') {
    return 'ESTIMATED';
  }
  if (!row.teve_jornada && row.escalado && row.escala_source === 'EVD' &&
      row.jornada_data_source === 'AUSENTE') {
    return 'PLANNED';
  }
  return 'UNKNOWN_PROVENANCE';
}

export function bridgeImaOperationalSnapshot(input: ImaSnapshotBridgeInput): ImaSnapshotBridgeResult {
  assertAuthorizedId(input.expectedEmpresaId);
  assertAuthorizedId(input.expectedFuncionarioId);
  const offset = offsetString(input.referenceUtcOffsetMinutes);
  const seenDays = new Set<string>();
  const events: ScheduleExposureEvent[] = [];
  const rejectedReasons: Record<RejectionReason, number> = {
    INCONSISTENT_SNAPSHOT: 0,
    UNKNOWN_PROVENANCE: 0,
    INCOMPLETE_BOUNDARY: 0,
  };
  let mappedActualRows = 0;
  let mappedPlannedRows = 0;
  let mappedEstimatedRows = 0;

  for (const row of input.snapshotRows) {
    if (row.empresa_id !== input.expectedEmpresaId) throw new Error('IMA_BRIDGE_CROSS_TENANT');
    if (row.funcionario_id !== input.expectedFuncionarioId) throw new Error('IMA_BRIDGE_CROSS_CREW');
    assertDate(row.data_operacional);
    if (seenDays.has(row.data_operacional)) throw new Error('IMA_BRIDGE_DUPLICATE_DAY');
    seenDays.add(row.data_operacional);

    const source = classify(row);
    if (source === 'UNKNOWN_PROVENANCE' || source === 'INCONSISTENT_SNAPSHOT') {
      rejectedReasons[source]++;
      continue;
    }
    const start = parseClock(row.hora_apresentacao);
    const end = parseClock(row.hora_termino);
    if (!start || !end || start === end) {
      rejectedReasons.INCOMPLETE_BOUNDARY++;
      continue;
    }
    const endDate = end < start ? nextDate(row.data_operacional) : row.data_operacional;
    events.push({
      startAt: row.data_operacional + 'T' + start + offset,
      endAt: endDate + 'T' + end + offset,
      activity: 'DUTY',
      source,
    });
    if (source === 'ACTUAL') mappedActualRows++;
    else if (source === 'PLANNED') mappedPlannedRows++;
    else mappedEstimatedRows++;
  }

  // The schedule engine rejects overlaps and keeps gaps UNKNOWN, never sleep.
  const exposure = describeImaScheduleExposure({
    windowStartAt: input.windowStartAt,
    windowEndAt: input.windowEndAt,
    events,
    referenceUtcOffsetMinutes: input.referenceUtcOffsetMinutes,
  });
  return {
    exposure,
    sourceRows: input.snapshotRows.length,
    mappedActualRows,
    mappedPlannedRows,
    mappedEstimatedRows,
    rejectedRows: Object.values(rejectedReasons).reduce((a, b) => a + b, 0),
    rejectedReasons,
    operationalDecision: 'NOT_ASSESSED',
    modelValidation: 'NOT_VALIDATED',
  };
}
