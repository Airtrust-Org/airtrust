import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 1);
    c.set('empresaId', 1);
    c.set('userRole', 'admin');
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: () => ({ empresaId: 1 }),
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn().mockResolvedValue({ mode: 'all', setorIds: [] }),
  buildFuncionarioScopeWhere: vi.fn().mockReturnValue({ clause: '1 = 1', bindings: [] }),
}));

import router from '../../routes/simuladores-planejamento-v2-crew';

function need(employeeId: number, name: string) {
  return {
    need_id: `${employeeId}:1:101`,
    employee_id: employeeId,
    employee_name: name,
    employee_role: employeeId === 10 ? 'Comandante' : 'Copiloto',
    qualification_type_id: 1,
    qualification_code: 'G1',
    qualification_name: 'AW139 — Currículo de Voo - Anual (FFS)',
    expiry_date: '2027-06-30',
    equipment: 'AW139',
    session_model_id: 101,
    session_code: 'S1',
    session_name: 'Sessão 1',
    session_order: 1,
    duration_minutes: 120,
    training_session_count: 4,
  };
}

const allocations = [
  {
    allocation_id: 'filipe-folga',
    employee_id: 10,
    date_start: '2027-06-01',
    date_end: '2027-06-30',
    aircraft_id: null,
    function_code: null,
    situation_type: 'FOLGA',
    situation_blocks_allocation: 0,
    fortnight_id: 1,
    fortnight_number: 1,
    monthly_roster_id: 'junho',
    monthly_roster_status: 'publicada',
    source_revision: '1',
  },
  {
    allocation_id: 'adriana-trabalho',
    employee_id: 20,
    date_start: '2027-06-01',
    date_end: '2027-06-30',
    aircraft_id: 77,
    function_code: 'SIC',
    situation_type: null,
    situation_blocks_allocation: 0,
    fortnight_id: 1,
    fortnight_number: 1,
    monthly_roster_id: 'junho',
    monthly_roster_status: 'publicada',
    source_revision: '1',
  },
  {
    allocation_id: 'castro-folga',
    employee_id: 30,
    date_start: '2027-06-01',
    date_end: '2027-06-30',
    aircraft_id: null,
    function_code: null,
    situation_type: 'FOLGA',
    situation_blocks_allocation: 0,
    fortnight_id: 1,
    fortnight_number: 1,
    monthly_roster_id: 'junho',
    monthly_roster_status: 'publicada',
    source_revision: '1',
  },
];

function buildDb() {
  return {
    prepare: vi.fn((query: string) => {
      let bound: unknown[] = [];
      const statement = {
        bind: (...args: unknown[]) => {
          bound = args;
          return statement;
        },
        first: async () => {
          if (query.includes('FROM empresas_config')) {
            return {
              planejamento_simulador_antecedencia_dias: 90,
              planejamento_simulador_regra_quinzena: 'FOLGA',
              planejamento_simulador_preferencia_sessoes_por_dia: 2,
              planejamento_simulador_preferencia_minutos_por_dia: 240,
              planejamento_simulador_permitir_quebra_preferencia: 1,
              planejamento_simulador_permitir_sessao_compartilhada: 1,
              planejamento_simulador_preferir_mesmo_treinamento: 1,
              planejamento_simulador_preferir_mesma_sessao: 1,
              planejamento_simulador_aprovacao_obrigatoria: 0,
            };
          }
          return null;
        },
        all: async () => {
          if (query.includes('FROM funcionarios f')) {
            return { results: [10, 20, 30].map((id) => ({ id })) };
          }
          if (query.includes('FROM modelos_sessao')) {
            return {
              results: [
                {
                  id: 101,
                  qualificacao_tipo_id: 1,
                  duracao_estimada: 120,
                  ordem_no_treinamento: 1,
                  modelo_aeronave: 'AW139',
                },
              ],
            };
          }
          if (query.includes('FROM escala_alocacoes')) {
            const employeeIds = new Set(bound.slice(1, -2).map(Number));
            return { results: allocations.filter((row) => employeeIds.has(row.employee_id)) };
          }
          return { results: [] };
        },
      };
      return statement;
    }),
  };
}

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/simuladores/planejamento-v2', router);
  return app;
}

describe('simulator planning V2 manual crew replacement', () => {
  it('lists only candidates with a common published FOLGA window', async () => {
    const app = buildApp();
    const response = await app.request(
      '/api/simuladores/planejamento-v2/candidatos',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reference_date: '2027-06-01',
          anchor: need(10, 'Filipe'),
          candidates: [need(20, 'Adriana'), need(30, 'Castro')],
        }),
      },
      { DB: buildDb() } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.data.candidates.map((candidate: any) => candidate.employee_name)).toEqual(['Castro']);
  });

  it('re-pairs Filipe with Castro and leaves Adriana unmatched under FOLGA policy', async () => {
    const app = buildApp();
    const response = await app.request(
      '/api/simuladores/planejamento-v2/reparear',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reference_date: '2027-06-01',
          session_needs: [need(10, 'Filipe'), need(20, 'Adriana'), need(30, 'Castro')],
          locks: [
            {
              anchor_need_id: '10:1:101',
              partner_need_id: '30:1:101',
            },
          ],
        }),
      },
      { DB: buildDb() } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.data.summary.paired_blocks).toBe(1);
    expect(body.data.summary.unmatched_blocks).toBe(1);
    const blocks = body.data.classes.flatMap((trainingClass: any) => trainingClass.blocks);
    const locked = blocks.find((block: any) => block.sessions.length === 2);
    expect(locked.sessions.map((session: any) => session.employee_name).sort()).toEqual(['Castro', 'Filipe']);
    const unmatched = blocks.find((block: any) => block.pairing === 'SEM_DUPLA');
    expect(unmatched.sessions[0].employee_name).toBe('Adriana');
  });

  it('rejects a manual pair without a common FOLGA window', async () => {
    const app = buildApp();
    const response = await app.request(
      '/api/simuladores/planejamento-v2/reparear',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reference_date: '2027-06-01',
          session_needs: [need(10, 'Filipe'), need(20, 'Adriana')],
          locks: [
            {
              anchor_need_id: '10:1:101',
              partner_need_id: '20:1:101',
            },
          ],
        }),
      },
      { DB: buildDb() } as unknown as Env,
    );

    expect(response.status).toBe(400);
    const body = await response.json() as any;
    expect(body.error).toContain('sem disponibilidade comum');
  });
});
