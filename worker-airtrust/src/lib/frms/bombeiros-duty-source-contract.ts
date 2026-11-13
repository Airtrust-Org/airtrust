/**
 * BOA source-neutral operational duty contract. Validation is not ingestion:
 * no D1/R2 writes, tenant linkage, scientific approval or dispatch decisions.
 * External opaque IDs MUST be resolved against a governed BOA source and the
 * canonical employee/tenant registry before any future persistence/reporting.
 */
import { z } from 'zod';

const opaqueId = z.string().min(1).max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const timestamp = z.string().datetime({ offset: true });
const interval = z.object({ start_at: timestamp, end_at: timestamp }).strict();
const activation = z.object({
  external_activation_id: opaqueId,
  interval,
}).strict();
const duty = z.object({
  external_duty_id: opaqueId,
  external_crew_id: opaqueId,
  external_sector_id: opaqueId,
  external_base_id: opaqueId,
  external_mission_id: opaqueId.nullable(),
  source_record_revision: opaqueId,
  source_record_updated_at: timestamp,
  planned: interval.nullable(),
  actual: interval.nullable(),
  standby_state: z.enum(['RECORDED', 'NOT_APPLICABLE', 'UNKNOWN']),
  standby: interval.nullable(),
  activation_state: z.enum(['COMPLETE', 'UNKNOWN']),
  activations: z.array(activation).max(64),
}).strict();

export const BoaOperationalSourceBatchSchema = z.object({
  schema: z.literal('BOA_OPERATIONAL_SOURCE_BATCH_V1'),
  source: z.object({
    source_system_id: opaqueId,
    dataset_id: opaqueId,
    export_id: opaqueId,
    export_revision: opaqueId,
    exported_at: timestamp,
    source_document_reference: opaqueId,
  }).strict(),
  records: z.array(duty).min(1).max(500),
}).strict();

export type BoaOperationalSourceBatch = z.infer<typeof BoaOperationalSourceBatchSchema>;
type TimeWindow = z.infer<typeof interval>;

function bounds(value: TimeWindow, label: string): { start: number; end: number; elapsed_ms: number } {
  const start = Date.parse(value.start_at);
  const end = Date.parse(value.end_at);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) {
    throw new Error('BOA_SOURCE_INVALID_INTERVAL_' + label);
  }
  return { start, end, elapsed_ms: end - start };
}

function assertNoOverlap(
  intervals: Array<{ start: number; end: number }>, code: string,
): void {
  const ordered = [...intervals].sort((a, b) => a.start - b.start);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].start < ordered[i - 1].end) {
      throw new Error(code);
    }
  }
}

export interface BoaDutyCandidateEvidence {
  external_duty_id: string;
  external_crew_id: string;
  planned_elapsed_ms: number | null;
  actual_elapsed_ms: number | null;
  standby_elapsed_ms: number | null;
  activation_elapsed_ms: number | null;
  missing_sources: string[];
}

export interface BoaDutyCandidateBatch {
  contract_version: 'BOA_OPERATIONAL_SOURCE_BATCH_V1';
  verification: 'SCHEMA_VALID_SOURCE_UNVERIFIED';
  tenant_identity_link: 'NOT_RESOLVED';
  source_approval: 'NOT_EVALUATED';
  persisted: false;
  scientific_risk_score: null;
  dispatch_permission: 'NOT_GRANTED';
  operational_exposure_denominator_ms: null;
  coverage_rate: null;
  candidate_totals_ms: {
    planned: number | null;
    actual: number | null;
    standby: number | null;
    activations: number | null;
  };
  source: BoaOperationalSourceBatch['source'];
  records: BoaDutyCandidateEvidence[];
}

/**
 * Validates an untrusted export before any approved mapping/import workflow.
 * Durations are elapsed wall-clock milliseconds, NOT flight hours, rest credit,
 * a validated exposure denominator or a fatigue-risk calculation.
 * A missing source remains null; "not applicable" is an explicit zero.
 */
export function validateBoaOperationalSourceBatch(input: unknown): BoaDutyCandidateBatch {
  const batch = BoaOperationalSourceBatchSchema.parse(input);
  const exportedAt = Date.parse(batch.source.exported_at);
  const seenDuties = new Set<string>();
  const seenActivations = new Set<string>();
  const plannedByCrew = new Map<string, Array<{ start: number; end: number }>>();
  const actualByCrew = new Map<string, Array<{ start: number; end: number }>>();

  const records: BoaDutyCandidateEvidence[] = batch.records.map(record => {
    if (seenDuties.has(record.external_duty_id)) {
      throw new Error('BOA_SOURCE_DUPLICATE_DUTY');
    }
    seenDuties.add(record.external_duty_id);
    if (Date.parse(record.source_record_updated_at) > exportedAt) {
      throw new Error('BOA_SOURCE_REVISION_AFTER_EXPORT');
    }
    if ((record.standby_state === 'RECORDED') !== (record.standby !== null)) {
      throw new Error('BOA_SOURCE_STANDBY_STATE_MISMATCH');
    }
    if (record.activation_state === 'UNKNOWN' && record.activations.length !== 0) {
      throw new Error('BOA_SOURCE_ACTIVATION_STATE_MISMATCH');
    }
    if (record.planned === null && record.actual === null && record.standby === null) {
      throw new Error('BOA_SOURCE_NO_DUTY_EVIDENCE');
    }
    const planned = record.planned ? bounds(record.planned, 'PLANNED') : null;
    const actual = record.actual ? bounds(record.actual, 'ACTUAL') : null;
    const standby = record.standby ? bounds(record.standby, 'STANDBY') : null;
    // A completed observed interval cannot end after its source revision
    // or export snapshot. Future planned duty is intentionally exempt.
    const revisedAt = Date.parse(record.source_record_updated_at);
    for (const [kind, observed] of [['ACTUAL', actual], ['STANDBY', standby]] as const) {
      if (observed && observed.end > exportedAt) {
        throw new Error('BOA_SOURCE_OBSERVED_AFTER_EXPORT_' + kind);
      }
      if (observed && observed.end > revisedAt) {
        throw new Error('BOA_SOURCE_OBSERVED_AFTER_REVISION_' + kind);
      }
    }
    for (const [value, map] of [[planned, plannedByCrew], [actual, actualByCrew]] as const) {
      if (value) {
        const intervals = map.get(record.external_crew_id) ?? [];
        intervals.push(value);
        map.set(record.external_crew_id, intervals);
      }
    }
    const activationIntervals = record.activations.map(item => {
      if (seenActivations.has(item.external_activation_id)) {
        throw new Error('BOA_SOURCE_DUPLICATE_ACTIVATION');
      }
      seenActivations.add(item.external_activation_id);
      const time = bounds(item.interval, 'ACTIVATION');
      const within = [actual, standby].some(parent =>
        parent !== null && time.start >= parent.start && time.end <= parent.end);
      if (!within) throw new Error('BOA_SOURCE_ACTIVATION_OUTSIDE_RECORDED_DUTY');
      return time;
    });
    assertNoOverlap(activationIntervals, 'BOA_SOURCE_OVERLAPPING_ACTIVATIONS');
    return {
      external_duty_id: record.external_duty_id,
      external_crew_id: record.external_crew_id,
      planned_elapsed_ms: planned?.elapsed_ms ?? null,
      actual_elapsed_ms: actual?.elapsed_ms ?? null,
      standby_elapsed_ms: record.standby_state === 'NOT_APPLICABLE'
        ? 0 : standby?.elapsed_ms ?? null,
      activation_elapsed_ms: record.activation_state === 'UNKNOWN'
        ? null : activationIntervals.reduce((sum, x) => sum + x.elapsed_ms, 0),
      missing_sources: [
        ...(planned ? [] : ['PLANNED_DUTY_NOT_PROVIDED']),
        ...(actual ? [] : ['ACTUAL_DUTY_NOT_PROVIDED']),
        ...(record.standby_state === 'UNKNOWN' ? ['STANDBY_STATUS_UNKNOWN'] : []),
        ...(record.activation_state === 'UNKNOWN' ? ['ACTIVATION_COVERAGE_UNKNOWN'] : []),
      ],
    };
  });
  for (const intervals of plannedByCrew.values()) {
    assertNoOverlap(intervals, 'BOA_SOURCE_OVERLAPPING_PLANNED_DUTIES');
  }
  for (const intervals of actualByCrew.values()) {
    assertNoOverlap(intervals, 'BOA_SOURCE_OVERLAPPING_ACTUAL_DUTIES');
  }
  const total = (key: 'planned_elapsed_ms' | 'actual_elapsed_ms' |
    'standby_elapsed_ms' | 'activation_elapsed_ms'): number | null =>
    records.every(record => record[key] !== null)
      ? records.reduce((sum, record) => sum + (record[key] ?? 0), 0) : null;
  return {
    contract_version: 'BOA_OPERATIONAL_SOURCE_BATCH_V1',
    verification: 'SCHEMA_VALID_SOURCE_UNVERIFIED',
    tenant_identity_link: 'NOT_RESOLVED',
    source_approval: 'NOT_EVALUATED',
    persisted: false,
    scientific_risk_score: null,
    dispatch_permission: 'NOT_GRANTED',
    operational_exposure_denominator_ms: null,
    coverage_rate: null,
    candidate_totals_ms: {
      planned: total('planned_elapsed_ms'),
      actual: total('actual_elapsed_ms'),
      standby: total('standby_elapsed_ms'),
      activations: total('activation_elapsed_ms'),
    },
    source: batch.source,
    records,
  };
}
