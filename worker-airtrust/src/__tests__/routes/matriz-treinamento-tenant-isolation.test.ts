import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: vi.fn(() => 6),
}));

import { getEmpresaId } from '../../middleware/tenant';
import { errorHandler } from '../../middleware/error-handler';
import matrizTreinamentoRouter from '../../routes/matriz-treinamento';

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/', matrizTreinamentoRouter);
  return {
    request: (path: string) => app.request(path, undefined, { DB: db } as Env),
  };
}

/**
 * O funcionário 42 pertence à empresa 6. Simula uma requisição autenticada
 * em nome da empresa 7 (outro tenant) pedindo os requisitos do funcionário
 * 42: a query `WHERE id = ? AND empresa_id = ?` deve falhar em encontrar o
 * registro, e a rota deve responder 404 — nunca vazar dados de outro tenant,
 * mesmo após a correção do filtro de RENOVADA nesta mesma rota.
 */
function createMockDb() {
  const prepare = vi.fn((query: string) => {
    const normalized = query.replace(/\s+/g, ' ').trim();

    const exec = async (args: unknown[]) => {
      if (normalized.startsWith("PRAGMA table_info('funcionarios')")) {
        return {
          results: [
            { name: 'id' },
            { name: 'nome' },
            { name: 'funcao_id' },
            { name: 'funcao' },
            { name: 'empresa_id' },
            { name: 'deleted_at' },
          ],
        };
      }

      if (normalized.includes('FROM funcionarios') && normalized.includes('WHERE id = ?')) {
        const [, empresaIdArg] = args as [number, number];
        if (empresaIdArg !== 6) return null;
        return { id: 42, nome: 'Tecnico Manutencao', funcao_id: 5, funcao: null };
      }

      return { results: [] };
    };

    return {
      all: async () => exec([]),
      first: async () => exec([]),
      bind: (...args: unknown[]) => ({
        all: async () => {
          const r = await exec(args);
          return r && 'results' in r ? r : { results: [] };
        },
        first: async () => exec(args),
      }),
    };
  });

  return { prepare } as unknown as D1Database;
}

describe('matriz-treinamento tenant isolation', () => {
  it('retorna 404 quando o funcionario pertence a outro tenant', async () => {
    vi.mocked(getEmpresaId).mockReturnValueOnce(7);

    const app = createApp(createMockDb());
    const response = await app.request('/requisitos/42');

    expect(response.status).toBe(404);
  });

  it('retorna 200 quando o funcionario pertence ao tenant correto', async () => {
    vi.mocked(getEmpresaId).mockReturnValueOnce(6);

    const app = createApp(createMockDb());
    const response = await app.request('/requisitos/42');

    expect(response.status).toBe(200);
  });
});
