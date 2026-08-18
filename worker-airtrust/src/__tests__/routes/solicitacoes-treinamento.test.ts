import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const { sincronizarSolicitacaoAgendadaMock, sincronizarSolicitacaoConcluidaMock } = vi.hoisted(
  () => ({
    sincronizarSolicitacaoAgendadaMock: vi.fn(),
    sincronizarSolicitacaoConcluidaMock: vi.fn(),
  }),
);

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

vi.mock('../../services/treinamentos-planejados-integration', () => ({
  sincronizarSolicitacaoAgendadaComTreinamentoPlanejado: sincronizarSolicitacaoAgendadaMock,
  sincronizarSolicitacaoConcluidaComTreinamentoPlanejado: sincronizarSolicitacaoConcluidaMock,
}));

import solicitacoesRoutes from '../../routes/solicitacoes-treinamento';

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  run?: (args: unknown[]) => Promise<unknown> | unknown;
  all?: (args: unknown[]) => Promise<unknown> | unknown;
};

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'run' | 'all' }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) {
        throw new Error(`Unhandled query: ${query}`);
      }

      const handler = entry[1];
      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });
        return handler.all ? handler.all(args) : { results: [] };
      };

      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });
        return handler.first ? handler.first(args) : null;
      };

      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        return handler.run ? handler.run(args) : { meta: { changes: 1, last_row_id: 0 } };
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
    batch: vi.fn(async (statements: Array<{ run: () => Promise<unknown> }>) => {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    }),
  } as unknown as D1Database;

  return { db, calls };
}

// Shared handlers createQualificationHistoryAtomic's atomic batch needs
// beyond the INSERT itself: buildOlderHistoryUpdate's predecessor-marking
// UPDATE, and the post-batch findExactHistory/findMostRecentRenewedPredecessor
// reads used to build its return value.
const CANONICAL_PRIMITIVE_HANDLERS: Array<[string, QueryHandler]> = [
  [
    'SET renovada = 1',
    { run: () => ({ success: true, meta: { changes: 0, last_row_id: 0 } }) },
  ],
  [
    'SET renovacao_de = (',
    { run: () => ({ success: true, meta: { changes: 1, last_row_id: 0 } }) },
  ],
  [
    'SELECT id,\n              funcionario_id,',
    {
      first: () => ({
        id: 900,
        funcionario_id: 11,
        qualificacao_id: 9,
        qualificacao_codigo: 'CRM',
        data_conclusao: '2026-08-18',
        data_vencimento: '2027-08-18',
        validade_meses: 12,
        tipo_treinamento: 'RECORRENTE',
        carga_horaria: null,
        renovacao_de: null,
      }),
    },
  ],
  ['SELECT id\n         FROM qualificacoes_historico', { first: () => null }],
];

describe('solicitacoes treinamento router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sincronizarSolicitacaoAgendadaMock.mockResolvedValue({ treinamentoPlanejadoId: 77 });
    sincronizarSolicitacaoConcluidaMock.mockResolvedValue({
      treinamentoPlanejadoId: 77,
      qualificacaoHistoricoId: 801,
    });
  });

  it('agenda solicitacao aprovada e delega sincronizacao ao treinamento planejado', async () => {
    const { db, calls } = createMockDb([
      [
        'SELECT id, status FROM solicitacoes_treinamento',
        {
          first: () => ({ id: 'req-1', status: 'APROVADA_OPS' }),
        },
      ],
      [
        "UPDATE solicitacoes_treinamento SET status = 'AGENDADA'",
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', solicitacoesRoutes);

    const response = await app.fetch(
      new Request('http://localhost/treinamentos/solicitacoes/req-1/agendar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data_prevista: '2026-06-20' }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });

    const updateCall = calls.find(
      (call) =>
        call.method === 'run' &&
        call.query.includes("UPDATE solicitacoes_treinamento SET status = 'AGENDADA'"),
    );
    expect(updateCall?.args[0]).toBe('2026-06-20');
    expect(sincronizarSolicitacaoAgendadaMock).toHaveBeenCalledWith({
      db,
      empresaId: 1,
      solicitacaoId: 'req-1',
      dataPrevista: '2026-06-20',
    });
  });

  it('conclui solicitacao sem gerar historico duplicado quando a integracao ja confirmou o treinamento', async () => {
    const { db, calls } = createMockDb([
      [
        'SELECT s.id, s.status, s.solicitante_id, s.qualificacao_id, s.tipo_treinamento',
        {
          first: () => ({
            id: 'req-1',
            status: 'AGENDADA',
            solicitante_id: 11,
            qualificacao_id: 9,
            tipo_treinamento: 'RECORRENTE',
            qualificacao_codigo: 'CRM',
            qualificacao_nome: 'CRM',
            qualificacao_categoria: 'TREINAMENTO',
            qualificacao_validade: 12,
          }),
        },
      ],
      [
        "UPDATE solicitacoes_treinamento SET status = 'CONCLUIDA'",
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', solicitacoesRoutes);

    const response = await app.fetch(
      new Request('http://localhost/treinamentos/solicitacoes/req-1/concluir', {
        method: 'POST',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(sincronizarSolicitacaoConcluidaMock).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: 1, solicitacaoId: 'req-1' }),
    );
    expect(calls.some((call) => call.query.includes('INSERT INTO qualificacoes_historico'))).toBe(
      false,
    );
  });

  it('faz fallback para gerar historico quando nao existe treinamento planejado vinculado', async () => {
    sincronizarSolicitacaoConcluidaMock.mockResolvedValue({
      treinamentoPlanejadoId: null,
      qualificacaoHistoricoId: null,
    });

    const { db, calls } = createMockDb([
      [
        'SELECT s.id, s.status, s.solicitante_id, s.qualificacao_id, s.tipo_treinamento',
        {
          first: () => ({
            id: 'req-1',
            status: 'AGENDADA',
            solicitante_id: 11,
            qualificacao_id: 9,
            tipo_treinamento: 'RECORRENTE',
            qualificacao_codigo: 'CRM',
            qualificacao_nome: 'CRM',
            qualificacao_categoria: 'TREINAMENTO',
            qualificacao_validade: 12,
          }),
        },
      ],
      [
        "UPDATE solicitacoes_treinamento SET status = 'CONCLUIDA'",
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'INSERT INTO qualificacoes_historico',
        {
          run: () => ({ success: true, meta: { changes: 1, last_row_id: 900 } }),
        },
      ],
      ...CANONICAL_PRIMITIVE_HANDLERS,
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', solicitacoesRoutes);

    const response = await app.fetch(
      new Request('http://localhost/treinamentos/solicitacoes/req-1/concluir', {
        method: 'POST',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(calls.some((call) => call.query.includes('INSERT INTO qualificacoes_historico'))).toBe(
      true,
    );
  });

  it('quando a qualificação não pode ser garantida, retorna 409 explícito com committed=true/retryable=true — nunca sucesso silencioso nem falso rollback', async () => {
    sincronizarSolicitacaoConcluidaMock.mockResolvedValue({
      treinamentoPlanejadoId: null,
      qualificacaoHistoricoId: null,
    });

    const { db, calls } = createMockDb([
      [
        'SELECT s.id, s.status, s.solicitante_id, s.qualificacao_id, s.tipo_treinamento',
        {
          first: () => ({
            id: 'req-2',
            status: 'AGENDADA',
            solicitante_id: 11,
            qualificacao_id: 9,
            tipo_treinamento: 'RECORRENTE',
            qualificacao_codigo: 'CRM',
            qualificacao_nome: 'CRM',
            qualificacao_categoria: 'TREINAMENTO',
            qualificacao_validade: 12,
          }),
        },
      ],
      [
        "UPDATE solicitacoes_treinamento SET status = 'CONCLUIDA'",
        {
          // The solicitação's own core write already committed successfully —
          // only the downstream qualification settlement fails below.
          run: () => ({ success: true, meta: { changes: 1 } }),
        },
      ],
      [
        'INSERT INTO qualificacoes_historico',
        {
          run: () => {
            throw new Error('simulated qualification settlement failure');
          },
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', solicitacoesRoutes);

    const response = await app.fetch(
      new Request('http://localhost/treinamentos/solicitacoes/req-2/concluir', {
        method: 'POST',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    // The solicitação's own status UPDATE already ran — it must not be
    // reported as if it never happened.
    expect(calls.some((call) => call.query.includes("SET status = 'CONCLUIDA'"))).toBe(true);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({
      success: false,
      data: { id: 'req-2', committed: true, retryable: true },
    });
  });
});
