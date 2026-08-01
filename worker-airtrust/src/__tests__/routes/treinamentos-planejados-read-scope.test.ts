import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

const { accessState, filterRequestedSetorIdsByAccessMock } = vi.hoisted(() => ({
  accessState: {
    current: {
      mode: 'restricted' as 'all' | 'restricted' | 'self',
      setorIds: [10, 20] as number[],
      funcionarioId: null as number | null,
    },
  },
  filterRequestedSetorIdsByAccessMock: vi.fn(
    (requestedSetorIds: number[], access: { setorIds: number[] }) => {
      const allowed = new Set(access.setorIds);
      return requestedSetorIds.filter((setorId) => allowed.has(setorId));
    },
  ),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 99);
    c.set('userRole', accessState.current.mode === 'all' ? 'admin' : 'manager');
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
  getEmployeeSectorAccess: async () => accessState.current,
  filterRequestedSetorIdsByAccess: filterRequestedSetorIdsByAccessMock,
}));

import treinamentosPlanejadosRoutes from '../../routes/treinamentos-planejados';

type DbCall = {
  query: string;
  args: unknown[];
  method: 'all' | 'first' | 'run';
};

function createReadOnlyEmptyDb() {
  const calls: DbCall[] = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' as const });
        return { results: [] };
      };
      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' as const });
        if (query.includes('sqlite_master')) return { cnt: 0 };
        return null;
      };
      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' as const });
        throw new Error('Read-side characterization must not execute mutations');
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
  app.onError(errorHandler);
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

describe('treinamentos planejados read-side sector scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessState.current = {
      mode: 'restricted',
      setorIds: [10, 20],
      funcionarioId: null,
    };
  });

  it.each([
    '/treinamentos/planejados?setor_ids=10,30',
    '/treinamentos/planejados/calendario?setor_ids=10,30',
    '/treinamentos/planejados/auditoria?setor_ids=10,30',
  ])('rejeita filtro fora do escopo antes de consultar dados: %s', async (path) => {
    const { db, calls } = createReadOnlyEmptyDb();

    const response = await request(path, db);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Filtro de setor fora do escopo permitido',
      code: 'SETOR_FORA_DO_ESCOPO',
    });
    expect(filterRequestedSetorIdsByAccessMock).toHaveBeenCalledWith(
      [10, 30],
      expect.objectContaining({ mode: 'restricted', setorIds: [10, 20] }),
    );
    expect(calls).toEqual([]);
  });

  it('normaliza setor_id e setor_ids, remove duplicados e ignora valores inválidos', async () => {
    const { db } = createReadOnlyEmptyDb();

    const response = await request(
      '/treinamentos/planejados?setor_id=10&setor_ids=20,10,abc,0,-2,3.5&source=TURMA',
      db,
    );

    expect(response.status).toBe(200);
    expect(filterRequestedSetorIdsByAccessMock).toHaveBeenCalledTimes(1);
    expect(filterRequestedSetorIdsByAccessMock).toHaveBeenCalledWith(
      [10, 20],
      expect.objectContaining({ mode: 'restricted', setorIds: [10, 20] }),
    );
  });

  it('aplica automaticamente todos os setores permitidos quando não há filtro explícito', async () => {
    const { db, calls } = createReadOnlyEmptyDb();

    const response = await request('/treinamentos/planejados?source=TURMA', db);

    expect(response.status).toBe(200);
    expect(filterRequestedSetorIdsByAccessMock).not.toHaveBeenCalled();

    const listCall = calls.find(
      (call) =>
        call.method === 'all' &&
        call.query.includes('FROM treinamentos_planejados t') &&
        call.query.includes('f3.setor_id IN (?, ?)'),
    );
    expect(listCall?.args).toContain(10);
    expect(listCall?.args).toContain(20);
  });

  it('mantém administradores sem restrição de setor quando não há filtro explícito', async () => {
    accessState.current = {
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    };
    const { db, calls } = createReadOnlyEmptyDb();

    const response = await request('/treinamentos/planejados?source=TURMA', db);

    expect(response.status).toBe(200);
    expect(filterRequestedSetorIdsByAccessMock).not.toHaveBeenCalled();

    const listCall = calls.find(
      (call) => call.method === 'all' && call.query.includes('FROM treinamentos_planejados t'),
    );
    expect(listCall?.query).not.toContain('f3.setor_id IN');
  });
});
