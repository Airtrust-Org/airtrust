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
      c.set('empresaId', 1);
      c.set('userRole', c.req.header('x-test-role') || 'admin');
      await next();
    },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
  getTenantContext: (c: any) => ({
    empresaId: Number(c.get('empresaId') || 0),
    empresaCodigo: 'empresa-teste',
    empresaNome: 'Empresa Teste',
    role: c.get('userRole') || 'admin',
    plano: 'pro',
    permissions: ['read', 'write'],
  }),
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    (...requiredRoles: string[]) =>
    async (c: any, next: () => Promise<void>) => {
      const role = String(c.get('userRole') || '').toLowerCase();
      if (!requiredRoles.map((r) => r.toLowerCase()).includes(role)) {
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

import modelosAeronaveRoutes from '../../routes/modelos-aeronave';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/modelos-aeronave', modelosAeronaveRoutes);
  return app;
}

type ModeloRow = {
  id: number;
  empresa_id: number;
  modelo: string;
  codigo: string;
  nome: string;
  deleted_at: string | null;
};

function createMockEnv() {
  const modelos: ModeloRow[] = [
    { id: 1, empresa_id: 1, modelo: 'SK76', codigo: 'SK76', nome: 'Sikorsky S-76', deleted_at: null },
    { id: 2, empresa_id: 1, modelo: 'AW139', codigo: 'AW139', nome: 'AgustaWestland AW139', deleted_at: null },
  ];

  const runs: Array<{ query: string; args: unknown[] }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          if (
            query.includes('modelos_aeronave')
            && query.includes('WHERE id = ? AND empresa_id = ?')
          ) {
            const id = Number(args[0]);
            const empresaId = Number(args[1]);
            return modelos.find((m) => m.id === id && m.empresa_id === empresaId && !m.deleted_at) || null;
          }
          if (
            query.includes('modelos_aeronave')
            && query.includes('UPPER(TRIM(COALESCE(modelo, codigo, nome)))')
          ) {
            return null; // no duplicate
          }
          return null;
        },
        all: async () => ({ results: modelos.filter((item) => item.empresa_id === Number(args[0] || 1)) }),
        run: async () => {
          runs.push({ query, args });
          return { meta: { changes: 1, last_row_id: 99 } };
        },
      });

      return {
        bind,
        first: async () => null,
        all: async () => ({ results: modelos }),
        run: async () => {
          runs.push({ query, args: [] });
          return { meta: { changes: 1, last_row_id: 99 } };
        },
      };
    }),
  } as unknown as D1Database;

  return { env: { DB: db } as unknown as Env, runs };
}

const jsonHeaders = { 'Content-Type': 'application/json' };

async function req(
  path: string,
  env: Env,
  role: string | null,
  init: RequestInit = {},
) {
  const app = createApp();
  const headers = new Headers(init.headers);
  if (role !== null) headers.set('Authorization', 'Bearer test-token');
  if (role) headers.set('x-test-role', role);
  return app.fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
    env,
    {} as ExecutionContext,
  );
}

describe('modelos-aeronave write authorization', () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── Leitura: não muda ────────────────────────────────────────────────────

  it('GET / retorna 200 para viewer autenticado', async () => {
    const { env } = createMockEnv();
    const res = await req('/api/modelos-aeronave', env, 'viewer');
    expect(res.status).toBe(200);
  });

  it('GET /:id retorna 200 para student autenticado', async () => {
    const { env } = createMockEnv();
    const res = await req('/api/modelos-aeronave/1', env, 'student');
    expect(res.status).toBe(200);
  });

  // ─── 401 sem Authorization ────────────────────────────────────────────────

  it('POST sem Authorization retorna 401', async () => {
    const { env, runs } = createMockEnv();
    const res = await req('/api/modelos-aeronave', env, null, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ modelo: 'NOVAERO' }),
    });
    expect(res.status).toBe(401);
    expect(runs).toHaveLength(0);
  });

  it('PUT sem Authorization retorna 401', async () => {
    const { env, runs } = createMockEnv();
    const res = await req('/api/modelos-aeronave/1', env, null, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ fabricante: 'Sikorsky' }),
    });
    expect(res.status).toBe(401);
    expect(runs).toHaveLength(0);
  });

  it('DELETE sem Authorization retorna 401', async () => {
    const { env, runs } = createMockEnv();
    const res = await req('/api/modelos-aeronave/1', env, null, { method: 'DELETE' });
    expect(res.status).toBe(401);
    expect(runs).toHaveLength(0);
  });

  // ─── 403 role insuficiente ────────────────────────────────────────────────

  it('viewer em POST retorna 403', async () => {
    const { env, runs } = createMockEnv();
    const res = await req('/api/modelos-aeronave', env, 'viewer', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ modelo: 'NOVAERO' }),
    });
    expect(res.status).toBe(403);
    expect(runs).toHaveLength(0);
  });

  it('student em PUT retorna 403', async () => {
    const { env, runs } = createMockEnv();
    const res = await req('/api/modelos-aeronave/1', env, 'student', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ fabricante: 'Sikorsky' }),
    });
    expect(res.status).toBe(403);
    expect(runs).toHaveLength(0);
  });

  it('manager em DELETE retorna 403', async () => {
    const { env, runs } = createMockEnv();
    const res = await req('/api/modelos-aeronave/1', env, 'manager', { method: 'DELETE' });
    expect(res.status).toBe(403);
    expect(runs).toHaveLength(0);
  });

  it('instructor em POST retorna 403', async () => {
    const { env, runs } = createMockEnv();
    const res = await req('/api/modelos-aeronave', env, 'instructor', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ modelo: 'NOVAERO' }),
    });
    expect(res.status).toBe(403);
    expect(runs).toHaveLength(0);
  });

  // ─── 200/201 admin ────────────────────────────────────────────────────────

  it('admin em POST retorna 201 e executa INSERT', async () => {
    const { env, runs } = createMockEnv();
    const res = await req('/api/modelos-aeronave', env, 'admin', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ modelo: 'NOVAERO', fabricante: 'Acme', tipo: 'Jato', categoria: 'Comercial' }),
    });
    expect(res.status).toBe(201);
    expect(runs.some((r) => r.query.startsWith('INSERT INTO modelos_aeronave'))).toBe(true);
  });

  // Regressao: D1 real (nao o mock acima) rejeita `undefined` como bind
  // value com D1_TYPE_ERROR — achado via E2E autenticado real em staging
  // (POST so com `modelo`, sem fabricante/tipo/categoria/descricao, 500).
  // O mock de D1 deste arquivo nao valida tipos, entao so um assert direto
  // sobre os args do bind pega essa classe de bug.
  it('admin em POST so com modelo (campos opcionais ausentes) nao passa undefined pro bind', async () => {
    const { env, runs } = createMockEnv();
    const res = await req('/api/modelos-aeronave', env, 'admin', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ modelo: 'SOMENTE-MODELO' }),
    });
    expect(res.status).toBe(201);
    const insertRun = runs.find((r) => r.query.startsWith('INSERT INTO modelos_aeronave'));
    expect(insertRun).toBeDefined();
    expect(insertRun!.args).not.toContain(undefined);
  });

  it('admin em PUT retorna 200 e executa UPDATE', async () => {
    const { env, runs } = createMockEnv();
    const res = await req('/api/modelos-aeronave/1', env, 'admin', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ fabricante: 'Sikorsky Updated' }),
    });
    expect(res.status).toBe(200);
    expect(runs.some((r) => r.query.startsWith('UPDATE modelos_aeronave'))).toBe(true);
  });

  it('admin em DELETE retorna 200 e executa soft-delete', async () => {
    const { env, runs } = createMockEnv();
    const res = await req('/api/modelos-aeronave/1', env, 'admin', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(
      runs.some((r) => r.query.includes('SET deleted_at') && r.query.includes('modelos_aeronave')),
    ).toBe(true);
  });
});
