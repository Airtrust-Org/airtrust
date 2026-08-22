import { describe, expect, it } from 'vitest';
import { checkFrmsGovernanceReadiness } from '../../lib/frms/frms-governance-readiness';
import { LIMITES_DEFAULT } from '../../lib/frms/types';

const FADIGA_POLICY_DEFAULTS = {
  FATIGUE_MEDICATION_BONUS: 8, FATIGUE_ALCOHOL_BONUS: 15,
  WOCL_START_MINUTE: 120, WOCL_END_MINUTE: 360, WOCL_CENTER_PENALTY: 0.3, WOCL_EDGE_PENALTY: 0.15,
  KSS_NORM_LE_2: 0, KSS_NORM_LE_4: 0.15, KSS_NORM_LE_6: 0.4, KSS_NORM_EQ_7: 0.7, KSS_NORM_EQ_8: 0.85, KSS_NORM_GE_9: 1,
  SLEEP_DURATION_MISSING_NORM: 0.6, SLEEP_DURATION_GE_8_NORM: 0, SLEEP_DURATION_GE_7_NORM: 0.15,
  SLEEP_DURATION_GE_6_NORM: 0.35, SLEEP_DURATION_GE_5_NORM: 0.6, SLEEP_DURATION_GE_4_NORM: 0.8, SLEEP_DURATION_LT_4_NORM: 1,
  SLEEP_QUALITY_MISSING_NORM: 0.4, SLEEP_QUALITY_GE_5_NORM: 0, SLEEP_QUALITY_EQ_4_NORM: 0.2,
  SLEEP_QUALITY_EQ_3_NORM: 0.45, SLEEP_QUALITY_EQ_2_NORM: 0.7, SLEEP_QUALITY_LT_2_NORM: 1,
};

const FORTNIGHT_POLICY_DEFAULTS = {
  FORTNIGHT_CONSECUTIVE_DAYS_ATTENTION: 4, FORTNIGHT_CONSECUTIVE_DAYS_CRITICAL: 5, FORTNIGHT_LOW_SLEEP_HOURS: 6,
  KSS_HIGH_THRESHOLD: 7, FORTNIGHT_LOW_EFFECTIVENESS_PCT: 70,
  FORTNIGHT_DAYS_WITHOUT_DUTY: 2, FORTNIGHT_LONG_REST_MINUTES: 13 * 60, FORTNIGHT_SHORT_AVG_DUTY_MINUTES: 6 * 60,
  FORTNIGHT_SHORT_REST_MINUTES: 10 * 60, FORTNIGHT_EARLY_0600_MINUTES: 6 * 60, FORTNIGHT_EARLY_0700_MINUTES: 7 * 60,
  FORTNIGHT_RECURRING_EARLY_PRESENTATIONS: 2, FORTNIGHT_ROLLING_DUTY_PCT: 0.8,
  FORTNIGHT_SCORE_ATTENTION: 45, FORTNIGHT_SCORE_CRITICAL: 75, FORTNIGHT_SCORE_LIMIT_WEIGHT: 0.65,
  FORTNIGHT_TREND_INCREASING_IMPACT: 6, FORTNIGHT_TREND_REDUCING_IMPACT: -4,
  FORTNIGHT_IMPACT_DAYS_WITHOUT_DUTY: -8, FORTNIGHT_IMPACT_LONG_REST: -6, FORTNIGHT_IMPACT_SHORT_AVG_DUTY: -5,
  FORTNIGHT_IMPACT_NO_EARLY_PRESENTATION: -3, FORTNIGHT_IMPACT_COMPLETE_DATA: -4,
  FORTNIGHT_IMPACT_CONSECUTIVE_ATTENTION: 8, FORTNIGHT_IMPACT_CONSECUTIVE_CRITICAL: 14,
  FORTNIGHT_IMPACT_CHECKIN_PENDING: 10, FORTNIGHT_IMPACT_ESTIMATED_DATA: 7, FORTNIGHT_IMPACT_EARLY_0600: 8,
  FORTNIGHT_IMPACT_RECURRING_EARLY: 5, FORTNIGHT_IMPACT_SHORT_REST: 16, FORTNIGHT_IMPACT_LOW_SLEEP: 12,
  FORTNIGHT_IMPACT_HIGH_KSS: 12, FORTNIGHT_IMPACT_LOW_EFFECTIVENESS: 14, FORTNIGHT_IMPACT_ROLLING_DUTY: 10,
  FORTNIGHT_IMPACT_DAILY_CRITICAL: 18, FORTNIGHT_IMPACT_DAILY_ATTENTION: 7,
};

const REVISION_ID = 'rev-1';
const FULL_PARAMS = { ...LIMITES_DEFAULT, ...FADIGA_POLICY_DEFAULTS, ...FORTNIGHT_POLICY_DEFAULTS };

function revisionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REVISION_ID,
    empresa_id: 10,
    profile_code: 'LEGACY_GENERAL',
    revision_number: 1,
    status: 'ACTIVE',
    source_type: 'TEST_FIXTURE',
    source_reference: null,
    regulatory_profile_id: 'profile-1',
    policy_version: 'FRMS_CONFIG_V1_TEST',
    effective_from: '2000-01-01',
    effective_to: null,
    actor_user_id: null,
    reason: 'test fixture',
    supersedes_revision_id: null,
    created_at: '2000-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createDb(opts: {
  assignments?: Array<{ regulatory_profile_id: string; profile_code: string }>;
  profiles?: Array<{ id: string; active: number }>;
  revisions?: Array<Record<string, unknown>>;
  parameters?: Record<string, number>;
}) {
  const db = {
    prepare: (query: string) => ({
      bind: (..._args: unknown[]) => ({
        all: async () => {
          if (query.includes('FROM frms_profile_assignments')) {
            return { results: opts.assignments ?? [] };
          }
          if (query.includes('FROM frms_regulatory_profiles')) {
            return { results: opts.profiles ?? [] };
          }
          if (query.includes('FROM frms_config_revisions')) {
            return { results: opts.revisions ?? [] };
          }
          if (query.includes('FROM frms_config_parameters')) {
            const merged = opts.parameters ?? FULL_PARAMS;
            return {
              results: Object.entries(merged).map(([key, value]) => ({
                revision_id: REVISION_ID,
                parameter_key: key,
                numeric_value: value,
                json_value: null,
              })),
            };
          }
          return { results: [] };
        },
      }),
    }),
  };
  return db as unknown as Parameters<typeof checkFrmsGovernanceReadiness>[0];
}

describe('checkFrmsGovernanceReadiness', () => {
  it('READY quando assignment/profile/revision/parametros completos', async () => {
    const db = createDb({
      assignments: [{ regulatory_profile_id: 'profile-1', profile_code: 'LEGACY_GENERAL' }],
      profiles: [{ id: 'profile-1', active: 1 }],
      revisions: [revisionRow()],
    });

    const result = await checkFrmsGovernanceReadiness(db, 10, '2026-08-22');

    expect(result).toMatchObject({
      assignment: 'READY',
      profile: 'READY',
      revision: 'READY',
      missingParameters: [],
      ready: true,
    });
  });

  it('MISSING quando não há assignment', async () => {
    const db = createDb({ assignments: [] });
    const result = await checkFrmsGovernanceReadiness(db, 10, '2026-08-22');
    expect(result.assignment).toBe('MISSING');
    expect(result.ready).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('AMBIGUOUS quando há mais de um assignment ativo', async () => {
    const db = createDb({
      assignments: [
        { regulatory_profile_id: 'profile-1', profile_code: 'LEGACY_GENERAL' },
        { regulatory_profile_id: 'profile-2', profile_code: 'HELICOPTER_OFFSHORE' },
      ],
    });
    const result = await checkFrmsGovernanceReadiness(db, 10, '2026-08-22');
    expect(result.assignment).toBe('AMBIGUOUS');
    expect(result.ready).toBe(false);
  });

  it('MISSING no profile quando o perfil regulatório não está ativo', async () => {
    const db = createDb({
      assignments: [{ regulatory_profile_id: 'profile-1', profile_code: 'LEGACY_GENERAL' }],
      profiles: [],
    });
    const result = await checkFrmsGovernanceReadiness(db, 10, '2026-08-22');
    expect(result.assignment).toBe('READY');
    expect(result.profile).toBe('MISSING');
    expect(result.ready).toBe(false);
  });

  it('AMBIGUOUS na revision quando duas revisions empatam em preferencia', async () => {
    const db = createDb({
      assignments: [{ regulatory_profile_id: 'profile-1', profile_code: 'LEGACY_GENERAL' }],
      profiles: [{ id: 'profile-1', active: 1 }],
      revisions: [revisionRow({ id: 'rev-a' }), revisionRow({ id: 'rev-b' })],
    });
    const result = await checkFrmsGovernanceReadiness(db, 10, '2026-08-22');
    expect(result.revision).toBe('AMBIGUOUS');
    expect(result.ready).toBe(false);
  });

  it('INVALID na revision quando falta um parâmetro obrigatório', async () => {
    const { FATIGUE_MEDICATION_BONUS: _omit, ...incomplete } = FULL_PARAMS;
    const db = createDb({
      assignments: [{ regulatory_profile_id: 'profile-1', profile_code: 'LEGACY_GENERAL' }],
      profiles: [{ id: 'profile-1', active: 1 }],
      revisions: [revisionRow()],
      parameters: incomplete,
    });
    const result = await checkFrmsGovernanceReadiness(db, 10, '2026-08-22');
    expect(result.revision).toBe('INVALID');
    expect(result.missingParameters).toContain('FATIGUE_MEDICATION_BONUS');
    expect(result.ready).toBe(false);
  });
});
