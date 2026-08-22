import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';
import { errorHandler } from '../../middleware/error-handler';
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

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 99);
    c.set('userRole', 'manager');
    c.set('tenantContext', {
      empresaId: 77,
      empresaCodigo: 'acme',
      empresaNome: 'Acme Air',
      role: 'manager',
      plano: 'pro',
      permissions: ['read'],
    });
    await next();
  },
}));

import frmsRoutes from '../../routes/frms';

function createMockDb(options?: { withCheckin?: boolean }) {
  const writes: string[] = [];

  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...bindArgs: unknown[]) => ({
        first: async () => {
          if (query.includes('FROM funcionarios') && query.includes('empresa_id = ?')) {
            return { id: 41 };
          }

          if (query.includes('FROM frms_explicacao_dia_cache')) {
            return null;
          }

          if (
            query.includes('FROM frms_fatorizacao_jornada fj') &&
            query.includes('j.data = ?') &&
            query.includes('tripulante_nome')
          ) {
            return {
              tripulante_id: '41',
              tripulante_nome: 'Tripulante Teste',
              tripulante_cargo: 'Piloto',
              data_apresentacao: '2026-05-28',
              hora_apresentacao: '07:30',
              hora_acordou: null,
              fonte_sono: 'PADRAO',
              processado_com_bug: 1,
              effectiveness_pct: 82.4,
              effectiveness_nivel: 'ATENCAO',
              effectiveness_componentes_json:
                '{"processo_s":-0.2,"processo_c":-0.5,"repouso":-0.8,"hv":-0.1,"duracao":-0.6}',
              fator_basica_pct: 0.7,
              tempo_abaixo_limiar_min: 35,
              hora_despertar_estimada: '06:00',
              hora_inicio_sono_estimado: '23:00',
              duracao_sono_efetiva_min: 420,
              dia_periodo_embarcado: 3,
              total_dias_periodo: 14,
            };
          }

          if (query.includes('FROM frms_fadiga_checkin') && query.includes('report_source')) {
            if (options?.withCheckin === false) return null;
            return { id: 'ck-1', wake_time: '06:05', report_source: 'CREW_REPORTED' };
          }

          if (query.includes('FROM frms_fadiga_evento e') && query.includes('FRMS_RECALCULO_NECESSARIO')) {
            return null;
          }

          if (query.includes('ORDER BY fj.effectiveness_pct ASC') && query.includes("'-' || ? || ' days'")) {
            const offset = String(bindArgs[4] ?? '');
            if (offset === '6') {
              return { data_apresentacao: '2026-05-26', effectiveness_pct: 79.1 };
            }
            return null;
          }

          return null;
        },
        all: async () => {
          if (query.includes('FROM frms_profile_assignments')) {
            return { results: [{ regulatory_profile_id: 'profile-1', profile_code: 'LEGACY_GENERAL' }] };
          }
          if (query.includes('FROM frms_config_revisions')) {
            return {
              results: [
                {
                  id: 'rev-1',
                  empresa_id: 77,
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
            const merged = {
              ...LIMITES_DEFAULT,
              ...FADIGA_POLICY_DEFAULTS,
              ...FORTNIGHT_POLICY_DEFAULTS,
              EFFECTIV_VERDE_MIN: 90,
              EFFECTIV_AMARELO_MAX: 77,
              EFFECTIV_VERMELHO_MAX: 65,
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
          if (query.includes('FROM frms_configuracao_limites')) {
            return {
              results: [
                { nome: 'EFFECTIV_VERDE_MIN', valor_numerico: 90 },
                { nome: 'EFFECTIV_AMARELO_MAX', valor_numerico: 77 },
                { nome: 'EFFECTIV_VERMELHO_MAX', valor_numerico: 65 },
              ],
            };
          }

          if (query.includes('SELECT') && query.includes('FROM frms_fatorizacao_jornada fj') && query.includes('LIMIT 45')) {
            return {
              results: [{ data_apresentacao: '2026-05-28', effectiveness_pct: 62 }],
            };
          }

          return { results: [] };
        },
        run: async () => {
          writes.push(query);
          if (query.includes('UPDATE frms_explicacao_dia_cache')) {
            return { meta: { changes: 0 } };
          }
          return { meta: { changes: 1 } };
        },
      }),
    })),
  } as unknown as D1Database;

  return { db, writes };
}

function createFrmsApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  app.route('/frms', frmsRoutes);
  return app;
}

describe('GET /frms/tripulante/:id/explicacao-dia backend trace', () => {
  it('retorna explanation_trace com campos novos e mantém shape legado', async () => {
    const app = createFrmsApp();
    const { db, writes } = createMockDb();

    const response = await app.request(
      '/frms/tripulante/41/explicacao-dia?data=2026-05-28&origem=ficha',
      { method: 'GET', headers: { 'CF-Connecting-IP': '127.0.0.1' } },
      { DB: db } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      data: {
        jornada: { effectiveness_pct: number | null };
        diagnostico: {
          faixa: string;
          fatores: Array<{ codigo: string; impacto_pct: number; resumo: string }>;
        };
        explanation_trace: {
          version: string;
          dataQuality: { sourceSummary: string; limitations: string[] };
          sourceFlags: { legacyPreC2: boolean; c2Corrected: boolean };
          windows: { sevenDays: { available: boolean }; twentyEightDays: { available: boolean } };
        };
      };
    };

    expect(payload.success).toBe(true);
    expect(payload.data.jornada.effectiveness_pct).toBe(82.4);
    expect(payload.data.diagnostico.faixa).toBeTruthy();
    const fatorBasica = payload.data.diagnostico.fatores.find((item) => item.codigo === 'basica');
    expect(fatorBasica?.impacto_pct).toBe(0);
    expect(fatorBasica?.resumo).toContain('coeficiente');
    expect(fatorBasica?.resumo).not.toMatch(/\b70(\.0)?\s*pp\b/i);
    expect(payload.data.explanation_trace.version).toBe('frms-day-trace-v1');
    expect(payload.data.explanation_trace.dataQuality.sourceSummary).toBe('legacy');
    expect(payload.data.explanation_trace.sourceFlags.legacyPreC2).toBe(true);
    expect(payload.data.explanation_trace.sourceFlags.c2Corrected).toBe(false);
    expect(payload.data.explanation_trace.windows.sevenDays.available).toBe(true);
    expect(payload.data.explanation_trace.windows.twentyEightDays.available).toBe(false);
    expect(payload.data.explanation_trace.dataQuality.limitations.length).toBeGreaterThan(0);

    const writesLower = writes.map((query) => query.toLowerCase());
    expect(writesLower.some((query) => query.includes('frms_jornada'))).toBe(false);
    expect(writesLower.some((query) => query.includes('frms_fatorizacao_jornada'))).toBe(false);
  });

  it('degrada para default_estimate quando não há check-in', async () => {
    const app = createFrmsApp();
    const { db } = createMockDb({ withCheckin: false });

    const response = await app.request(
      '/frms/tripulante/41/explicacao-dia?data=2026-05-28&origem=ficha',
      { method: 'GET', headers: { 'CF-Connecting-IP': '127.0.0.1' } },
      { DB: db } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { explanation_trace: { dataQuality: { data_source: string; confidence: string } } };
    };
    expect(payload.data.explanation_trace.dataQuality.data_source).toBe('default_estimate');
    expect(payload.data.explanation_trace.dataQuality.confidence).toBe('reduced');
  });
});
