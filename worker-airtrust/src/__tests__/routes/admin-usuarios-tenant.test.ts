/**
 * BUG-AIRTRUST-002 — Admin Usuarios Tenant Isolation Tests
 *
 * Verifica que ADMIN de tenant A não consegue gerenciar usuários do tenant B.
 * Platform admin real pode operar cross-tenant.
 *
 * Estes testes devem FALHAR (RED) antes do fix e PASSAR (GREEN) depois.
 */

import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

// ===== MOCKS =====

vi.mock('../../middleware/auth', () => {
  const callerRoleToTenantRole = (role: string): string => {
    const upper = role.toUpperCase();
    if (upper === 'ADMINISTRADOR' || upper === 'ADMIN') return 'admin';
    if (upper === 'GESTOR') return 'manager';
    return 'viewer';
  };

  return {
    auth:
      () =>
      async (c: any, next: () => Promise<void>) => {
        const authHeader = c.req.header('Authorization');
        if (!authHeader) {
          return c.json({ success: false, error: 'Token de autenticação não fornecido' }, 401);
        }

        const callerId = Number(c.req.header('x-test-user-id') || 0);
        const callerRole = c.req.header('x-test-user-role') || 'viewer';
        const callerEmpresaId = Number(c.req.header('x-test-empresa-id') || 0);

        c.set('userId', callerId);
        c.set('userEmail', `user${callerId}@test.com`);
        c.set('userRole', callerRole);
        c.set('empresaId', callerEmpresaId);

        // Set tenant context (simulating what tenantMiddleware would do)
        c.set('tenantContext', {
          empresaId: callerEmpresaId,
          empresaCodigo: `empresa-${callerEmpresaId}`,
          empresaNome: `Empresa ${callerEmpresaId}`,
          role: callerRoleToTenantRole(callerRole),
          plano: 'pro',
          permissions: [],
        });

        await next();
      },
  };
});

vi.mock('../../middleware/tenant', () => {
  const ROLE_HIERARCHY = {
    admin: 100,
    manager: 80,
    instructor: 60,
    editor: 50,
    student: 20,
    viewer: 10,
  };

  const callerRoleToTenantRole = (role: string): string => {
    const upper = role.toUpperCase();
    if (upper === 'ADMINISTRADOR' || upper === 'ADMIN') return 'admin';
    if (upper === 'GESTOR') return 'manager';
    return 'viewer';
  };

  return {
    tenantMiddleware:
      () =>
      async (c: any, next: () => Promise<void>) => {
        const empresaId = Number(c.get('empresaId') || 0);
        if (!empresaId) {
          return c.json({ success: false, error: 'Tenant não identificado' }, 401);
        }

        const role = callerRoleToTenantRole(c.get('userRole'));

        c.set('tenantContext', {
          empresaId,
          empresaCodigo: `empresa-${empresaId}`,
          empresaNome: `Empresa ${empresaId}`,
          role,
          plano: 'pro',
          permissions: [],
        });
        await next();
      },
    getTenantContext: (c: any) => {
      const ctx = c.get('tenantContext');
      if (!ctx) throw new Error('TENANT_NOT_CONFIGURED');
      return ctx;
    },
    isPlatformAdminContext: (c: any) => {
      const header = c.req.header('x-test-platform-admin');
      return header === 'true';
    },
    ROLE_HIERARCHY,
  };
});

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
  toError: (e: any) => e instanceof Error ? e : new Error(String(e)),
}));

vi.mock('../../utils/security', () => ({
  hashPassword: async () => 'hashed-password',
  verifyPassword: async () => true,
  generateJWT: async () => ({ token: 'mock-jwt', jti: 'mock-jti' }),
  generateRefreshToken: () => 'mock-refresh',
  getRefreshTokenExpiry: () => new Date().toISOString(),
  extractBearerToken: () => null,
  verifyJWT: async () => null,
}));

vi.mock('../../lib/rbac/platform-access', () => ({
  isPlatformAdminAccess: (state: any) => state?.hasPersistedPlatformAdmin === true,
  resolvePlatformAccessState: async (_db: any, userId: number) => ({
    userId,
    isLegacyPlatformAdmin: false,
    hasPersistedPlatformAdmin: userId === 99,
    hasSupportReadOnlyRole: false,
    hasSupportElevatedRole: false,
    supportGrants: [],
    source: userId === 99 ? 'persisted' : ('none' as const),
  }),
}));

vi.mock('../../utils/db-schema', () => ({
  hasUsuariosEmpresasTable: async () => true,
  getUsuariosSchema: async () => ({ activeWhere: '' }),
}));

// ===== HELPERS =====

import { adminUsuariosRoutes } from '../../routes/admin-usuarios';

interface D1Result<T = unknown> {
  results: T[];
}

interface D1PreparedStatement {
  _sql: string;
  bind: (...args: unknown[]) => D1PreparedStatement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<D1Result<T>>;
  run: () => Promise<{ meta: { last_row_id?: number } }>;
}

interface TestDbOpts {
  targetExists?: boolean;
  targetPerfil?: string;
  targetEmpresaId?: number;
  /** Simulate that target has a vinculacao in usuarios_empresas for the queried empresaId */
  targetHasVinculo?: boolean;
  callerEmpresaId?: number;
}

function createDb(opts: TestDbOpts = {}): D1Database {
  const {
    targetExists = true,
    targetPerfil = 'ALUNO',
    targetEmpresaId = 2,
    targetHasVinculo = false,
    callerEmpresaId = 1,
  } = opts;

  const db = {
    prepare: (sql: string) => {
      const stmt: D1PreparedStatement = {
        _sql: sql,
        bind: (...args: unknown[]) => {
          // Store the bound values for conditional logic
          (stmt as any)._binds = args;
          return stmt;
        },
        first: async <T>() => {
          const s = sql.toLowerCase();

          // usuarios_empresas vinculacao check (must be checked before from usuarios)
          if (s.includes('usuarios_empresas') && s.includes('select 1 from')) {
            const bounds = (stmt as any)._binds || [];
            const queriedEmpresaId = Number(bounds[1] || 0);
            if (targetHasVinculo && queriedEmpresaId === targetEmpresaId) {
              return { '1': 1 } as unknown as T;
            }
            return null;
          }

          // User existence/detail queries — match any query that selects from usuarios
          if (s.includes('from usuarios') && s.includes('deleted_at')) {
            if (!targetExists) return null;
            const bounds = (stmt as any)._binds || [];
            const queriedId = Number(bounds[0] || 0);
            const hasEmail = s.includes('u.email');
            const hasFuncionarioId = s.includes('funcionario_id');
            if (hasEmail && hasFuncionarioId) {
              // Detailed query
              return {
                id: queriedId,
                email: `user${queriedId}@test.com`,
                nome: `User ${queriedId}`,
                perfil: targetPerfil,
                active: 1,
                funcionario_id: null,
                funcionario_nome: null,
                empresa_id: targetEmpresaId,
                created_at: '2024-01-01',
                last_login: null,
              } as unknown as T;
            }
            // Simple existence check
            return {
              id: queriedId,
              perfil: targetPerfil,
            } as unknown as T;
          }

          // Usuário detalhado com subquery
          if (s.includes('(select empresa_id from usuarios_empresas')) {
            if (!targetExists) return null;
            const bounds = (stmt as any)._binds || [];
            const queriedId = Number(bounds[0] || 0);
            return {
              id: queriedId,
              email: `user${queriedId}@test.com`,
              nome: `User ${queriedId}`,
              perfil: targetPerfil,
              active: 1,
              funcionario_id: null,
              funcionario_nome: null,
              empresa_id: targetEmpresaId,
              created_at: '2024-01-01',
              last_login: null,
            } as unknown as T;
          }

          return null;
        },
        all: async <T>() => {
          const s = sql.toLowerCase();

          if (s.includes('usuario_permissoes')) {
            return { results: [] as T[] };
          }
          if (s.includes('user_platform_roles')) {
            return { results: [] as T[] };
          }
          // List users query
          if (s.includes('from usuarios u') && s.includes('inner join usuarios_empresas')) {
            if (!targetExists) return { results: [] as T[] };
            return {
              results: [
                {
                  id: 200,
                  email: 'target@tenant-b.com',
                  nome: 'Target User',
                  perfil: targetPerfil,
                  active: 1,
                  funcionario_id: null,
                  funcionario_nome: null,
                  empresa_id: targetEmpresaId,
                  empresa_nome: `Empresa ${targetEmpresaId}`,
                  is_primary: 1,
                  created_at: '2024-01-01',
                  last_login: null,
                  convite_pendente: 0,
                },
              ] as unknown as T[],
            };
          }
          // Funcionarios sem usuario
          if (s.includes('funcionarios_sem_usuario')) {
            return { results: [] as T[] };
          }

          return { results: [] as T[] };
        },
        run: async () => {
          const s = sql;
          // INSERT returns last_row_id for user creation
          if (s.includes('INSERT INTO usuarios')) {
            return { meta: { last_row_id: 300 } };
          }
          return { meta: {} };
        },
      };
      return stmt;
    },
  };

  return db as unknown as D1Database;
}

function createEnv(db: D1Database) {
  return {
    DB: db,
    BREVO_API_KEY: undefined, // no emails in tests
    FRONTEND_URL: 'https://airtrust.online',
    ENVIRONMENT: 'test',
  } as unknown as Env;
}

function createApp() {
  const app = new Hono();
  app.onError((err, c) => {
    // Handle ApiError from error-handler.ts (has statusCode property)
    const statusCode = (err as any)?.statusCode;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 600) {
      return c.json(
        { success: false, error: (err as any).message || 'Error', code: (err as any).code },
        statusCode as any,
      );
    }
    // Also handle AppError from utils/errors (has status property)
    const status = (err as any)?.status;
    if (typeof status === 'number' && status >= 400 && status < 600) {
      return c.json(
        { success: false, error: (err as any).message || 'Error', code: (err as any).code },
        status as any,
      );
    }
    console.error('Unhandled error in test:', err);
    return c.json({ success: false, error: 'Internal error' }, 500);
  });
  app.route('/api/admin/usuarios', adminUsuariosRoutes);
  return app;
}

async function adminRequest(
  method: string,
  path: string,
  opts: {
    callerId: number;
    callerRole: string;
    callerEmpresaId: number;
    isPlatformAdmin?: boolean;
    body?: unknown;
    db?: D1Database;
  },
) {
  const {
    callerId,
    callerRole,
    callerEmpresaId,
    isPlatformAdmin = false,
    body,
    db = createDb(),
  } = opts;

  const app = createApp();
  const headers: Record<string, string> = {
    Authorization: 'Bearer test-token',
    'x-test-user-id': String(callerId),
    'x-test-user-role': callerRole,
    'x-test-empresa-id': String(callerEmpresaId),
  };

  if (isPlatformAdmin) {
    headers['x-test-platform-admin'] = 'true';
  }

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  return app.fetch(
    new Request(`http://localhost/api/admin/usuarios${path}`, init),
    createEnv(db),
    {} as ExecutionContext,
  );
}

// ===== TESTS: Cross-tenant scenarios =====

describe('admin-usuarios tenant isolation (BUG-002)', () => {
  // ────────────────────────────────────────────
  // GET /:id
  // ────────────────────────────────────────────
  describe('GET /:id', () => {
    it('ADMIN da empresa A vendo usuário da empresa B → 403', async () => {
      const response = await adminRequest('GET', '/200', {
        callerId: 10,
        callerRole: 'ADMINISTRADOR',
        callerEmpresaId: 1,
        db: createDb({
          targetExists: true,
          targetEmpresaId: 2,
          targetHasVinculo: false,
        }),
      });

      expect(response.status).toBe(403);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(false);
      expect(body.code || body.error).toMatch(/WRONG_TENANT|CROSS_TENANT|FORBIDDEN/i);
    });

    it('ADMIN da empresa A vendo usuário da empresa A → permitido', async () => {
      const response = await adminRequest('GET', '/100', {
        callerId: 10,
        callerRole: 'ADMINISTRADOR',
        callerEmpresaId: 1,
        db: createDb({
          targetExists: true,
          targetEmpresaId: 1,
          targetHasVinculo: true,
        }),
      });

      expect(response.status).toBe(200);
    });
  });

  // ────────────────────────────────────────────
  // PUT /:id
  // ────────────────────────────────────────────
  describe('PUT /:id', () => {
    it('ADMIN da empresa A editando usuário da empresa B → 403', async () => {
      const response = await adminRequest('PUT', '/200', {
        callerId: 10,
        callerRole: 'ADMINISTRADOR',
        callerEmpresaId: 1,
        body: { nome: 'Hacked' },
        db: createDb({
          targetExists: true,
          targetPerfil: 'ALUNO',
          targetEmpresaId: 2,
          targetHasVinculo: false,
        }),
      });

      expect(response.status).toBe(403);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(false);
      expect(body.code || body.error).toMatch(/WRONG_TENANT|CROSS_TENANT|FORBIDDEN/i);
    });

    it('ADMIN da empresa A editando usuário da empresa A → permitido', async () => {
      const response = await adminRequest('PUT', '/100', {
        callerId: 10,
        callerRole: 'ADMINISTRADOR',
        callerEmpresaId: 1,
        body: { nome: 'Updated Name' },
        db: createDb({
          targetExists: true,
          targetPerfil: 'ALUNO',
          targetEmpresaId: 1,
          targetHasVinculo: true,
        }),
      });

      expect(response.status).toBe(200);
    });
  });

  // ────────────────────────────────────────────
  // DELETE /:id
  // ────────────────────────────────────────────
  describe('DELETE /:id', () => {
    it('ADMIN da empresa A desativando usuário da empresa B → 403', async () => {
      const response = await adminRequest('DELETE', '/200', {
        callerId: 10,
        callerRole: 'ADMINISTRADOR',
        callerEmpresaId: 1,
        db: createDb({
          targetExists: true,
          targetPerfil: 'ALUNO',
          targetEmpresaId: 2,
          targetHasVinculo: false,
        }),
      });

      expect(response.status).toBe(403);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(false);
      expect(body.code || body.error).toMatch(/WRONG_TENANT|CROSS_TENANT|FORBIDDEN/i);
    });

    it('ADMIN da empresa A desativando usuário da empresa A → permitido', async () => {
      const response = await adminRequest('DELETE', '/100', {
        callerId: 10,
        callerRole: 'ADMINISTRADOR',
        callerEmpresaId: 1,
        db: createDb({
          targetExists: true,
          targetPerfil: 'ALUNO',
          targetEmpresaId: 1,
          targetHasVinculo: true,
        }),
      });

      expect(response.status).toBe(200);
    });
  });

  // ────────────────────────────────────────────
  // POST /:id/invite
  // ────────────────────────────────────────────
  describe('POST /:id/invite', () => {
    it('ADMIN da empresa A reenviando convite para usuário da empresa B → 403', async () => {
      const response = await adminRequest('POST', '/200/invite', {
        callerId: 10,
        callerRole: 'ADMINISTRADOR',
        callerEmpresaId: 1,
        db: createDb({
          targetExists: true,
          targetPerfil: 'ALUNO',
          targetEmpresaId: 2,
          targetHasVinculo: false,
        }),
      });

      expect(response.status).toBe(403);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(false);
      expect(body.code || body.error).toMatch(/WRONG_TENANT|CROSS_TENANT|FORBIDDEN/i);
    });
  });

  // ────────────────────────────────────────────
  // GET /:id/permissoes
  // ────────────────────────────────────────────
  describe('GET /:id/permissoes', () => {
    it('ADMIN da empresa A vendo permissões de usuário da empresa B → 403', async () => {
      const response = await adminRequest('GET', '/200/permissoes', {
        callerId: 10,
        callerRole: 'ADMINISTRADOR',
        callerEmpresaId: 1,
        db: createDb({
          targetExists: true,
          targetEmpresaId: 2,
          targetHasVinculo: false,
        }),
      });

      expect(response.status).toBe(403);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(false);
      expect(body.code || body.error).toMatch(/WRONG_TENANT|CROSS_TENANT|FORBIDDEN/i);
    });
  });

  // ────────────────────────────────────────────
  // PUT /:id/permissoes
  // ────────────────────────────────────────────
  describe('PUT /:id/permissoes', () => {
    it('ADMIN da empresa A alterando permissões de usuário da empresa B → 403', async () => {
      const response = await adminRequest('PUT', '/200/permissoes', {
        callerId: 10,
        callerRole: 'ADMINISTRADOR',
        callerEmpresaId: 1,
        body: { permissoes: [{ permissao: 'admin_access', tipo: 'GRANT' as const }] },
        db: createDb({
          targetExists: true,
          targetPerfil: 'ALUNO',
          targetEmpresaId: 2,
          targetHasVinculo: false,
        }),
      });

      expect(response.status).toBe(403);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(false);
      expect(body.code || body.error).toMatch(/WRONG_TENANT|CROSS_TENANT|FORBIDDEN/i);
    });
  });

  // ────────────────────────────────────────────
  // Platform admin cross-tenant
  // ────────────────────────────────────────────
  describe('Platform admin cross-tenant access', () => {
    it('Platform admin pode ver usuário de qualquer empresa', async () => {
      const response = await adminRequest('GET', '/200', {
        callerId: 99,
        callerRole: 'ADMINISTRADOR',
        callerEmpresaId: 1,
        isPlatformAdmin: true,
        db: createDb({
          targetExists: true,
          targetEmpresaId: 2,
          targetHasVinculo: false, // platform admin bypasses this
        }),
      });

      expect(response.status).toBe(200);
    });

    it('Platform admin pode editar usuário de qualquer empresa', async () => {
      const response = await adminRequest('PUT', '/200', {
        callerId: 99,
        callerRole: 'ADMINISTRADOR',
        callerEmpresaId: 1,
        isPlatformAdmin: true,
        body: { nome: 'Platform Updated' },
        db: createDb({
          targetExists: true,
          targetPerfil: 'ALUNO',
          targetEmpresaId: 2,
          targetHasVinculo: false,
        }),
      });

      expect(response.status).toBe(200);
    });

    it('Platform admin pode desativar usuário de qualquer empresa', async () => {
      const response = await adminRequest('DELETE', '/200', {
        callerId: 99,
        callerRole: 'ADMINISTRADOR',
        callerEmpresaId: 1,
        isPlatformAdmin: true,
        db: createDb({
          targetExists: true,
          targetPerfil: 'ALUNO',
          targetEmpresaId: 2,
          targetHasVinculo: false,
        }),
      });

      expect(response.status).toBe(200);
    });
  });

  // ────────────────────────────────────────────
  // GESTOR cross-tenant
  // ────────────────────────────────────────────
  describe('GESTOR cross-tenant (regression guard)', () => {
    it('GESTOR da empresa A não pode ver usuário da empresa B → 403', async () => {
      const response = await adminRequest('GET', '/200', {
        callerId: 10,
        callerRole: 'GESTOR',
        callerEmpresaId: 1,
        db: createDb({
          targetExists: true,
          targetEmpresaId: 2,
          targetHasVinculo: false,
        }),
      });

      expect(response.status).toBe(403);
    });
  });

  // ────────────────────────────────────────────
  // FAIL-CLOSED: invalid tenant context (empresaId=0)
  // ────────────────────────────────────────────
  describe('FAIL-CLOSED: invalid tenant context', () => {
    it('ADMIN com empresaId=0 fazendo GET usuário → 403 INVALID_TENANT_CONTEXT', async () => {
      const response = await adminRequest('GET', '/200', {
        callerId: 10,
        callerRole: 'ADMINISTRADOR',
        callerEmpresaId: 0,
        db: createDb({
          targetExists: true,
          targetEmpresaId: 2,
          targetHasVinculo: false,
        }),
      });

      expect(response.status).toBe(403);
      const body = await response.json() as Record<string, unknown>;
      expect(body.code || body.error).toMatch(/INVALID_TENANT_CONTEXT/i);
    });

    it('ADMIN com empresaId=0 fazendo PUT usuário → 403', async () => {
      const response = await adminRequest('PUT', '/200', {
        callerId: 10,
        callerRole: 'ADMINISTRADOR',
        callerEmpresaId: 0,
        body: { nome: 'Hacked' },
        db: createDb({
          targetExists: true,
          targetPerfil: 'ALUNO',
          targetEmpresaId: 2,
          targetHasVinculo: false,
        }),
      });

      expect(response.status).toBe(403);
    });

    it('ADMIN com empresaId=0 fazendo DELETE usuário → 403', async () => {
      const response = await adminRequest('DELETE', '/200', {
        callerId: 10,
        callerRole: 'ADMINISTRADOR',
        callerEmpresaId: 0,
        db: createDb({
          targetExists: true,
          targetPerfil: 'ALUNO',
          targetEmpresaId: 2,
          targetHasVinculo: false,
        }),
      });

      expect(response.status).toBe(403);
    });

    it('Platform admin com empresaId=0 → permitido', async () => {
      const response = await adminRequest('GET', '/200', {
        callerId: 99,
        callerRole: 'ADMINISTRADOR',
        callerEmpresaId: 0,
        isPlatformAdmin: true,
        db: createDb({
          targetExists: true,
          targetEmpresaId: 2,
          targetHasVinculo: false,
        }),
      });

      expect(response.status).toBe(200);
    });
  });
});
