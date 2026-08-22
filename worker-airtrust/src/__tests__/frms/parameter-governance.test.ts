import { describe, expect, it } from 'vitest';
import {
  FRMS_OFFSHORE_PROFILE,
  FrmsParameterResolutionError,
  buildResolvedParameterSet,
  nextRecalcStatus,
  processRecalcRunInChunks,
  resolveEffectiveRevision,
  staleStateForRevision,
  type FrmsConfigParameter,
  type FrmsConfigRevision,
} from '../../lib/frms/parameter-governance';
import {
  LEGACY_FADIGA_BUSINESS_POLICY,
  calcularPenalidadeWOCL,
  calcularScoreFadiga,
  resolveFadigaBusinessPolicy,
} from '../../lib/frms/fadiga-score';
import { resolveFortnightPolicy } from '../../lib/frms/fortnight-indicator';

const revision = (overrides: Partial<FrmsConfigRevision> = {}): FrmsConfigRevision => ({
  id: 'rev-1', empresa_id: 1, profile_code: 'HELICOPTER_OFFSHORE', revision_number: 1,
  status: 'ACTIVE', source_type: 'ACT', source_reference: 'ACT-1', regulatory_profile_id: null, policy_version: '2026.1',
  effective_from: '2026-01-01', effective_to: null, actor_user_id: 'operator', reason: 'test',
  supersedes_revision_id: null, created_at: '2026-01-01 00:00:00', ...overrides,
});

const parameter = (key: string, value = 1): FrmsConfigParameter => ({
  id: `p-${key}`, revision_id: 'rev-1', parameter_key: key, numeric_value: value,
  json_value: null, unit: 'unit', metric: null, window_kind: null, direction: null, required: 1,
  created_at: '2026-01-01 00:00:00',
});

describe('FRMS parameter governance V2', () => {
  it('never lets tenant A resolve tenant B parameters', () => {
    const chosen = resolveEffectiveRevision(
      [revision({ id: 'tenant-a', empresa_id: 1 }), revision({ id: 'tenant-b', empresa_id: 2, revision_number: 9 })],
      1, FRMS_OFFSHORE_PROFILE, '2026-08-21',
    );
    expect(chosen.id).toBe('tenant-a');
  });

  it('does not fall back from HELICOPTER_OFFSHORE to a generic/fixed-wing profile', () => {
    expect(() => resolveEffectiveRevision(
      [revision({ profile_code: 'FIXED_WING', empresa_id: 1 })], 1, FRMS_OFFSHORE_PROFILE, '2026-08-21',
    )).toThrow(/FRMS parameter revision/);
  });

  it('selects the revision in force on the operational date', () => {
    const chosen = resolveEffectiveRevision([
      revision({ id: 'old', effective_to: '2026-06-30', revision_number: 1 }),
      revision({ id: 'new', effective_from: '2026-07-01', revision_number: 2 }),
    ], 1, FRMS_OFFSHORE_PROFILE, '2026-08-21');
    expect(chosen.id).toBe('new');
  });

  it('fails closed when equally preferred revisions overlap', () => {
    expect(() => resolveEffectiveRevision([
      revision({ id: 'first' }),
      revision({ id: 'second' }),
    ], 1, FRMS_OFFSHORE_PROFILE, '2026-08-21')).toThrow(/equally preferred/);
  });

  it('keeps the previous revision available for historical operational dates', () => {
    const historical = resolveEffectiveRevision([
      revision({ id: 'before', effective_from: '2026-01-01', effective_to: '2026-06-30', revision_number: 1 }),
      revision({ id: 'after', effective_from: '2026-07-01', revision_number: 2 }),
    ], 1, FRMS_OFFSHORE_PROFILE, '2026-06-15');
    expect(historical.id).toBe('before');
  });

  it('fails closed when a required parameter is absent', () => {
    expect(() => buildResolvedParameterSet(revision(), [parameter('FDP_MAXIMO_HORAS')], [
      'FDP_MAXIMO_HORAS', 'REPOUSO_MINIMO_HORAS',
    ])).toThrow(FrmsParameterResolutionError);
  });

  it('fails closed when a revision parameter contains invalid JSON', () => {
    expect(() => buildResolvedParameterSet(revision(), [
      { ...parameter('FDP_MAXIMO_HORAS'), json_value: '{invalid' },
    ], ['FDP_MAXIMO_HORAS'])).toThrow(/invalid JSON/);
  });

  it('returns an immutable parameter set tagged with its revision', () => {
    const set = buildResolvedParameterSet(revision({ id: 'rev-7', policy_version: 'MODEL-7' }), [
      { ...parameter('FDP_MAXIMO_HORAS', 11), revision_id: 'rev-7' },
    ], ['FDP_MAXIMO_HORAS']);
    expect(set.revision.id).toBe('rev-7');
    expect(set.modelVersion).toBe('MODEL-7');
    expect(Object.isFrozen(set.values)).toBe(true);
  });

  it('continues past a 1,000-item chunk and completes only after the final chunk', async () => {
    const processed: number[] = [];
    const outcome = await processRecalcRunInChunks({
      load: async (cursor) => cursor == null
        ? { items: Array.from({ length: 1000 }, (_, index) => index), cursor: '1000', hasMore: true }
        : { items: [1000, 1001], cursor: null, hasMore: false },
      process: async (item) => { processed.push(item); },
    });
    expect(outcome).toEqual({ status: 'COMPLETE', processed: 1002, failed: 0 });
    expect(processed).toHaveLength(1002);
  });

  it('exposes a partial failure as FAILED, never COMPLETE', async () => {
    const outcome = await processRecalcRunInChunks({
      load: async () => ({ items: [1, 2], cursor: null, hasMore: false }),
      process: async (item) => { if (item === 2) throw new Error('boom'); },
    });
    expect(outcome).toEqual({ status: 'FAILED', processed: 1, failed: 1 });
    expect(nextRecalcStatus({ status: 'RUNNING', failed_count: 1 }, false)).toBe('FAILED');
  });

  it('preserves deterministic supersession and hides stale results', () => {
    expect(nextRecalcStatus({ status: 'SUPERSEDED', failed_count: 0 }, true)).toBe('SUPERSEDED');
    expect(staleStateForRevision('old-revision', 'new-revision')).toBe('RECALC_PENDING');
    expect(staleStateForRevision('new-revision', 'new-revision')).toBe('CURRENT');
  });

  it('keeps the legacy biological outputs when values are supplied by a governed policy', () => {
    const policy = resolveFadigaBusinessPolicy({
      FATIGUE_MEDICATION_BONUS: 8, FATIGUE_ALCOHOL_BONUS: 15,
      WOCL_START_MINUTE: 120, WOCL_END_MINUTE: 360, WOCL_CENTER_PENALTY: 0.3, WOCL_EDGE_PENALTY: 0.15,
      KSS_NORM_LE_2: 0, KSS_NORM_LE_4: 0.15, KSS_NORM_LE_6: 0.4, KSS_NORM_EQ_7: 0.7, KSS_NORM_EQ_8: 0.85, KSS_NORM_GE_9: 1,
      SLEEP_DURATION_MISSING_NORM: 0.6, SLEEP_DURATION_GE_8_NORM: 0, SLEEP_DURATION_GE_7_NORM: 0.15,
      SLEEP_DURATION_GE_6_NORM: 0.35, SLEEP_DURATION_GE_5_NORM: 0.6, SLEEP_DURATION_GE_4_NORM: 0.8, SLEEP_DURATION_LT_4_NORM: 1,
      SLEEP_QUALITY_MISSING_NORM: 0.4, SLEEP_QUALITY_GE_5_NORM: 0, SLEEP_QUALITY_EQ_4_NORM: 0.2,
      SLEEP_QUALITY_EQ_3_NORM: 0.45, SLEEP_QUALITY_EQ_2_NORM: 0.7, SLEEP_QUALITY_LT_2_NORM: 1,
    });
    expect(calcularPenalidadeWOCL(240, policy)).toBe(calcularPenalidadeWOCL(240));
    const input = { kss_score: 6, horas_sono: 5, qualidade_sono: 3, sintomas_json: null, apto: 1, meds_ult_12h: 1, alcool_ult_12h: 1 } as const;
    const config = { threshold_amarelo: 35, threshold_vermelho: 55, peso_kss: 0.4, peso_sono_duracao: 0.25, peso_sono_qualidade: 0.2, peso_sintomas: 0.15 };
    expect(calcularScoreFadiga(input, config, policy)).toEqual(
      calcularScoreFadiga(input, config, LEGACY_FADIGA_BUSINESS_POLICY),
    );
  });

  it('fails closed for incomplete fortnight policy revisions', () => {
    expect(() => resolveFortnightPolicy({
      FORTNIGHT_CONSECUTIVE_DAYS_ATTENTION: 4,
    })).toThrow('FRMS_PARAMETER_REQUIRED_MISSING');
  });
});
