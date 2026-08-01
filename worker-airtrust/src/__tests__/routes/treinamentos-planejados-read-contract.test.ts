import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 99);
    c.set('userRole', 'admin');
    c.set('empresaId', 1);
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 1,
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => next(),
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: async () => ({ mode: 'all', setorIds: [], funcionarioId: null }),
  filterRequestedSetorIdsByAccess: (requested: number[]) => requested,
}));

import treinamentosPlanejadosRoutes from '../../routes/treinamentos-planejados';

type DbCall = {
  query: string;
  args: unknown[];
  method: 'all' | 'first' | 'run';
};

type MockDbOptions = {
  turmaRows?: Record<string, unknown>[];
  qualificationRows?: Record<string, unknown>[];
  simulatorRows?: Record<string, unknown>[];
  failTurma?: boolean;
};

function isTurmaListQuery(query: string): boolean {
  return query.includes('COUNT(tp.id) AS convocados_total');
}

function isQualificationListQuery(query: string): boolean {
  return (
    query.includes('FROM qualificacoes_historico qh') &&
    query.includes('qh.data_conclusao AS data_planejada')
  );
}

function isSimulatorListQuery(query: string): boolean {
  return (
    query.includes('FROM simulador_agendamentos sa') &&
    query.includes('sa.data AS data_prevista')
  );
}

function createReadDb(options: MockDbOptions = {}) {
  const calls: DbCall[] = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' as const });

        if (query.includes('PRAGMA table_info(')) return { results: [] };
        if (isTurmaListQuery(query)) {
          if (options.failTurma) throw new Error('turma source unavailable');
          return { results: options.turmaRows || [] };
        }
        if (isQualificationListQuery(query)) {
          return { results: options.qualificationRows || [] };
        }
        if (isSimulatorListQuery(query)) {
          return { results: options.simulatorRows || [] };
        }
        if (query.includes('FROM treinamentos_participantes tp')) return { results: [] };
        if (query.includes('FROM sessoes_participantes sp')) return { results: [] };

        throw new Error(`Unhandled read query: ${query}`);
      };

      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' as const });
        if (query.includes('sqlite_master')) return { cnt: 0 };
        return null;
      };

      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' as const });
        throw new Error('Consolidated read contract must not execute mutations');
      };

      return {
        all: async () => executeAll([]),
        first: async () => executeFirst([]),
        run: async () => executeRun([]),
        bind: (...args: unknown[]) => ({
          all: async () => executeAll(args),
          first: async () => executeFirst(args),
          run: async () => executeRun(args),
        }),
      };
    }),
  } as unknown as D1Database;

  return { db, calls };
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/treinamentos', treinamentosPlanejadosRoutes);
  return app;
}

async function request(path: string, db: D1Database) {
  return createApp().fetch(
    new Request(`http://localhost${path}`),
    { DB: db } as Env,
    {} as ExecutionContext,
  );
}

function turmaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 31,
    empresa_id: 1,
    qualificacao_tipo_id: 9,
    qualificacao_nome: 'CRM',
    qualificacao_codigo: 'CRM',
    data_prevista: '2026-06-20',
    hora_inicio: '10:00',
    hora_fim: '12:00',
    status: 'PLANEJADO',
    instrutor_id: null,
    instrutor_nome: null,
    instrutor_guerra: null,
    local: 'Sala Alpha',
    carga_horaria_prevista: 2,
    titulo: 'CRM Recorrente',
    descricao: null,
    observacoes: null,
    created_by: 99,
    created_at: '2026-06-01 10:00:00',
    updated_at: '2026-06-01 10:00:00',
    codigo_turma: null,
    modalidade: 'TEORICO',
    data_inicio: '2026-06-20',
    data_fim: '2026-06-20',
    base: null,
    sala: null,
    equipamento_descricao: null,
    limite_participantes: null,
    convocados_total: 0,
    confirmados_total: 0,
    presentes_total: 0,
    ...overrides,
  };
}

function qualificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 4534,
    empresa_id: 1,
    funcionario_id: 3,
    funcionario_nome: 'Antonio',
    funcionario_guerra: 'Antonio',
    funcionario_matricula: '123',
    funcionario_email: 'antonio@example.com',
    funcionario_setor: 'OPS',
    funcionario_funcao: 'Piloto',
    qualificacao_tipo_id: 40,
    qualificacao_nome: 'Ground School',
    qualificacao_codigo: 'G2',
    data_planejada: '2026-06-19',
    status: 'PLANEJADA',
    instrutor_nome: null,
    observacoes: null,
    ...overrides,
  };
}

function simulatorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 75,
    empresa_id: 1,
    data_prevista: '2026-06-20',
    hora_inicio: '08:00',
    hora_fim: '10:00',
    status: 'AGENDADO',
    tipo_dispositivo: 'SIMULADOR',
    simulador_id: 16,
    aeronave_id: null,
    sessao_nome: 'Sessão de simulador',
    instrutor_id: 15,
    instrutor_nome: 'Instrutor',
    instrutor_guerra: 'Instr',
    examinador_id: null,
    examinador_nome: null,
    equipamento_nome: 'FTD',
    observacoes: null,
    linked_qualificacao_historico_id: null,
    linked_qualificacao_tipo_id: 40,
    linked_qualificacao_nome: 'Currículo de voo',
    linked_qualificacao_codigo: 'CV',
    ...overrides,
  };
}

describe('treinamentos planejados consolidated read contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('converte mes bissexto no intervalo completo do calendario', async () => {
    const { db, calls } = createReadDb();

    const response = await request(
      '/treinamentos/planejados/calendario?mes=2028-02&source=TURMA',
      db,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        periodo: { inicio: '2028-02-01', fim: '2028-02-29' },
        items: [],
      },
    });

    const turmaCall = calls.find(
      (call) => call.method === 'all' && isTurmaListQuery(call.query),
    );
    expect(turmaCall?.query).toContain('date(t.data_prevista) >= date(?)');
    expect(turmaCall?.query).toContain('date(t.data_prevista) <= date(?)');
    expect(turmaCall?.args).toEqual([1, '2028-02-01', '2028-02-29']);
  });

  it('ignora mes fora do formato sem inventar intervalo de datas', async () => {
    const { db, calls } = createReadDb();

    const response = await request(
      '/treinamentos/planejados/calendario?mes=2028-2&source=TURMA',
      db,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        periodo: { inicio: null, fim: null },
        items: [],
      },
    });

    const turmaCall = calls.find(
      (call) => call.method === 'all' && isTurmaListQuery(call.query),
    );
    expect(turmaCall?.args).toEqual([1]);
  });

  it('trata source=TREINAMENTOS sem consultar sessoes de simulador', async () => {
    const { db, calls } = createReadDb();

    const response = await request(
      '/treinamentos/planejados?source=treinamentos',
      db,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      success: true,
      data: { total: 0, items: [] },
    });
    expect(calls.some((call) => isTurmaListQuery(call.query))).toBe(true);
    expect(calls.some((call) => isQualificationListQuery(call.query))).toBe(true);
    expect(calls.some((call) => isSimulatorListQuery(call.query))).toBe(false);
    expect(body).not.toHaveProperty('diagnostics');
  });

  it('mantem resposta parcial e diagnostico quando somente uma fonte falha', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { db } = createReadDb({ failTurma: true });

    const response = await request('/treinamentos/planejados', db);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { total: 0, items: [] },
      diagnostics: {
        turma: 'error',
        qualificacao_planejada: 'ok',
        simulador: 'ok',
      },
    });
  });

  it('ordena fontes consolidadas por data e horario sem alterar suas origens', async () => {
    const { db } = createReadDb({
      turmaRows: [turmaRow()],
      qualificationRows: [qualificationRow()],
      simulatorRows: [simulatorRow()],
    });

    const response = await request('/treinamentos/planejados', db);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { items: Array<{ source: string; data_prevista: string; hora_inicio: string | null }> };
    };

    expect(body.data.items.map((item) => item.source)).toEqual([
      'QUALIFICACAO_PLANEJADA',
      'SIMULADOR',
      'TURMA',
    ]);
    expect(body.data.items.map((item) => [item.data_prevista, item.hora_inicio])).toEqual([
      ['2026-06-19', null],
      ['2026-06-20', '08:00'],
      ['2026-06-20', '10:00'],
    ]);
  });
});
