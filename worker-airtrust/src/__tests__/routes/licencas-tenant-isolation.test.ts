import { describe, expect, it, vi } from 'vitest';
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
        return c.json({ success: false, error: 'Permissão negada' }, 403);
      }
      await next();
    },
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn(),
}));

import licencasRoutes from '../../routes/licencas';

type FuncionarioRow = {
  id: number;
  empresa_id: number;
  nome: string;
  matricula: string;
  deleted_at: string | null;
};

type LicencaRow = {
  id: number;
  funcionario_id: number;
  empresa_id: number;
  tipo: string;
  numero: string;
  data_emissao: string;
  data_vencimento: string;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/licencas', licencasRoutes);
  return app;
}

function createMockEnv() {
  const funcionarios: FuncionarioRow[] = [
    {
      id: 101,
      empresa_id: 1,
      nome: 'Funcionario Tenant A',
      matricula: 'A-101',
      deleted_at: null,
    },
    {
      id: 202,
      empresa_id: 2,
      nome: 'Funcionario Tenant B',
      matricula: 'B-202',
      deleted_at: null,
    },
  ];

  const licencas: LicencaRow[] = [
    {
      id: 1,
      funcionario_id: 101,
      empresa_id: 1,
      tipo: 'CMA',
      numero: 'LIC-A-1',
      data_emissao: '2026-01-01',
      data_vencimento: '2099-01-01',
      observacoes: null,
      created_at: '2026-01-01 10:00:00',
      updated_at: '2026-01-01 10:00:00',
      deleted_at: null,
    },
    {
      id: 2,
      funcionario_id: 202,
      empresa_id: 2,
      tipo: 'CHT',
      numero: 'LIC-B-1',
      data_emissao: '2026-01-01',
      data_vencimento: '1999-01-01',
      observacoes: null,
      created_at: '2026-01-01 10:00:00',
      updated_at: '2026-01-01 10:00:00',
      deleted_at: null,
    },
  ];

  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'all' | 'run' }> = [];
  const runs: Array<{ query: string; args: unknown[] }> = [];

  const decorateLicenca = (licenca: LicencaRow) => {
    const funcionario =
      funcionarios.find(
        (item) => item.id === licenca.funcionario_id && item.deleted_at === null,
      ) || null;

    return {
      ...licenca,
      funcionario_nome: funcionario?.nome || null,
      funcionario_matricula: funcionario?.matricula || null,
    };
  };

  const db = {
    prepare: vi.fn((query: string) => {
      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });

        if (query.includes('SELECT id, empresa_id FROM funcionarios')) {
          const funcionarioId = Number(args[0]);
          const empresaId = Number(args[1]);
          return (
            funcionarios.find(
              (item) =>
                item.id === funcionarioId &&
                item.empresa_id === empresaId &&
                item.deleted_at === null,
            ) || null
          );
        }

        if (
          query.includes('SELECT id FROM licencas WHERE funcionario_id = ? AND empresa_id = ?')
        ) {
          const funcionarioId = Number(args[0]);
          const empresaId = Number(args[1]);
          const tipo = String(args[2] || '');
          const numero = String(args[3] || '');
          return (
            licencas.find(
              (item) =>
                item.funcionario_id === funcionarioId &&
                item.empresa_id === empresaId &&
                item.tipo === tipo &&
                item.numero === numero &&
                item.deleted_at === null,
            ) || null
          );
        }

        if (
          query.includes('FROM licencas l') &&
          query.includes('WHERE l.id = ? AND l.empresa_id = ? AND l.deleted_at IS NULL')
        ) {
          const id = Number(args[1]);
          const empresaId = Number(args[2]);
          const licenca =
            licencas.find(
              (item) => item.id === id && item.empresa_id === empresaId && item.deleted_at === null,
            ) || null;
          return licenca ? decorateLicenca(licenca) : null;
        }

        if (query.includes('SELECT * FROM licencas WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')) {
          const id = Number(args[0]);
          const empresaId = Number(args[1]);
          return (
            licencas.find(
              (item) => item.id === id && item.empresa_id === empresaId && item.deleted_at === null,
            ) || null
          );
        }

        if (query.includes('SELECT * FROM licencas WHERE id = ? AND empresa_id = ?')) {
          const id = Number(args[0]);
          const empresaId = Number(args[1]);
          return (
            licencas.find((item) => item.id === id && item.empresa_id === empresaId) || null
          );
        }

        if (query.includes('SELECT COUNT(*) as total FROM licencas WHERE empresa_id = ?')) {
          const empresaId = Number(args[0]);
          return {
            total: licencas.filter(
              (item) => item.empresa_id === empresaId && item.deleted_at === null,
            ).length,
          };
        }

        if (query.includes('date(data_vencimento) < date(')) {
          const empresaId = Number(args[0]);
          return {
            total: licencas.filter(
              (item) =>
                item.empresa_id === empresaId &&
                item.deleted_at === null &&
                item.data_vencimento < '2026-06-08',
            ).length,
          };
        }

        if (query.includes("date(data_vencimento) BETWEEN date('now') AND date('now', '+60 days')")) {
          const empresaId = Number(args[0]);
          return {
            total: licencas.filter(
              (item) =>
                item.empresa_id === empresaId &&
                item.deleted_at === null &&
                item.data_vencimento >= '2026-06-08' &&
                item.data_vencimento <= '2026-08-07',
            ).length,
          };
        }

        if (query.includes("date(data_vencimento) > date('now', '+60 days')")) {
          const empresaId = Number(args[0]);
          return {
            total: licencas.filter(
              (item) =>
                item.empresa_id === empresaId &&
                item.deleted_at === null &&
                item.data_vencimento > '2026-08-07',
            ).length,
          };
        }

        return null;
      };

      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });

        if (query.includes('FROM licencas l') && query.includes('ORDER BY l.data_vencimento ASC')) {
          const empresaId = Number(args[0]);
          return {
            results: licencas
              .filter((item) => item.empresa_id === empresaId && item.deleted_at === null)
              .map(decorateLicenca),
          };
        }

        if (
          query.includes('SELECT tipo, COUNT(*) as total') &&
          query.includes('FROM licencas') &&
          query.includes('GROUP BY tipo')
        ) {
          const empresaId = Number(args[0]);
          const grouped = new Map<string, number>();
          for (const licenca of licencas) {
            if (licenca.empresa_id !== empresaId || licenca.deleted_at !== null) continue;
            grouped.set(licenca.tipo, (grouped.get(licenca.tipo) || 0) + 1);
          }
          return {
            results: [...grouped.entries()].map(([tipo, total]) => ({ tipo, total })),
          };
        }

        return { results: [] };
      };

      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        runs.push({ query, args });

        if (query.includes('INSERT INTO licencas')) {
          const id = Math.max(...licencas.map((item) => item.id), 0) + 1;
          licencas.push({
            id,
            funcionario_id: Number(args[0]),
            empresa_id: Number(args[1]),
            tipo: String(args[2]),
            numero: String(args[3]),
            data_emissao: String(args[4]),
            data_vencimento: String(args[5]),
            observacoes: (args[6] as string | null) || null,
            created_at: '2026-06-08 10:00:00',
            updated_at: '2026-06-08 10:00:00',
            deleted_at: null,
          });
          return { meta: { changes: 1, last_row_id: id } };
        }

        if (query.startsWith('UPDATE licencas SET deleted_at = datetime(\'now\')')) {
          const id = Number(args[0]);
          const empresaId = Number(args[1]);
          const licenca = licencas.find(
            (item) => item.id === id && item.empresa_id === empresaId && item.deleted_at === null,
          );
          if (!licenca) return { meta: { changes: 0, last_row_id: 0 } };
          licenca.deleted_at = '2026-06-08 10:10:00';
          return { meta: { changes: 1, last_row_id: 0 } };
        }

        if (query.startsWith('UPDATE licencas SET')) {
          const id = Number(args[args.length - 2]);
          const empresaId = Number(args[args.length - 1]);
          const licenca = licencas.find(
            (item) => item.id === id && item.empresa_id === empresaId && item.deleted_at === null,
          );
          if (!licenca) return { meta: { changes: 0, last_row_id: 0 } };
          return { meta: { changes: 1, last_row_id: 0 } };
        }

        return { meta: { changes: 1, last_row_id: 0 } };
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

  return { env: { DB: db } as unknown as Env, calls, runs, licencas };
}

async function request(
  path: string,
  env: Env,
  empresaId: number,
  init: RequestInit = {},
) {
  const app = createApp();
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer test-token');
  headers.set('x-test-empresa-id', String(empresaId));
  headers.set('x-test-role', 'admin');

  return app.request(path, {
    ...init,
    headers,
  }, env);
}

describe('licencas tenant isolation', () => {
  it('empresa A lista apenas licencas da empresa A', async () => {
    const { env } = createMockEnv();

    const response = await request('http://localhost/api/licencas', env, 1);
    const body = (await response.json()) as { success: boolean; data: Array<{ id: number }> };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.map((item) => item.id)).toEqual([1]);
  });

  it('empresa A nao ve detalhe de licenca da empresa B', async () => {
    const { env } = createMockEnv();

    const response = await request('http://localhost/api/licencas/2', env, 1);

    expect(response.status).toBe(404);
  });

  it('empresa A nao cria licenca para funcionario da empresa B', async () => {
    const { env, runs } = createMockEnv();

    const response = await request('http://localhost/api/licencas', env, 1, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        funcionario_id: 202,
        tipo: 'CMA',
        numero: 'NEW-BLOCKED',
        data_emissao: '2026-06-08',
        data_vencimento: '2027-06-08',
      }),
    });

    expect(response.status).toBe(400);
    expect(runs.some((entry) => entry.query.includes('INSERT INTO licencas'))).toBe(false);
  });

  it('empresa A nao edita licenca da empresa B', async () => {
    const { env, runs } = createMockEnv();

    const response = await request('http://localhost/api/licencas/2', env, 1, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero: 'EDIT-BLOCKED' }),
    });

    expect(response.status).toBe(404);
    expect(runs.some((entry) => entry.query.startsWith('UPDATE licencas SET'))).toBe(false);
  });

  it('empresa A nao deleta licenca da empresa B', async () => {
    const { env, runs } = createMockEnv();

    const response = await request('http://localhost/api/licencas/2', env, 1, {
      method: 'DELETE',
    });

    expect(response.status).toBe(404);
    expect(
      runs.some((entry) => entry.query.startsWith("UPDATE licencas SET deleted_at = datetime('now')")),
    ).toBe(false);
  });

  it('empresa A cria licenca da propria empresa e grava empresa_id', async () => {
    const { env, licencas } = createMockEnv();

    const response = await request('http://localhost/api/licencas', env, 1, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        funcionario_id: 101,
        tipo: 'PLA',
        numero: 'LIC-A-NEW',
        data_emissao: '2026-06-08',
        data_vencimento: '2028-06-08',
        observacoes: 'ok',
      }),
    });

    expect(response.status).toBe(201);
    expect(licencas.find((item) => item.numero === 'LIC-A-NEW')?.empresa_id).toBe(1);
  });

  it('dashboard de licencas nao conta licenca da empresa B', async () => {
    const { env } = createMockEnv();

    const response = await request('http://localhost/api/licencas/dashboard/licencas', env, 1);
    const body = (await response.json()) as {
      success: boolean;
      data: {
        total_ativas: number;
        vencidas: number;
        a_vencer_60_dias: number;
        validas: number;
        por_tipo: Array<{ tipo: string; total: number }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.total_ativas).toBe(1);
    expect(body.data.vencidas).toBe(0);
    expect(body.data.validas).toBe(1);
    expect(body.data.por_tipo).toEqual([{ tipo: 'CMA', total: 1 }]);
  });
});
