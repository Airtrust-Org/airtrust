import { describe, expect, it } from 'vitest';
import { validateBoaOperationalSourceBatch } from '../../lib/frms/bombeiros-duty-source-contract';

const batch = () => ({
  schema: 'BOA_OPERATIONAL_SOURCE_BATCH_V1',
  source: {
    source_system_id: 'BOA-UNVERIFIED-EXPORT',
    dataset_id: 'qa-20261021',
    export_id: 'export-1',
    export_revision: 'rev-1',
    exported_at: '2026-10-21T16:00:00-03:00',
    source_document_reference: 'qa-document-1',
  },
  records: [{
    external_duty_id: 'duty-1',
    external_crew_id: 'opaque-crew-1',
    external_sector_id: 'sector-a',
    external_base_id: 'base-a',
    external_mission_id: null,
    source_record_revision: 'record-rev-1',
    source_record_updated_at: '2026-10-21T15:00:00-03:00',
    planned: { start_at: '2026-10-20T22:00:00-03:00', end_at: '2026-10-21T06:00:00-03:00' },
    actual: { start_at: '2026-10-20T22:30:00-03:00', end_at: '2026-10-21T06:30:00-03:00' },
    standby_state: 'RECORDED',
    standby: { start_at: '2026-10-20T22:30:00-03:00', end_at: '2026-10-21T01:30:00-03:00' },
    activation_state: 'COMPLETE',
    activations: [{
      external_activation_id: 'activation-1',
      interval: { start_at: '2026-10-20T23:00:00-03:00', end_at: '2026-10-20T23:30:00-03:00' },
    }],
  }],
});

describe('BOA source-neutral duty and activation contract (no writes)', () => {
  it('keeps provenance, distinct planned/actual/standby/activation durations and no operational denominator', () => {
    const result = validateBoaOperationalSourceBatch(batch());
    expect(result).toMatchObject({
      verification: 'SCHEMA_VALID_SOURCE_UNVERIFIED',
      tenant_identity_link: 'NOT_RESOLVED',
      source_approval: 'NOT_EVALUATED',
      persisted: false,
      scientific_risk_score: null,
      dispatch_permission: 'NOT_GRANTED',
      operational_exposure_denominator_ms: null,
      coverage_rate: null,
      candidate_totals_ms: {
        planned: 8 * 3600000,
        actual: 8 * 3600000,
        standby: 3 * 3600000,
        activations: 30 * 60000,
      },
    });
    expect(result.records[0].missing_sources).toEqual([]);
    expect(result.candidate_totals_ms.actual).toBe(8 * 3600000);
    expect(result.candidate_totals_ms.activations).not.toBe(8 * 3600000 + 30 * 60000);
  });

  it('never treats absent actual/activation coverage as zero or an exposure denominator', () => {
    const data = batch();
    data.records[0].actual = null as never;
    data.records[0].activation_state = 'UNKNOWN';
    data.records[0].activations = [];
    data.records[0].standby_state = 'UNKNOWN';
    data.records[0].standby = null as never;
    const result = validateBoaOperationalSourceBatch(data);
    expect(result.candidate_totals_ms.actual).toBeNull();
    expect(result.candidate_totals_ms.activations).toBeNull();
    expect(result.candidate_totals_ms.standby).toBeNull();
    expect(result.operational_exposure_denominator_ms).toBeNull();
    expect(result.records[0].missing_sources).toContain('ACTUAL_DUTY_NOT_PROVIDED');
    expect(result.records[0].missing_sources).toContain('ACTIVATION_COVERAGE_UNKNOWN');
  });

  it('records explicit not-applicable standby as zero without inferring unknown coverage', () => {
    const data = batch();
    data.records[0].standby_state = 'NOT_APPLICABLE';
    data.records[0].standby = null as never;
    const result = validateBoaOperationalSourceBatch(data);
    expect(result.candidate_totals_ms.standby).toBe(0);
  });

  it('rejects duplicate duties and overlapping actual duties for the same external crew', () => {
    const duplicate = batch();
    duplicate.records.push({ ...duplicate.records[0] });
    expect(() => validateBoaOperationalSourceBatch(duplicate)).toThrow('BOA_SOURCE_DUPLICATE_DUTY');
    const overlap = batch();
    overlap.records.push({
      ...overlap.records[0], external_duty_id: 'duty-2',
      activation_state: 'UNKNOWN', activations: [],
    });
    expect(() => validateBoaOperationalSourceBatch(overlap)).toThrow(/OVERLAPPING_PLANNED_DUTIES|OVERLAPPING_ACTUAL_DUTIES/);
  });

  it('rejects impossible chronology, incomplete provenance and contradictory source states', () => {
    const backwards = batch();
    backwards.records[0].actual.end_at = backwards.records[0].actual.start_at;
    expect(() => validateBoaOperationalSourceBatch(backwards)).toThrow('BOA_SOURCE_INVALID_INTERVAL_ACTUAL');
    const afterExport = batch();
    afterExport.records[0].source_record_updated_at = '2026-10-22T16:00:00-03:00';
    expect(() => validateBoaOperationalSourceBatch(afterExport)).toThrow('BOA_SOURCE_REVISION_AFTER_EXPORT');
    const mismatch = batch();
    mismatch.records[0].standby_state = 'UNKNOWN';
    expect(() => validateBoaOperationalSourceBatch(mismatch)).toThrow('BOA_SOURCE_STANDBY_STATE_MISMATCH');
    const missingSource = batch();
    delete (missingSource.source as Record<string, unknown>).source_document_reference;
    expect(() => validateBoaOperationalSourceBatch(missingSource)).toThrow();
  });

  it('rejects overlapping activations, outside windows, and reused activation identifiers', () => {
    const overlapping = batch();
    overlapping.records[0].activations.push({
      external_activation_id: 'activation-2',
      interval: { start_at: '2026-10-20T23:15:00-03:00', end_at: '2026-10-20T23:45:00-03:00' },
    });
    expect(() => validateBoaOperationalSourceBatch(overlapping)).toThrow('BOA_SOURCE_OVERLAPPING_ACTIVATIONS');
    const outside = batch();
    outside.records[0].activations[0].interval.start_at = '2026-10-21T07:00:00-03:00';
    outside.records[0].activations[0].interval.end_at = '2026-10-21T07:30:00-03:00';
    expect(() => validateBoaOperationalSourceBatch(outside)).toThrow('BOA_SOURCE_ACTIVATION_OUTSIDE_RECORDED_DUTY');
    const duplicate = batch();
    duplicate.records[0].activations.push({ ...duplicate.records[0].activations[0] });
    expect(() => validateBoaOperationalSourceBatch(duplicate)).toThrow('BOA_SOURCE_DUPLICATE_ACTIVATION');
  });

  it('rejects completed observations after export or source revision but permits future plans', () => {
    const futureActual = batch();
    futureActual.records[0].actual.end_at = '2026-10-22T06:30:00-03:00';
    expect(() => validateBoaOperationalSourceBatch(futureActual))
      .toThrow('BOA_SOURCE_OBSERVED_AFTER_EXPORT_ACTUAL');

    const staleRevision = batch();
    staleRevision.records[0].source_record_updated_at = '2026-10-21T05:00:00-03:00';
    expect(() => validateBoaOperationalSourceBatch(staleRevision))
      .toThrow('BOA_SOURCE_OBSERVED_AFTER_REVISION_ACTUAL');

    const futureStandby = batch();
    futureStandby.records[0].actual = null as never;
    futureStandby.records[0].standby!.end_at = '2026-10-22T01:30:00-03:00';
    futureStandby.records[0].activations = [];
    expect(() => validateBoaOperationalSourceBatch(futureStandby))
      .toThrow('BOA_SOURCE_OBSERVED_AFTER_EXPORT_STANDBY');

    const futurePlan = batch();
    futurePlan.records[0].planned = {
      start_at: '2026-10-23T22:00:00-03:00', end_at: '2026-10-24T06:00:00-03:00',
    };
    futurePlan.records[0].actual = null as never;
    futurePlan.records[0].standby_state = 'UNKNOWN';
    futurePlan.records[0].standby = null as never;
    futurePlan.records[0].activation_state = 'UNKNOWN';
    futurePlan.records[0].activations = [];
    const candidate = validateBoaOperationalSourceBatch(futurePlan);
    expect(candidate.records[0].planned_elapsed_ms).toBe(8 * 3600000);
    expect(candidate.operational_exposure_denominator_ms).toBeNull();
  });

  it('rejects missing timezone and injected clinical or tenant-authority fields', () => {
    const noTimezone = batch();
    noTimezone.records[0].planned.start_at = '2026-10-20T22:00:00';
    expect(() => validateBoaOperationalSourceBatch(noTimezone)).toThrow();
    const injected = batch();
    (injected.records[0] as Record<string, unknown>).kss_reported = 9;
    expect(() => validateBoaOperationalSourceBatch(injected)).toThrow();
    const tenant = batch();
    (tenant as Record<string, unknown>).empresa_id = 6;
    expect(() => validateBoaOperationalSourceBatch(tenant)).toThrow();
  });
});
