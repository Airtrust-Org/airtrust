import { describe, expect, it } from 'vitest';
import { buscarAcumuloTripulante } from '../../lib/frms/db-service-acumulo';
import { LIMITES_DEFAULT } from '../../lib/frms/types';

const TRIPULANTE_ID = '7';
const EMPRESA_ID = 42;

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

type JornadaRow = {
  tripulante_id: string;
  data: string;
  status: string;
  duracao_jornada_minutos: number;
  horas_voo_minutos: number;
  origem?: string;
};

type FatorizacaoRow = {
  data: string;
  origem?: string;
  total_fatorizado_jornada: number;
  total_fatorizado_hv: number;
};

function createDbFixture(input: {
  jornadaRows: JornadaRow[];
  fatorizacaoRows: FatorizacaoRow[];
  effectivenessRow?: {
    reference_date: string;
    checkin_id: string | null;
    checkin_hora_apresentacao: string | null;
    checkin_wake_time: string | null;
    checkin_horas_sono: number | null;
    effectiveness_pct: number | null;
    effectiveness_nivel: string | null;
    effectiveness_componentes_json: string | null;
  } | null;
}) {
  const statements: string[] = [];

  function isCanonicalRow(query: string, origem?: string): boolean {
    if (
      !query.includes("UPPER(COALESCE(origem, '')) = 'SIGVOOS'") &&
      !query.includes("UPPER(COALESCE(j.origem, '')) = 'SIGVOOS'")
    ) {
      return true;
    }
    return String(origem ?? 'SIGVOOS').toUpperCase() === 'SIGVOOS';
  }

  const db = {
    prepare: (query: string) => ({
      bind: (...args: unknown[]) => ({
        all: async () => {
          statements.push(query);

          if (query.includes('FROM frms_profile_assignments')) {
            return { results: [{ regulatory_profile_id: 'profile-1', profile_code: 'LEGACY_GENERAL' }] };
          }
          if (query.includes('FROM frms_config_revisions')) {
            return {
              results: [
                {
                  id: 'rev-1',
                  empresa_id: Number(args[0]) || null,
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
                },
              ],
            };
          }
          if (query.includes('FROM frms_config_parameters')) {
            const merged: Record<string, number> = {
              ...LIMITES_DEFAULT,
              ...FADIGA_POLICY_DEFAULTS,
              ...FORTNIGHT_POLICY_DEFAULTS,
              HV_MES_HORAS: 112.5,
              HV_7_DIAS_HORAS: 27,
              ALERTA_AVISO_PCT: 80,
              ALERTA_ATENCAO_PCT: 90,
              ALERTA_CRITICO_PCT: 95,
            };
            return {
              results: Object.entries(merged).map(([key, value]) => ({
                revision_id: 'rev-1',
                parameter_key: key,
                numeric_value: value,
                json_value: null,
              })),
            };
          }

          if (query.includes('SELECT status, duracao_jornada_minutos, horas_voo_minutos')) {
            const mes = String(args[1] ?? '');
            return {
              results: input.jornadaRows.filter(
                (row) =>
                  row.tripulante_id === String(args[0]) &&
                  row.data.startsWith(`${mes}-`) &&
                  isCanonicalRow(query, row.origem),
              ),
            };
          }

          if (query.includes('SELECT f.total_fatorizado_jornada, f.total_fatorizado_hv')) {
            const mes = String(args[1] ?? '');
            return {
              results: input.fatorizacaoRows
                .filter(
                  (row) => row.data.startsWith(`${mes}-`) && isCanonicalRow(query, row.origem),
                )
                .map((row) => ({
                  total_fatorizado_jornada: row.total_fatorizado_jornada,
                  total_fatorizado_hv: row.total_fatorizado_hv,
                })),
            };
          }

          return { results: [] };
        },
        first: async () => {
          statements.push(query);

          if (query.includes("COALESCE(p.nome, 'Tripulante #'")) {
            return { nome: 'Dieter' };
          }

          if (query.includes('SELECT ar.* FROM frms_acumulo_rolling ar')) {
            return {
              tripulante_id: TRIPULANTE_ID,
              data_referencia: '2026-06-05',
              hv_7_dias_min: 800,
              pct_limite_7d: 30,
              hv_365_dias_min: 6000,
              pct_limite_365d: 10,
              hv_dia_min: 200,
              pct_limite_dia: 25,
            };
          }

          if (query.includes("SELECT strftime('%Y-%m', data) as mes FROM frms_jornada")) {
            const eligible = input.jornadaRows
              .filter((row) => row.tripulante_id === String(args[0]))
              .filter((row) => isCanonicalRow(query, row.origem))
              .sort((left, right) => right.data.localeCompare(left.data));
            const mes = eligible[0]?.data.slice(0, 7);
            return mes ? { mes } : null;
          }

          if (query.includes('SELECT j.data AS reference_date, ch.id AS checkin_id')) {
            return input.effectivenessRow ?? null;
          }

          if (query.includes('SELECT f.effectiveness_pct')) {
            return null;
          }

          return null;
        },
        run: async () => ({ success: true }),
      }),
    }),
  } as unknown as D1Database;

  return { db, statements };
}

describe('buscarAcumuloTripulante source policy', () => {
  it('ignora FIRA e MANUAL no bloco mensal, preservando apenas SIGVOOS operacional', async () => {
    const { db, statements } = createDbFixture({
      jornadaRows: [
        {
          tripulante_id: TRIPULANTE_ID,
          data: '2026-06-01',
          status: 'ES',
          duracao_jornada_minutos: 595,
          horas_voo_minutos: 1537,
          origem: 'FIRA',
        },
        {
          tripulante_id: TRIPULANTE_ID,
          data: '2026-06-02',
          status: 'ES',
          duracao_jornada_minutos: 315,
          horas_voo_minutos: 189,
          origem: 'SIGVOOS',
        },
        {
          tripulante_id: TRIPULANTE_ID,
          data: '2026-06-03',
          status: 'TS',
          duracao_jornada_minutos: 391,
          horas_voo_minutos: 282,
          origem: 'SIGVOOS',
        },
        {
          tripulante_id: TRIPULANTE_ID,
          data: '2026-06-04',
          status: 'RE',
          duracao_jornada_minutos: 123,
          horas_voo_minutos: 222,
          origem: 'MANUAL',
        },
      ],
      fatorizacaoRows: [
        {
          data: '2026-06-01',
          origem: 'FIRA',
          total_fatorizado_jornada: 9.9,
          total_fatorizado_hv: 9.9,
        },
        {
          data: '2026-06-02',
          origem: 'SIGVOOS',
          total_fatorizado_jornada: 0.3,
          total_fatorizado_hv: 0.2,
        },
        {
          data: '2026-06-03',
          origem: 'SIGVOOS',
          total_fatorizado_jornada: 0.4,
          total_fatorizado_hv: 0.3,
        },
      ],
    });

    const resultado = await buscarAcumuloTripulante(db, TRIPULANTE_ID, EMPRESA_ID, '2026-06');

    expect(resultado.mensal).toMatchObject({
      jornada_realizada_min: 706,
      hv_realizada_min: 471,
      jornada_fatorizada_pct: 0.7,
      hv_fatorizada_pct: 0.5,
      dias_embarcado: 2,
    });
    expect(
      statements.some((sql) => sql.includes("UPPER(COALESCE(origem, '')) = 'SIGVOOS'")),
    ).toBe(true);
    expect(resultado.rolling?.hv_7_dias_min).toBe(800);
    expect(resultado.rolling?.hv_365_dias_min).toBe(6000);
    expect(resultado.rolling?.hv_dia_min).toBe(200);
  });

  it('sem mes explicito usa o ultimo mes com SIGVOOS operacional em vez de um mes apenas FIRA', async () => {
    const { db } = createDbFixture({
      jornadaRows: [
        {
          tripulante_id: TRIPULANTE_ID,
          data: '2026-07-01',
          status: 'ES',
          duracao_jornada_minutos: 595,
          horas_voo_minutos: 1537,
          origem: 'FIRA',
        },
        {
          tripulante_id: TRIPULANTE_ID,
          data: '2026-06-05',
          status: 'ES',
          duracao_jornada_minutos: 315,
          horas_voo_minutos: 189,
          origem: 'SIGVOOS',
        },
      ],
      fatorizacaoRows: [
        {
          data: '2026-06-05',
          origem: 'SIGVOOS',
          total_fatorizado_jornada: 0.2,
          total_fatorizado_hv: 0.1,
        },
      ],
    });

    const resultado = await buscarAcumuloTripulante(db, TRIPULANTE_ID, EMPRESA_ID);

    expect(resultado.mensal).toMatchObject({
      jornada_realizada_min: 315,
      hv_realizada_min: 189,
    });
  });

  it('não reutiliza effectiveness antigo quando a jornada mais recente não tem check-in completo', async () => {
    const { db } = createDbFixture({
      jornadaRows: [
        {
          tripulante_id: TRIPULANTE_ID,
          data: '2026-06-05',
          status: 'ES',
          duracao_jornada_minutos: 315,
          horas_voo_minutos: 189,
          origem: 'SIGVOOS',
        },
      ],
      fatorizacaoRows: [],
      effectivenessRow: {
        reference_date: '2026-06-05',
        checkin_id: null,
        checkin_hora_apresentacao: null,
        checkin_wake_time: null,
        checkin_horas_sono: null,
        effectiveness_pct: 92,
        effectiveness_nivel: 'Normal',
        effectiveness_componentes_json: '{"repouso":0.1}',
      },
    });

    const resultado = await buscarAcumuloTripulante(db, TRIPULANTE_ID, EMPRESA_ID, '2026-06');

    expect(resultado.effectiveness).toBeNull();
    expect(resultado.effectiveness_status).toBe('CHECKIN_REQUIRED');
    expect(resultado.effectiveness_reference_date).toBe('2026-06-05');
  });

  it('expõe effectiveness somente para a jornada mais recente com check-in completo do mesmo dia', async () => {
    const { db } = createDbFixture({
      jornadaRows: [
        {
          tripulante_id: TRIPULANTE_ID,
          data: '2026-06-05',
          status: 'ES',
          duracao_jornada_minutos: 315,
          horas_voo_minutos: 189,
          origem: 'SIGVOOS',
        },
      ],
      fatorizacaoRows: [],
      effectivenessRow: {
        reference_date: '2026-06-05',
        checkin_id: 'ck-5',
        checkin_hora_apresentacao: '06:20',
        checkin_wake_time: '04:45',
        checkin_horas_sono: 7.5,
        effectiveness_pct: 82,
        effectiveness_nivel: 'ATENCAO',
        effectiveness_componentes_json: '{"repouso":-0.2}',
      },
    });

    const resultado = await buscarAcumuloTripulante(db, TRIPULANTE_ID, EMPRESA_ID, '2026-06');

    expect(resultado.effectiveness).toMatchObject({
      effectiveness_pct: 82,
      effectiveness_nivel: 'ATENCAO',
      effectiveness_componentes: { repouso: -0.2 },
    });
    expect(resultado.effectiveness_status).toBe('AVAILABLE');
    expect(resultado.effectiveness_reference_date).toBe('2026-06-05');
  });

});
