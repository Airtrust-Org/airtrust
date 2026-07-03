import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 6,
}));

vi.mock('../../services/employee-sector-access', () => ({
  appendEmployeeSectorFilter: vi.fn(),
  assertFuncionarioInScope: vi.fn(async () => undefined),
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [], funcionarioId: null })),
}));

import complianceRouter from '../../routes/compliance';

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', complianceRouter);
  return {
    request: (path: string) =>
      app.request(
        path,
        undefined,
        {
          DB: db,
        } as Env,
      ),
  };
}

function createMockDb() {
  const prepare = vi.fn((query: string) => {
    const normalized = query.replace(/\s+/g, ' ').trim();

    const exec = async (_args: unknown[], method: 'all' | 'first') => {
      if (normalized.startsWith("PRAGMA table_info('qualificacoes_historico')")) {
        return {
          results: [
            { name: 'funcionario_id' },
            { name: 'tipo_qualificacao_id' },
            { name: 'data_realizacao' },
            { name: 'data_vencimento' },
            { name: 'status' },
            { name: 'renovada' },
            { name: 'deleted_at' },
          ],
        };
      }

      if (normalized.startsWith("PRAGMA table_info('licencas')")) {
        return { results: [] };
      }

      if (normalized.includes('FROM funcionarios WHERE deleted_at IS NULL AND ativo = 1')) {
        return {
          success: true,
          results: [
            {
              id: 42,
              nome: 'Tecnico Manutencao',
              matricula: 'TM-42',
              funcao: 'Tecnico de Manutencao',
            },
          ],
        };
      }

      if (normalized.includes('WITH qualificacoes_ativas AS')) {
        if (
          normalized.includes("NOT IN ('CANCELADA', 'RENOVADA')") ||
          normalized.includes('COALESCE(q.renovada, 0) = 0')
        ) {
          return { results: [] };
        }

        return {
          results: [
            {
              funcionario_id: 42,
              codigo: 'NR-12',
              data_vencimento: '2099-12-31',
            },
          ],
        };
      }

      if (normalized.includes('FROM requisitos_compliance')) {
        return {
          results: [
            {
              id: 1,
              funcao: 'Tecnico de Manutencao',
              tipo_recurso: 'qualificacao',
              referencia: 'NR-12',
              descricao: 'Qualificacao obrigatoria NR-12',
            },
          ],
        };
      }

      if (normalized.includes('FROM lms_matriculas')) {
        return { results: [] };
      }

      return method === 'all' ? { results: [] } : null;
    };

    return {
      all: async () => exec([], 'all'),
      first: async () => exec([], 'first'),
      bind: (...args: unknown[]) => ({
        all: async () => exec(args, 'all'),
        first: async () => exec(args, 'first'),
      }),
    };
  });

  return { prepare } as unknown as D1Database;
}

describe('compliance renovada operacional', () => {
  it('nao marca gap quando a ultima qualificacao vigente foi persistida como renovada', async () => {
    const app = createApp(createMockDb());

    const response = await app.request('/compliance/funcionarios');
    const body = (await response.json()) as {
      success: boolean;
      total: number;
      data: Array<{ status: string; nome_completo: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.total).toBe(1);
    expect(body.data).toEqual([
      expect.objectContaining({
        nome_completo: 'Tecnico Manutencao',
        status: 'conforme',
      }),
    ]);
  });
});
