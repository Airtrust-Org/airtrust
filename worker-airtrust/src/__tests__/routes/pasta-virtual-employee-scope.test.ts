import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getEmployeeSectorAccessMock, employeeSectorSqlMock } = vi.hoisted(() => ({
  getEmployeeSectorAccessMock: vi.fn(),
  employeeSectorSqlMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 101);
    c.set('userRole', 'user');
    c.set('empresaId', 6);
    c.set('funcionarioId', 10);
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 6,
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: getEmployeeSectorAccessMock,
  employeeSectorSql: employeeSectorSqlMock,
}));

import pastaVirtualRoutes from '../../routes/pasta-virtual';
import { errorHandler } from '../../middleware/error-handler';

pastaVirtualRoutes.onError(errorHandler);

type DbCall = {
  query: string;
  bindings: unknown[];
  method: 'first' | 'all' | 'run';
};

function createDb() {
  const calls: DbCall[] = [];
  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...bindings: unknown[]) => ({
        first: async () => {
          calls.push({ query, bindings, method: 'first' });
          if (query.includes('COUNT(*) as total')) return { total: 1 };
          if (query.includes('SELECT f.id FROM funcionarios f')) return { id: bindings[0] };
          return null;
        },
        all: async () => {
          calls.push({ query, bindings, method: 'all' });
          if (query.includes('SELECT') && query.includes('d.*')) {
            return {
              results: [
                {
                  id: 1,
                  uuid: 'doc-1',
                  funcionario_id: 10,
                  nome_arquivo: 'CMA.pdf',
                  tipo: 'application/pdf',
                  tamanho: 10,
                  r2_key: 'funcionarios/10/CMA.pdf',
                  created_at: '2026-08-15T00:00:00Z',
                  updated_at: '2026-08-15T00:00:00Z',
                  deleted_at: null,
                  funcionario_nome: 'Funcionário 10',
                },
              ],
            };
          }
          return { results: [] };
        },
        run: async () => {
          calls.push({ query, bindings, method: 'run' });
          return { meta: { changes: 1 } };
        },
      });

      return {
        bind,
        first: () => bind().first(),
        all: () => bind().all(),
        run: () => bind().run(),
      };
    }),
  };

  return { db: db as any, calls };
}

function env(db: any) {
  return {
    DB: db,
    BUCKET: {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
    CORS_ORIGINS: 'http://localhost',
  } as any;
}

describe('pasta virtual employee scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'self',
      setorIds: [],
      funcionarioId: 10,
    });
    employeeSectorSqlMock.mockReturnValue({
      clause: 'f.id = ?',
      bindings: [10],
    });
  });

  it('restringe a listagem geral ao funcionário/setor autorizado', async () => {
    const { db, calls } = createDb();

    const response = await pastaVirtualRoutes.request(
      'http://localhost/?page=1&limit=50',
      { method: 'GET' },
      env(db),
    );

    expect(response.status).toBe(200);

    const countCall = calls.find((call) => call.query.includes('COUNT(*) as total'));
    const listCall = calls.find(
      (call) => call.method === 'all' && call.query.includes('FROM documentos d'),
    );

    expect(countCall?.query).toContain('f.id = ?');
    expect(countCall?.bindings).toEqual([6, 10]);
    expect(listCall?.query).toContain('f.id = ?');
    expect(listCall?.bindings.slice(0, 2)).toEqual([6, 10]);
  });

  it('valida o escopo do funcionário antes de listar documentos por id', async () => {
    const { db, calls } = createDb();

    const response = await pastaVirtualRoutes.request(
      'http://localhost/20',
      { method: 'GET' },
      env(db),
    );

    expect(response.status).toBe(200);
    const scopeCheck = calls.find((call) => call.query.includes('SELECT f.id FROM funcionarios f'));
    expect(scopeCheck?.query).toContain('f.id = ?');
    expect(scopeCheck?.bindings).toEqual([20, 6, 10]);
  });

  it('retorna 404 (nao 403) quando o funcionario esta fora do escopo, sem vazar existencia cross-tenant', async () => {
    const { db, calls } = createDb();
    const noRowsDb = {
      ...db,
      prepare: vi.fn((query: string) => {
        const bind = (...bindings: unknown[]) => ({
          first: async () => {
            calls.push({ query, bindings, method: 'first' });
            return null;
          },
          all: async () => {
            calls.push({ query, bindings, method: 'all' });
            return { results: [] };
          },
          run: async () => {
            calls.push({ query, bindings, method: 'run' });
            return { meta: { changes: 1 } };
          },
        });
        return { bind, first: () => bind().first(), all: () => bind().all(), run: () => bind().run() };
      }),
    };

    const response = await pastaVirtualRoutes.request(
      'http://localhost/999',
      { method: 'GET' },
      env(noRowsDb),
    );

    expect(response.status).toBe(404);
  });

  it('inclui o escopo do funcionário no lookup de download por documento', async () => {
    const { db, calls } = createDb();

    const response = await pastaVirtualRoutes.request(
      'http://localhost/download/999',
      { method: 'GET' },
      env(db),
    );

    expect(response.status).toBe(404);
    const lookup = calls.find(
      (call) => call.method === 'first' && call.query.includes('FROM documentos d'),
    );
    expect(lookup?.query).toContain('f.id = ?');
    expect(lookup?.bindings).toEqual([999, 6, 10]);
  });
});
