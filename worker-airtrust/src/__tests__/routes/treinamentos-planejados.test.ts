import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const { registrarAuditoriaMock, syncTreinamentoPlanejadoIntegrationMock } = vi.hoisted(() => ({
  registrarAuditoriaMock: vi.fn(),
  syncTreinamentoPlanejadoIntegrationMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 1,
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: registrarAuditoriaMock,
  extrairUsuarioAuditoria: () => ({ usuario_id: '99', usuario_nome: 'Teste' }),
}));

vi.mock('../../services/treinamentos-planejados-integration', () => ({
  syncTreinamentoPlanejadoIntegration: syncTreinamentoPlanejadoIntegrationMock,
}));

import treinamentosPlanejadosRoutes from '../../routes/treinamentos-planejados';

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  run?: (args: unknown[]) => Promise<unknown> | unknown;
  all?: (args: unknown[]) => Promise<unknown> | unknown;
};

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'run' | 'all' }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const trimmed = query.trim();
      const ddlPrefixes = ['CREATE TABLE', 'CREATE INDEX'];
      const ddlQuery = ddlPrefixes.some((prefix) => trimmed.startsWith(prefix));
      const trainingClassQuery = [
        'treinamentos_dias',
        'treinamentos_instrutores',
        'treinamentos_qualificacoes_geradas',
        'aeronaves',
      ].some((table) => query.includes(table));

      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry && !ddlQuery && !trainingClassQuery) {
        throw new Error(`Unhandled query: ${query}`);
      }

      const handler = entry?.[1];
      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });
        return handler?.all ? handler.all(args) : { results: [] };
      };

      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });
        return handler?.first ? handler.first(args) : null;
      };

      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        return handler?.run ? handler.run(args) : { meta: { changes: 1, last_row_id: 0 } };
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

describe('treinamentos planejados router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registrarAuditoriaMock.mockResolvedValue(undefined);
    syncTreinamentoPlanejadoIntegrationMock.mockResolvedValue(undefined);
  });

  it('cria treinamento planejado com convocados', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM qualificacoes_tipos',
        {
          first: () => ({ id: 9 }),
        },
      ],
      [
        'FROM funcionarios',
        {
          all: () => ({ results: [{ id: 4 }, { id: 11 }, { id: 12 }] }),
        },
      ],
      [
        // M12: janela de deduplicação de duplo-submit — sem turma recente idêntica.
        "-20 seconds",
        {
          first: () => null,
        },
      ],
      [
        'INSERT INTO treinamentos_planejados',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 21 } }),
        },
      ],
      [
        'FROM treinamentos_participantes WHERE treinamento_id = ?',
        {
          all: () => ({ results: [] }),
        },
      ],
      [
        'INSERT INTO treinamentos_participantes',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', treinamentosPlanejadosRoutes);

    const response = await app.fetch(
      new Request('http://localhost/treinamentos/planejados', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          qualificacao_tipo_id: 9,
          titulo: 'CRM Recorrente',
          data_prevista: '2026-06-20',
          hora_inicio: '08:00',
          hora_fim: '12:00',
          instrutor_id: 4,
          local: 'Sala Alpha',
          participante_ids: [11, 12, 12],
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { id: 21 },
    });

    const insertCall = calls.find(
      (call) => call.method === 'run' && call.query.includes('INSERT INTO treinamentos_planejados'),
    );
    expect(insertCall?.args).toEqual([
      1,
      9,
      '2026-06-20',
      '08:00',
      '12:00',
      'PLANEJADO',
      4,
      'Sala Alpha',
      null,
      'CRM Recorrente',
      null,
      null,
      null,
      'TEORICO',
      '2026-06-20',
      '2026-06-20',
      null,
      null,
      null,
      null,
      '99',
    ]);

    const participantInserts = calls.filter(
      (call) =>
        call.method === 'run' && call.query.includes('INSERT INTO treinamentos_participantes'),
    );
    expect(participantInserts.map((call) => call.args)).toEqual([
      [21, 11],
      [21, 12],
    ]);
    expect(syncTreinamentoPlanejadoIntegrationMock).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: 1, treinamentoId: 21 }),
    );
    expect(registrarAuditoriaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tabela: 'treinamentos_planejados',
        acao: 'INSERT',
        registro_id: 21,
      }),
    );
  });

  it('bloqueia modelo de qualificação de outro tenant ou inativo', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM qualificacoes_tipos',
        {
          first: () => null,
        },
      ],
    ]);
    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', treinamentosPlanejadosRoutes);

    const response = await app.fetch(
      new Request('http://localhost/treinamentos/planejados', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          qualificacao_tipo_id: 999,
          titulo: 'Modelo inválido',
          data_prevista: '2026-06-20',
          participante_ids: [],
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('outro tenant'),
    });
    expect(calls.some((call) => call.query.includes('INSERT INTO treinamentos_planejados'))).toBe(
      false,
    );
  });

  it('bloqueia participante de outro tenant', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM qualificacoes_tipos',
        {
          first: () => ({ id: 9 }),
        },
      ],
      [
        'FROM funcionarios',
        {
          all: () => ({ results: [] }),
        },
      ],
    ]);
    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', treinamentosPlanejadosRoutes);

    const response = await app.fetch(
      new Request('http://localhost/treinamentos/planejados', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          qualificacao_tipo_id: 9,
          titulo: 'Participante inválido',
          data_prevista: '2026-06-20',
          participante_ids: [999],
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Participante'),
    });
    expect(calls.some((call) => call.query.includes('INSERT INTO treinamentos_planejados'))).toBe(
      false,
    );
  });

  it('B2: rejeita recurso (simulador) de outro tenant referenciado num dia', async () => {
    const { db, calls } = createMockDb([
      ['FROM qualificacoes_tipos', { first: () => ({ id: 9 }) }],
      ['FROM funcionarios', { all: () => ({ results: [{ id: 11 }] }) }],
      // simulador 777 não pertence ao tenant -> nenhum resultado.
      ['FROM simuladores', { all: () => ({ results: [] }) }],
    ]);
    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', treinamentosPlanejadosRoutes);

    const response = await app.fetch(
      new Request('http://localhost/treinamentos/planejados', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          qualificacao_tipo_id: 9,
          titulo: 'Turma com simulador inválido',
          data_prevista: '2026-06-20',
          participante_ids: [11],
          dias: [
            { data: '2026-06-20', hora_inicio: '08:00', hora_fim: '12:00', simulador_id: 777 },
          ],
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Simulador'),
    });
    expect(calls.some((call) => call.query.includes('INSERT INTO treinamentos_planejados'))).toBe(
      false,
    );
  });

  it('M12: duplo-submit retorna a turma existente (idempotente) sem inserir de novo', async () => {
    const { db, calls } = createMockDb([
      ['FROM qualificacoes_tipos', { first: () => ({ id: 9 }) }],
      ['FROM funcionarios', { all: () => ({ results: [{ id: 11 }] }) }],
      // M12: janela de dedupe encontra uma turma idêntica recém-criada.
      ['-20 seconds', { first: () => ({ id: 55 }) }],
    ]);
    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', treinamentosPlanejadosRoutes);

    const response = await app.fetch(
      new Request('http://localhost/treinamentos/planejados', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          qualificacao_tipo_id: 9,
          titulo: 'CRM Recorrente',
          data_prevista: '2026-06-20',
          participante_ids: [11],
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { id: 55, deduplicated: true },
    });
    expect(calls.some((call) => call.query.includes('INSERT INTO treinamentos_planejados'))).toBe(
      false,
    );
  });

  it('lista treinamentos planejados com resumo e convocados', async () => {
    const { db } = createMockDb([
      [
        'FROM treinamentos_planejados t',
        {
          all: () => ({
            results: [
              {
                id: 31,
                empresa_id: 1,
                qualificacao_tipo_id: 9,
                qualificacao_nome: 'CRM',
                qualificacao_codigo: 'CRM',
                data_prevista: '2026-06-20',
                hora_inicio: '08:00',
                hora_fim: '12:00',
                status: 'PLANEJADO',
                instrutor_id: 4,
                instrutor_nome: 'Instrutor Silva',
                instrutor_guerra: 'Silva',
                local: 'Sala Alpha',
                carga_horaria_prevista: 4,
                titulo: 'CRM Recorrente',
                descricao: 'Revisão anual',
                observacoes: null,
                created_by: 99,
                created_at: '2026-04-29 12:00:00',
                updated_at: '2026-04-29 12:00:00',
                convocados_total: 2,
                confirmados_total: 1,
                presentes_total: 0,
              },
            ],
          }),
        },
      ],
      [
        'SELECT qh.id,',
        {
          all: () => ({ results: [] }),
        },
      ],
      [
        'FROM treinamentos_participantes tp',
        {
          all: () => ({
            results: [
              {
                id: 1,
                treinamento_id: 31,
                funcionario_id: 11,
                funcionario_nome: 'Ana Costa',
                funcionario_guerra: 'Ana',
                funcionario_matricula: '0011',
                funcionario_setor: 'Operações',
                funcionario_funcao: 'Piloto',
                confirmado: 1,
                presente: null,
                aprovado: null,
                nota: null,
                observacoes: null,
                qualificacao_historico_id: null,
              },
              {
                id: 2,
                treinamento_id: 31,
                funcionario_id: 12,
                funcionario_nome: 'Bruno Lima',
                funcionario_guerra: 'Bruno',
                funcionario_matricula: '0012',
                funcionario_setor: 'Operações',
                funcionario_funcao: 'Copiloto',
                confirmado: 0,
                presente: null,
                aprovado: null,
                nota: null,
                observacoes: null,
                qualificacao_historico_id: null,
              },
            ],
          }),
        },
      ],
      [
        'FROM simulador_agendamentos sa',
        {
          all: () => ({ results: [] }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', treinamentosPlanejadosRoutes);

    const response = await app.fetch(
      new Request('http://localhost/treinamentos/planejados?inicio=2026-06-01&fim=2026-06-30'),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        total: 1,
        items: [
          {
            id: 31,
            status: 'PLANEJADO',
            convocados_total: 2,
            confirmados_total: 1,
            participantes: [
              { funcionario_id: 11, confirmado: true },
              { funcionario_id: 12, confirmado: false },
            ],
          },
        ],
      },
    });
  });

  it('atualiza presenca de um convocado e registra auditoria no treinamento', async () => {
    const { db, calls } = createMockDb([
      [
        'SELECT id FROM treinamentos_planejados WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
        {
          first: () => ({ id: 31 }),
        },
      ],
      [
        'FROM treinamentos_participantes',
        {
          first: () => ({ id: 7 }),
        },
      ],
      [
        'UPDATE treinamentos_participantes',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', treinamentosPlanejadosRoutes);

    const response = await app.fetch(
      new Request('http://localhost/treinamentos/planejados/31/presenca', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          funcionario_id: 11,
          confirmado: true,
          presente: true,
          observacoes: 'Participou integralmente',
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { id: 31, funcionario_id: 11 },
    });

    const updateCall = calls.find(
      (call) => call.method === 'run' && call.query.includes('UPDATE treinamentos_participantes'),
    );
    expect(updateCall?.args).toEqual([1, 1, 'Participou integralmente', 31, 11]);
    expect(syncTreinamentoPlanejadoIntegrationMock).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: 1, treinamentoId: 31 }),
    );
    expect(registrarAuditoriaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tabela: 'treinamentos_planejados',
        acao: 'UPDATE',
        registro_id: 31,
        dados_novos: expect.objectContaining({ funcionario_id: 11, presente: true }),
      }),
    );
  });

  it('consolida qualificacao planejada avulsa na lista de planejados', async () => {
    const { db } = createMockDb([
      [
        'FROM treinamentos_planejados t',
        {
          all: () => ({ results: [] }),
        },
      ],
      [
        'FROM qualificacoes_historico qh',
        {
          all: () => ({
            results: [
              {
                id: 4534,
                empresa_id: 6,
                funcionario_id: 3,
                funcionario_nome: 'Antonio',
                funcionario_guerra: 'Antonio',
                funcionario_matricula: '123',
                funcionario_email: 'antonio@example.com',
                funcionario_setor: 'OPS',
                funcionario_funcao: 'Piloto',
                qualificacao_tipo_id: 40,
                qualificacao_nome: 'Ground School G2',
                qualificacao_codigo: 'G2',
                data_planejada: '2026-06-25',
                status: 'PLANEJADA',
                instrutor_nome: null,
                observacoes: null,
              },
            ],
          }),
        },
      ],
      [
        'FROM simulador_agendamentos sa',
        {
          all: () => ({ results: [] }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', treinamentosPlanejadosRoutes);

    const response = await app.fetch(
      new Request(
        'http://localhost/treinamentos/planejados?inicio=2026-06-01&fim=2026-06-30',
      ),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        total: 1,
        items: [
          expect.objectContaining({
            source: 'QUALIFICACAO_PLANEJADA',
            source_id: 4534,
            source_route: '/qualificacoes?id=4534',
            read_only: true,
            status: 'PLANEJADO',
            qualificacao_codigo: 'G2',
            data_prevista: '2026-06-25',
          }),
        ],
      },
    });
  });

  it('consolida sessoes de simulador com status canonico e origem read-only', async () => {
    const { db } = createMockDb([
      [
        'FROM treinamentos_planejados t',
        {
          all: () => ({ results: [] }),
        },
      ],
      [
        'FROM qualificacoes_historico qh',
        {
          all: () => ({ results: [] }),
        },
      ],
      [
        'FROM simulador_agendamentos sa',
        {
          all: () => ({
            results: [
              {
                id: 75,
                empresa_id: 6,
                data_prevista: '2026-06-25',
                hora_inicio: '11:00',
                hora_fim: '13:00',
                status: 'AGENDADO',
                tipo_dispositivo: 'SIMULADOR',
                simulador_id: 16,
                aeronave_id: null,
                sessao_nome: 'SK76 - LOFT E CHECK',
                instrutor_id: 15,
                instrutor_nome: 'Instrutor',
                instrutor_guerra: 'Instr',
                examinador_id: 33,
                examinador_nome: 'Examinador',
                equipamento_nome: 'SK76 FTD',
                observacoes: null,
                linked_qualificacao_historico_id: 4534,
                linked_qualificacao_tipo_id: 40,
                linked_qualificacao_nome: 'Ground School G2',
                linked_qualificacao_codigo: 'G2',
              },
            ],
          }),
        },
      ],
      [
        'FROM sessoes_participantes sp',
        {
          all: () => ({
            results: [
              {
                sessao_id: 75,
                funcionario_id: 3,
                funcionario_nome: 'Antonio',
                funcionario_guerra: 'Antonio',
                funcionario_matricula: '123',
                funcionario_email: 'antonio@example.com',
                funcionario_setor: 'OPS',
                funcionario_funcao: 'Piloto',
                qualificacao_historico_id: 4534,
              },
            ],
          }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', treinamentosPlanejadosRoutes);

    const response = await app.fetch(
      new Request(
        'http://localhost/treinamentos/planejados/calendario?inicio=2026-06-01&fim=2026-06-30',
      ),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        items: [
          expect.objectContaining({
            source: 'SIMULADOR',
            source_id: 75,
            sessao_id: 75,
            source_route: '/simuladores/sessoes/75',
            read_only: true,
            status: 'PLANEJADO',
            qualificacao_codigo: 'G2',
            modalidade: 'SIMULADOR',
            dias: [
              expect.objectContaining({
                sessao_id: 75,
                data: '2026-06-25',
              }),
            ],
          }),
        ],
      },
    });
  });

  it('simuladores_junho_aparecem_na_lista mesmo sem coluna aeronaves.matricula', async () => {
    const { db } = createMockDb([
      [
        'FROM treinamentos_planejados t',
        {
          all: () => ({ results: [] }),
        },
      ],
      [
        'FROM qualificacoes_historico qh',
        {
          all: () => ({ results: [] }),
        },
      ],
      [
        'FROM simulador_agendamentos sa',
        {
          all: () => ({
            results: [
              {
                id: 75,
                empresa_id: 6,
                data_prevista: '2026-06-25',
                hora_inicio: '11:00',
                hora_fim: '13:00',
                status: 'AGENDADO',
                tipo_dispositivo: 'SIMULADOR',
                simulador_id: 16,
                aeronave_id: null,
                sessao_nome: 'SK76 - LOFT E CHECK',
                instrutor_id: 15,
                instrutor_nome: 'Instrutor',
                instrutor_guerra: 'Instr',
                examinador_id: null,
                examinador_nome: null,
                equipamento_nome: 'SK76 FTD',
                observacoes: null,
                linked_qualificacao_historico_id: 4534,
                linked_qualificacao_tipo_id: 40,
                linked_qualificacao_nome: 'SK76 — Currículo de Voo (FFS)',
                linked_qualificacao_codigo: 'G2',
              },
            ],
          }),
        },
      ],
      [
        'FROM sessoes_participantes sp',
        {
          all: () => ({
            results: [
              {
                sessao_id: 75,
                funcionario_id: 3,
                funcionario_nome: 'Antonio Luiz Simões Ramos',
                funcionario_guerra: 'Ramos',
                funcionario_matricula: '00074',
                funcionario_email: 'antonio@example.com',
                funcionario_setor: 'OPS',
                funcionario_funcao: 'Piloto',
                qualificacao_historico_id: 4534,
              },
            ],
          }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', treinamentosPlanejadosRoutes);

    const response = await app.fetch(
      new Request(
        'http://localhost/treinamentos/planejados?source=SIMULADOR&inicio=2026-06-01&fim=2026-06-30',
      ),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        total: 1,
        items: [
          expect.objectContaining({
            source: 'SIMULADOR',
            source_id: 75,
            sessao_id: 75,
            qualificacao_nome: 'SK76 — Currículo de Voo (FFS)',
            dias: [
              expect.objectContaining({
                sessao_id: 75,
                simulador_id: 16,
              }),
            ],
            participantes: [
              expect.objectContaining({
                funcionario_nome: 'Antonio Luiz Simões Ramos',
                qualificacao_historico_id: 4534,
              }),
            ],
          }),
        ],
      },
    });
  });

  it('respeita o filtro source=TURMA e nao mistura fontes virtuais', async () => {
    const { db } = createMockDb([
      [
        'FROM treinamentos_planejados t',
        {
          all: () => ({
            results: [
              {
                id: 21,
                empresa_id: 1,
                qualificacao_tipo_id: 9,
                qualificacao_nome: 'CRM',
                qualificacao_codigo: 'CRM',
                data_prevista: '2026-06-20',
                hora_inicio: '08:00',
                hora_fim: '12:00',
                status: 'PLANEJADO',
                instrutor_id: 4,
                instrutor_nome: 'Instrutor',
                instrutor_guerra: 'Instr',
                local: 'Sala Alpha',
                carga_horaria_prevista: 4,
                titulo: 'CRM Recorrente',
                descricao: null,
                observacoes: null,
                created_by: 99,
                created_at: '2026-06-01',
                updated_at: '2026-06-01',
                codigo_turma: 'CRM-01',
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
              },
            ],
          }),
        },
      ],
      [
        'FROM treinamentos_participantes tp',
        {
          all: () => ({ results: [] }),
        },
      ],
      [
        'FROM treinamentos_dias td',
        {
          all: () => ({ results: [] }),
        },
      ],
      [
        'FROM treinamentos_instrutores ti',
        {
          all: () => ({ results: [] }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', treinamentosPlanejadosRoutes);

    const response = await app.fetch(
      new Request('http://localhost/treinamentos/planejados?source=TURMA'),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        total: 1,
        items: [expect.objectContaining({ id: 21, source: 'TURMA', read_only: false })],
      },
    });
  });
});
