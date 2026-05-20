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
  } as unknown as D1Database;

  return { db, calls };
}

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
          run: () => ({ meta: { changes: 1, last_row_id: 900 } }),
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
    expect(calls.some((call) => call.query.includes('INSERT INTO qualificacoes_historico'))).toBe(
      true,
    );
  });
});
