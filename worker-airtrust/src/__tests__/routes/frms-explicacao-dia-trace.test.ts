import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

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
        diagnostico: { faixa: string };
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
