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
  requirePermission: () => async (_c: any, next: () => Promise<void>) => next(),
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
          if (query.includes('FROM funcionarios')) {
            const employeeIds = new Set(bound.slice(1).map(Number));
            const rows = [
              { employee_id: 10, quinzena: 'primeira' },
              { employee_id: 20, quinzena: 'segunda' },
              { employee_id: 30, quinzena: 'primeira' },
            ];
            return { results: rows.filter((row) => employeeIds.has(row.employee_id)) };
          }
          if (query.includes('FROM escalas_quinzenas')) {
            return { results: [] };
          }
          if (query.includes('FROM escala_alocacoes')) {
            throw new Error('PLANNER_MUST_NOT_DEPEND_ON_PUBLISHED_MONTHLY_ROSTER');
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
                {
                  id: 102,
                  qualificacao_tipo_id: 1,
                  duracao_estimada: 120,
                  ordem_no_treinamento: 2,
                  modelo_aeronave: 'AW139',
                },
              ],
            };
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
  it('lists candidates from employee Escala 1/2 even without a published future monthly roster', async () => {
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
    const body = (await response.json()) as any;
    expect(body.data.candidates.map((candidate: any) => candidate.employee_name)).toEqual([
      'Castro',
    ]);
  });

  it('re-pairs employees with the same fixed work scale and leaves the opposite scale unmatched under FOLGA policy', async () => {
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
    const body = (await response.json()) as any;
    expect(body.data.summary.paired_blocks).toBe(1);
    expect(body.data.summary.unmatched_blocks).toBe(1);
    const blocks = body.data.classes.flatMap((trainingClass: any) => trainingClass.blocks);
    const locked = blocks.find((block: any) => block.sessions.length === 2);
    expect(locked.sessions.map((session: any) => session.employee_name).sort()).toEqual([
      'Castro',
      'Filipe',
    ]);
    const unmatched = blocks.find((block: any) => block.pairing === 'SEM_DUPLA');
    expect(unmatched.sessions[0].employee_name).toBe('Adriana');
  });

  it('rejects a manual pair whose fixed Escala 1/2 has no common FOLGA window', async () => {
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
    const body = (await response.json()) as any;
    expect(body.error).toContain('sem disponibilidade comum');
  });

  it('offers another pending session for the same participant without requiring the same automatic session order', async () => {
    const app = buildApp();
    const anchor = need(10, 'Filipe');
    const current = need(30, 'Castro');
    const sessionTwo = {
      ...current,
      need_id: '30:1:102',
      session_model_id: 102,
      session_code: 'S2',
      session_name: 'Sessão 2',
      session_order: 2,
    };
    const response = await app.request(
      '/api/simuladores/planejamento-v2/alternativas-sessao',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reference_date: '2027-06-01',
          anchor,
          current,
          candidates: [sessionTwo],
        }),
      },
      { DB: buildDb() } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    const alternative = body.data.alternatives.find((item: any) => item.kind === 'SESSION_NEED');
    expect(alternative).toMatchObject({
      recommended: false,
      selected_need: { need_id: '30:1:102', session_order: 2 },
    });
    expect(alternative.availability.common_date).toMatch(/^2027-06-/);
  });

  it('accepts an explicit manual lock between different session positions when equipment and duration match', async () => {
    const app = buildApp();
    const sessionTwo = {
      ...need(30, 'Castro'),
      need_id: '30:1:102',
      session_model_id: 102,
      session_code: 'S2',
      session_name: 'Sessão 2',
      session_order: 2,
    };
    const response = await app.request(
      '/api/simuladores/planejamento-v2/reparear',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reference_date: '2027-06-01',
          session_needs: [need(10, 'Filipe'), sessionTwo],
          locks: [{ anchor_need_id: '10:1:101', partner_need_id: '30:1:102' }],
        }),
      },
      { DB: buildDb() } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    const paired = body.data.classes.flatMap((trainingClass: any) => trainingClass.blocks)[0];
    expect(paired.sessions.map((session: any) => session.session_order).sort()).toEqual([1, 2]);
  });

  it('preserves periodic-over-semiannual coverage metadata through manual re-pairing', async () => {
    const app = buildApp();
    const promoted = {
      ...need(30, 'Nivaldo'),
      requirement_qualification_type_id: 106,
      requirement_qualification_code: 'G1-SEM',
      requirement_qualification_name: 'AW139 — Currículo de Voo - Semestral (FFS)',
      coverage_reason: 'RECORRENTE_PRIORITARIO_SOBRE_SEMESTRAL',
      satisfies_qualification_type_ids: [1, 106],
      training_program_name: 'AW139 — Currículo de Voo — Periódico',
    };
    const response = await app.request(
      '/api/simuladores/planejamento-v2/reparear',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reference_date: '2027-06-01',
          session_needs: [need(10, 'Filipe'), promoted],
          locks: [{ anchor_need_id: '10:1:101', partner_need_id: '30:1:101' }],
        }),
      },
      { DB: buildDb() } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    const nivaldo = body.data.classes
      .flatMap((trainingClass: any) => trainingClass.blocks)
      .flatMap((block: any) => block.sessions)
      .find((session: any) => session.employee_name === 'Nivaldo');
    expect(nivaldo).toMatchObject({
      requirement_qualification_type_id: 106,
      requirement_qualification_code: 'G1-SEM',
      coverage_reason: 'RECORRENTE_PRIORITARIO_SOBRE_SEMESTRAL',
      satisfies_qualification_type_ids: [1, 106],
      training_program_name: 'AW139 — Currículo de Voo — Periódico',
    });
  });

  it('compares CAE slots against the exact existing proposal without re-pairing an unmatched crew member', async () => {
    const app = buildApp();
    const response = await app.request(
      '/api/simuladores/planejamento-v2/comparar-cae',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reference_date: '2027-06-01',
          session_needs: [need(10, 'Filipe'), need(20, 'Adriana'), need(30, 'Castro')],
          pairing_blocks: [{ need_ids: ['10:1:101', '30:1:101'] }, { need_ids: ['20:1:101'] }],
          cae_availability: {
            schema_version: 'airtrust.cae_availability.v1',
            provider: 'CAE',
            source: {
              kind: 'TEXT',
              filename: 'availability.txt',
              received_at: '2027-06-01T10:00:00Z',
              extracted_at: '2027-06-01T10:00:00Z',
            },
            slots: [
              {
                external_ref: 'AW139-2027-06-20-1000',
                equipment: 'AW139',
                date: '2027-06-20',
                start_time: '10:00',
                end_time: '14:00',
                duration_minutes: 240,
                state: 'OFFERED',
                company: 'TEST',
                participants_mentioned: [],
                confidence: 1,
              },
            ],
            warnings: [],
          },
        }),
      },
      { DB: buildDb() } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.data.summary).toMatchObject({
      session_requirements: 3,
      paired_blocks: 1,
      unmatched_blocks: 1,
    });
    const blocks = body.data.classes.flatMap((trainingClass: any) => trainingClass.blocks);
    const paired = blocks.find((block: any) => block.sessions.length === 2);
    expect(paired.sessions.map((session: any) => session.employee_name).sort()).toEqual([
      'Castro',
      'Filipe',
    ]);
    expect(paired.schedule_status).toBe('SCHEDULED');
    const unmatched = blocks.find((block: any) => block.sessions.length === 1);
    expect(unmatched.sessions[0].employee_name).toBe('Adriana');
    expect(unmatched.schedule_status).toBe('UNMATCHED_CREW');
  });
});
