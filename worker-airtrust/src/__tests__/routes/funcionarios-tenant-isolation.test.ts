import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      if (!c.req.header('Authorization')) {
        return c.json({ success: false, error: 'Token de autenticação não fornecido' }, 401);
      }

      c.set('userId', 10);
      c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 0));
      c.set('userRole', c.req.header('x-test-role') || 'admin');
      await next();
    },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    getTenantContext: (c: any) => ({
      empresaId: Number(c.get('empresaId') || 0),
      empresaCodigo: `empresa-${Number(c.get('empresaId') || 0)}`,
      empresaNome: 'Empresa Teste',
      role: c.get('userRole') || 'admin',
      plano: 'pro',
      permissions: ['read', 'write'],
    }),
    getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
  };
});

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    (...requiredRoles: string[]) =>
    async (c: any, next: () => Promise<void>) => {
      const role = String(c.get('userRole') || '').toLowerCase();
      if (!requiredRoles.map((requiredRole) => requiredRole.toLowerCase()).includes(role)) {
        return c.json(
          { success: false, error: `Permissão negada. Acesso restrito a: ${requiredRoles.join(', ')}` },
          403,
        );
      }
      await next();
    },
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn(),
  extrairUsuarioAuditoria: () => ({ usuario_id: 10, origem: 'test' }),
}));

vi.mock('../../services/sync-certificacoes-funcionarios', () => ({
  syncFuncionarioCertificacoes: vi.fn(),
}));

vi.mock('../../shared/domainEvents', () => ({
  publishDomainEvent: vi.fn(),
}));

import funcionariosMutationsRoutes from '../../routes/funcionarios-mutations';

type FuncionarioRow = {
  id: number;
  empresa_id: number;
  nome: string;
  cpf: string;
  matricula: string;
  email: string;
  deleted_at: string | null;
};

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/funcionarios', funcionariosMutationsRoutes);
  return app;
}

function createMockEnv() {
  const funcionarios: FuncionarioRow[] = [
    {
      id: 101,
      empresa_id: 1,
      nome: 'Funcionario Tenant A',
      cpf: '11111111111',
      matricula: 'A-101',
      email: 'a@example.com',
      deleted_at: null,
    },
    {
      id: 202,
      empresa_id: 2,
      nome: 'Funcionario Tenant B',
      cpf: '22222222222',
      matricula: 'B-202',
      email: 'b@example.com',
      deleted_at: null,
    },
  ];

  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'all' | 'run' }> = [];
  const runs: Array<{ query: string; args: unknown[] }> = [];

  const findFuncionario = (id: number, empresaId?: number) =>
    funcionarios.find((funcionario) => {
      if (funcionario.id !== id || funcionario.deleted_at) return false;
      return empresaId === undefined || funcionario.empresa_id === empresaId;
    }) || null;

  const db = {
    prepare: vi.fn((query: string) => {
      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });

        if (query.includes('FROM funcionarios') && query.includes('WHERE id = ?')) {
          const id = Number(args[0]);
          const usesTenant = query.includes('empresa_id = ?');
          const empresaId = usesTenant ? Number(args[1]) : undefined;
          return findFuncionario(id, empresaId);
        }

        if (
          query.includes('FROM funcionarios') &&
          (query.includes('matricula = ?') || query.includes('cpf = ?'))
        ) {
          return null;
        }

        return null;
      };

      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });
        return { results: [] };
      };

      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        runs.push({ query, args });
        return { meta: { changes: 1, last_row_id: 999 } };
      };

      return {
        first: async () => executeFirst([]),
        all: async () => executeAll([]),
        run: async () => executeRun([]),
        bind: (...args: unknown[]) => ({
          first: async () => executeFirst(args),
          all: async () => executeAll(args),
          run: async () => executeRun(args),
        }),
      };
    }),
  } as unknown as D1Database;

  return { env: { DB: db } as unknown as Env, calls, runs };
}

async function request(
  path: string,
  env: Env,
  empresaId = 1,
  init: RequestInit = {},
  authorized = true,
) {
  const app = createApp();
  const headers = new Headers(init.headers);
  if (authorized) headers.set('Authorization', 'Bearer test-token');
  headers.set('x-test-empresa-id', String(empresaId));
  return app.fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
    env,
    {} as ExecutionContext,
  );
}

const jsonHeaders = { 'Content-Type': 'application/json' };

describe('funcionarios tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin da empresa A nao consegue PUT em funcionario da empresa B', async () => {
    const { env, runs } = createMockEnv();

    const response = await request('/api/funcionarios/202', env, 1, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ nome: 'Tentativa Cross Tenant' }),
    });

    expect(response.status).toBe(404);
    expect(runs.filter((run) => run.query.startsWith('UPDATE funcionarios'))).toHaveLength(0);
  });

  it('admin da empresa A nao consegue DELETE em funcionario da empresa B', async () => {
    const { env, runs } = createMockEnv();

    const response = await request('/api/funcionarios/202', env, 1, { method: 'DELETE' });

    expect(response.status).toBe(404);
    expect(runs.filter((run) => run.query.startsWith('UPDATE funcionarios'))).toHaveLength(0);
  });

  it('admin da propria empresa consegue PUT com empresa_id no UPDATE', async () => {
    const { env, runs } = createMockEnv();

    const response = await request('/api/funcionarios/101', env, 1, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ nome: 'Funcionario Atualizado' }),
    });

    expect(response.status).toBe(200);
    const update = runs.find((run) => run.query.startsWith('UPDATE funcionarios'));
    expect(update?.query).toContain('WHERE id = ? AND empresa_id = ?');
    expect(update?.args).toEqual(['Funcionario Atualizado', 101, 1]);
  });

  it('admin da propria empresa consegue DELETE com empresa_id no soft-delete', async () => {
    const { env, runs } = createMockEnv();

    const response = await request('/api/funcionarios/101', env, 1, { method: 'DELETE' });

    expect(response.status).toBe(200);
    const softDelete = runs.find((run) => run.query.trimStart().startsWith('UPDATE funcionarios'));
    expect(softDelete?.query).toContain('WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
    expect(softDelete?.args).toEqual([101, 1]);
  });

  it('sem Authorization retorna 401 antes de mutation', async () => {
    const { env, runs } = createMockEnv();

    const response = await request(
      '/api/funcionarios/101',
      env,
      1,
      {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({ nome: 'Nao Autorizado' }),
      },
      false,
    );

    expect(response.status).toBe(401);
    expect(runs).toHaveLength(0);
  });

  it('role sem permissao retorna 403 antes de mutation', async () => {
    const { env, runs } = createMockEnv();

    const response = await request('/api/funcionarios/101', env, 1, {
      method: 'DELETE',
      headers: { ...jsonHeaders, 'x-test-role': 'manager' },
    });

    expect(response.status).toBe(403);
    expect(runs).toHaveLength(0);
  });
});
