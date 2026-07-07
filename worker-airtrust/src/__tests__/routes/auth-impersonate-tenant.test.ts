/**
 * BUG-AIRTRUST-001 — Auth Impersonate Tenant Isolation Tests
 *
 * Verifica que ADMIN de tenant A não consegue impersonar usuário do tenant B.
 * Platform admin real pode impersonar cross-tenant.
 *
 * Estes testes devem FALHAR (RED) antes do fix e PASSAR (GREEN) depois.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

// ===== MOCKS =====

// Collect audit calls so we can assert on them
const auditCalls: Array<{ userId: number; action: string; entityId: number }> = [];

vi.mock('../../middleware/auth', () => ({
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

      await next();
    },
}));

vi.mock('../../middleware/tenant', () => ({
  tenantMiddleware:
    () =>
    async (c: any, next: () => Promise<void>) => {
      const empresaId = Number(c.get('empresaId') || 0);
      if (!empresaId) {
        return c.json({ success: false, error: 'Tenant não identificado' }, 401);
      }

      c.set('tenantContext', {
        empresaId,
        empresaCodigo: `empresa-${empresaId}`,
        empresaNome: `Empresa ${empresaId}`,
        role: c.get('userRole') === 'ADMINISTRADOR' || c.get('userRole') === 'ADMIN' ? 'admin' : 'viewer',
        plano: 'pro',
        permissions: [],
      });
      await next();
    },
  getTenantContext: (c: any) => c.get('tenantContext'),
  isPlatformAdminContext: (c: any) => {
    const header = c.req.header('x-test-platform-admin');
    return header === 'true';
  },
}));

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
  toError: (e: any) => e instanceof Error ? e : new Error(String(e)),
}));

vi.mock('../../utils/security', () => ({
  generateJWT: async (payload: any, _secret: string, _ttl: number) => {
    const token = `mock-jwt-${payload.sub}-${payload.empresa_id}-${Date.now()}`;
    return { token, jti: `jti-${Date.now()}` };
  },
  verifyPassword: async () => true,
  hashPassword: async () => 'hashed-password',
  generateRefreshToken: () => 'mock-refresh-token',
  getRefreshTokenExpiry: () => new Date(Date.now() + 90 * 86400000).toISOString(),
  extractBearerToken: () => 'mock-bearer-token',
  verifyJWT: async () => null,
}));

vi.mock('../../utils/db', () => ({
  logAudit: async (db: any, params: { userId: number; action: string; entityId: number }) => {
    auditCalls.push({ userId: params.userId, action: params.action, entityId: params.entityId });
  },
}));

vi.mock('../../lib/audit/context', () => ({
  buildAuditMetadata: () => ({}),
}));

vi.mock('../../utils/role-resolution', async () => {
  const actual = await vi.importActual('../../utils/role-resolution') as any;
  return {
    ...actual,
    isAdminRole: (value: unknown) => {
      const normalized = String(value || '').trim().toUpperCase();
      return normalized === 'ADMINISTRADOR' || normalized === 'ADMIN';
    },
    normalizeAirtrustRole: actual.normalizeAirtrustRole,
  };
});

vi.mock('../../lib/rbac/platform-access', () => ({
  isPlatformAdminAccess: (state: any) => state?.hasPersistedPlatformAdmin === true,
  resolvePlatformAccessState: async (db: any, userId: number) => ({
    userId,
    isLegacyPlatformAdmin: false,
    hasPersistedPlatformAdmin: userId === 99, // user 99 is platform admin
    hasSupportReadOnlyRole: false,
    hasSupportElevatedRole: false,
    supportGrants: [],
    source: userId === 99 ? 'persisted' : ('none' as const),
  }),
}));

vi.mock('../../lib/audit/context', () => ({
  buildAuditMetadata: () => ({}),
}));

// ===== HELPERS =====

import { authRoutes } from '../../routes/auth';

interface D1Result<T = unknown> {
  results: T[];
}

interface D1PreparedStatement {
  bind: (...args: unknown[]) => D1PreparedStatement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<D1Result<T>>;
  run: () => Promise<{ meta: { last_row_id?: number } }>;
}

function createDb(opts: {
  targetUser?: {
    id: number;
    email: string;
    perfil: string;
    nome: string;
    empresa_id?: number;
  } | null;
  targetEmpresaId?: number;
  targetRole?: string;
  targetFuncionarioId?: number | null;
  hasUsuariosEmpresasTable?: boolean;
}): D1Database {
  const {
    targetUser = {
      id: 200,
      email: 'target@tenant-b.com',
      perfil: 'ALUNO',
      nome: 'Target User',
    },
    targetEmpresaId = 2,
    targetRole = 'ALUNO',
    targetFuncionarioId = null,
    hasUsuariosEmpresasTable = true,
  } = opts;

  const db = {
    prepare: (sql: string) => {
      const stmt: D1PreparedStatement = {
        bind: (..._args: unknown[]) => stmt,
        first: async <T>() => {
          if (sql.includes('SELECT id, email, perfil, nome FROM usuarios WHERE')) {
            return (targetUser as unknown as T) ?? null;
          }
          if (sql.includes('SELECT funcionario_id FROM usuarios WHERE')) {
            return (targetFuncionarioId !== null
              ? { funcionario_id: targetFuncionarioId }
              : null) as unknown as T;
          }
          if (sql.includes('usuarios_empresas') && sql.includes('is_primary')) {
            return { empresa_id: targetEmpresaId } as unknown as T;
          }
          if (sql.includes('hasUsuariosEmpresasTable') || sql.includes('sqlite_master')) {
            return { found: hasUsuariosEmpresasTable ? 1 : 0 } as unknown as T;
          }
          if (sql.includes('funcionarios') && sql.includes('empresa_id')) {
            return { empresa_id: targetEmpresaId } as unknown as T;
          }
          if (sql.includes('empresas') && sql.includes('ativo')) {
            return { id: targetEmpresaId } as unknown as T;
          }
          return null;
        },
        all: async <T>() => {
          if (sql.includes('usuario_permissoes')) {
            return { results: [] as T[] };
          }
          if (sql.includes('user_platform_roles')) {
            return { results: [] as T[] };
          }
          return { results: [] as T[] };
        },
        run: async () => ({ meta: {} }),
      };
      return stmt;
    },
  };

  return db as unknown as D1Database;
}

function createEnv(db: D1Database, opts?: { jwtSecret?: string; frontendUrl?: string }) {
  return {
    DB: db,
    JWT_SECRET: opts?.jwtSecret || 'test-jwt-secret-32-chars!!',
    FRONTEND_URL: opts?.frontendUrl || 'https://airtrust.online',
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
  app.route('/api/auth', authRoutes);
  return app;
}

async function impersonateRequest(opts: {
  callerId: number;
  callerRole: string;
  callerEmpresaId: number;
  targetUserId: number;
  isPlatformAdmin?: boolean;
  db?: D1Database;
}) {
  const {
    callerId,
    callerRole,
    callerEmpresaId,
    targetUserId,
    isPlatformAdmin = false,
    db = createDb({}),
  } = opts;

  const app = createApp();
  const headers: Record<string, string> = {
    Authorization: 'Bearer test-token',
    'x-test-user-id': String(callerId),
    'x-test-user-role': callerRole,
    'x-test-empresa-id': String(callerEmpresaId),
    'Content-Type': 'application/json',
  };

  if (isPlatformAdmin) {
    headers['x-test-platform-admin'] = 'true';
  }

  return app.fetch(
    new Request('http://localhost/api/auth/impersonate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId: targetUserId }),
    }),
    createEnv(db),
    {} as ExecutionContext,
  );
}

// ===== TESTS =====

describe('POST /api/auth/impersonate - tenant isolation (BUG-001)', () => {
  beforeEach(() => {
    auditCalls.length = 0;
  });

  // RED TEST: should fail before fix, pass after
  it('ADMIN da empresa A tentando impersonar usuário da empresa B → 403', async () => {
    const db = createDb({
      targetUser: {
        id: 200,
        email: 'target@empresa-b.com',
        perfil: 'ALUNO',
        nome: 'Target User',
      },
      targetEmpresaId: 2, // target is in empresa 2
    });

    const response = await impersonateRequest({
      callerId: 10,
      callerRole: 'ADMINISTRADOR',
      callerEmpresaId: 1, // caller is admin of empresa 1
      targetUserId: 200,
      db,
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code || body.error).toMatch(/WRONG_TENANT|FORBIDDEN|CROSS_TENANT/i);
  });

  it('ADMIN da empresa A impersonando usuário da mesma empresa A → permitido', async () => {
    const db = createDb({
      targetUser: {
        id: 100,
        email: 'target@empresa-a.com',
        perfil: 'ALUNO',
        nome: 'Target User',
      },
      targetEmpresaId: 1, // target is in same empresa as caller
    });

    const response = await impersonateRequest({
      callerId: 10,
      callerRole: 'ADMINISTRADOR',
      callerEmpresaId: 1,
      targetUserId: 100,
      db,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeTruthy();
  });

  it('Platform admin real impersonando usuário de outra empresa → permitido', async () => {
    const db = createDb({
      targetUser: {
        id: 200,
        email: 'target@empresa-b.com',
        perfil: 'ALUNO',
        nome: 'Target User',
      },
      targetEmpresaId: 2, // target is in empresa 2
    });

    const response = await impersonateRequest({
      callerId: 99, // user 99 is platform admin per mock
      callerRole: 'ADMINISTRADOR',
      callerEmpresaId: 1,
      targetUserId: 200,
      isPlatformAdmin: true,
      db,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeTruthy();
  });

  it('Usuário não-admin (GESTOR) tentando impersonar → 401 (unauthorized)', async () => {
    const db = createDb({
      targetUser: {
        id: 100,
        email: 'target@empresa-a.com',
        perfil: 'ALUNO',
        nome: 'Target User',
      },
      targetEmpresaId: 1,
    });

    const response = await impersonateRequest({
      callerId: 10,
      callerRole: 'GESTOR',
      callerEmpresaId: 1,
      targetUserId: 100,
      db,
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('Usuário tentando impersonar a si mesmo → 400', async () => {
    const db = createDb({
      targetUser: {
        id: 10,
        email: 'self@empresa-a.com',
        perfil: 'ADMINISTRADOR',
        nome: 'Self User',
      },
      targetEmpresaId: 1,
    });

    const response = await impersonateRequest({
      callerId: 10,
      callerRole: 'ADMINISTRADOR',
      callerEmpresaId: 1,
      targetUserId: 10,
      db,
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code || body.error).toMatch(/SELF_IMPERSONATE/i);
  });

  it('Audit log é registrado para impersonação bem-sucedida', async () => {
    const db = createDb({
      targetUser: {
        id: 100,
        email: 'target@empresa-a.com',
        perfil: 'ALUNO',
        nome: 'Target User',
      },
      targetEmpresaId: 1,
    });

    await impersonateRequest({
      callerId: 10,
      callerRole: 'ADMINISTRADOR',
      callerEmpresaId: 1,
      targetUserId: 100,
      db,
    });

    expect(auditCalls.length).toBeGreaterThanOrEqual(1);
    const auditCall = auditCalls.find((c) => c.action === 'IMPERSONATE');
    expect(auditCall).toBeTruthy();
    expect(auditCall!.userId).toBe(10);
    expect(auditCall!.entityId).toBe(100);
  });

  // ────────────────────────────────────────────
  // FAIL-CLOSED: invalid tenant context
  // ────────────────────────────────────────────
  it('ADMIN com empresaId=0 tentando impersonar → 403 INVALID_TENANT_CONTEXT', async () => {
    const db = createDb({
      targetUser: {
        id: 100,
        email: 'target@any.com',
        perfil: 'ALUNO',
        nome: 'Target',
      },
      targetEmpresaId: 1,
    });

    const response = await impersonateRequest({
      callerId: 10,
      callerRole: 'ADMINISTRADOR',
      callerEmpresaId: 0, // contexto inválido
      targetUserId: 100,
      db,
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code || body.error).toMatch(/INVALID_TENANT_CONTEXT/i);
  });

  it('Platform admin com empresaId=0 → permitido (cross-tenant support)', async () => {
    const db = createDb({
      targetUser: {
        id: 100,
        email: 'target@any.com',
        perfil: 'ALUNO',
        nome: 'Target',
      },
      targetEmpresaId: 1,
    });

    const response = await impersonateRequest({
      callerId: 99,
      callerRole: 'ADMINISTRADOR',
      callerEmpresaId: 0,
      targetUserId: 100,
      isPlatformAdmin: true,
      db,
    });

    expect(response.status).toBe(200);
  });
});
