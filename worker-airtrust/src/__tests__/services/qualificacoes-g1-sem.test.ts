import { describe, expect, it, vi } from 'vitest';

import { garantirG1SemPlanejado } from '../../services/qualificacoes-g1-sem';

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

      const [, handler] = entry;
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
        return handler.run ? handler.run(args) : { meta: { last_row_id: 0 } };
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

describe('qualificacoes-g1-sem', () => {
  it('prioriza o tipo G1-SEM da mesma empresa do funcionario', async () => {
    const { db, calls } = createMockDb([
      [
        'PRAGMA table_info(qualificacoes_tipos)',
        { all: () => ({ results: [{ name: 'empresa_id' }] }) },
      ],
      [
        'FROM funcionarios',
        {
          first: () => ({ empresa_id: 6 }),
        },
      ],
      [
        'FROM qualificacoes_tipos',
        {
          first: (args) => {
            const [empresaId] = args as [number];
            if (empresaId === 6) {
              return { id: 206, categoria: 'QUALIFICACAO' };
            }
            return null;
          },
        },
      ],
      [
        'OR (? IS NOT NULL AND observacoes LIKE ?)',
        {
          first: () => null,
        },
      ],
      [
        "VALUES (?, ?, 'G1-SEM',",
        {
          run: () => ({ meta: { last_row_id: 9001 } }),
        },
      ],
      [
        'SET renovada = 1,',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const result = await garantirG1SemPlanejado(db, {
      funcionarioId: 41,
      dataConclusaoG1: '2026-03-29',
      g1HistoricoId: 7001,
    });

    expect(result).toEqual({ action: 'insert', id: 9001, dataVencimento: '2026-09-29' });
    expect(
      calls.some(
        (call) =>
          call.method === 'run' &&
          call.query.includes("VALUES (?, ?, 'G1-SEM',") &&
          call.args[1] === 206 &&
          call.args[10] === 6,
      ),
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.method === 'run' &&
          call.query.includes('SET renovada = 1,') &&
          call.args[0] === 41 &&
          call.args[1] === 6 &&
          call.args[3] === '2026-03-29',
      ),
    ).toBe(true);
  });

  it('marca G1-SEM mais antigo como renovado ao reutilizar um registro existente', async () => {
    const { db, calls } = createMockDb([
      [
        'PRAGMA table_info(qualificacoes_tipos)',
        { all: () => ({ results: [{ name: 'empresa_id' }] }) },
      ],
      [
        'FROM funcionarios',
        {
          first: () => ({ empresa_id: 6 }),
        },
      ],
      [
        'FROM qualificacoes_tipos',
        {
          first: () => ({ id: 206, categoria: 'QUALIFICACAO' }),
        },
      ],
      [
        'OR (? IS NOT NULL AND observacoes LIKE ?)',
        {
          first: () => ({ id: 9010 }),
        },
      ],
      [
        'SET qualificacao_id = COALESCE(?, qualificacao_id),',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'SET renovada = 1,',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const result = await garantirG1SemPlanejado(db, {
      funcionarioId: 41,
      dataConclusaoG1: '2026-03-29',
      g1HistoricoId: 7001,
    });

    expect(result).toEqual({ action: 'reuse', id: 9010, dataVencimento: '2026-09-29' });
    expect(
      calls.some(
        (call) =>
          call.method === 'run' &&
          call.query.includes('SET renovada = 1,') &&
          call.args[1] === 6 &&
          call.args[2] === 9010,
      ),
    ).toBe(true);
  });
});
