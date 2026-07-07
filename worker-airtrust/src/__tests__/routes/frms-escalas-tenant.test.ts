/**
 * BUG-AIRTRUST-003 — FRMS Escalas PUT/DELETE Tenant Isolation Tests
 *
 * Verifica que usuário da empresa A não consegue alterar ou deletar
 * escala quinzenal cujo tripulante pertence à empresa B.
 *
 * Estes testes devem FALHAR (RED) antes do fix e PASSAR (GREEN) depois.
 */

import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

// ===== MOCKS =====

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      const authHeader = c.req.header('Authorization');
      if (!authHeader) {
        return c.json({ success: false, error: 'Token de autenticação não fornecido' }, 401);
      }

      c.set('userId', Number(c.req.header('x-test-user-id') || 0));
      c.set('userRole', c.req.header('x-test-user-role') || 'viewer');
      c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 0));
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
        role: 'admin',
        plano: 'pro',
        permissions: [],
      });
      await next();
    },
  getTenantContext: (c: any) => c.get('tenantContext'),
}));

vi.mock('../../middleware/rate-limit', () => ({
  rateLimiter:
    () =>
    async (_c: any, next: () => Promise<void>) => {
      await next();
    },
  rateLimitPresets: {},
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    () =>
    async (_c: any, next: () => Promise<void>) => {
      await next();
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

// Mock frms-shared: mock assertTripulanteEmpresa for tenant check
vi.mock('../../routes/frms-shared', () => ({
  safe: (fn: any) => fn,
  getEmpresaIdSafe: (c: any) => {
    const empresaId = c.get('empresaId');
    return empresaId && empresaId > 0 ? empresaId : null;
  },
  assertTripulanteEmpresa: async (c: any, tripulanteId: string) => {
    const empresaId = c.get('empresaId');
    const db = c.env.DB;
    const row = await db.prepare(
      'SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
    ).bind(Number(tripulanteId), empresaId).first();
    if (!row) {
      return c.json(
        { success: false, error: 'Tripulante não pertence à sua empresa.', code: 'TENANT_ACCESS_DENIED' },
        403,
      );
    }
    return null;
  },
  assertJornadaEmpresa: async () => null,
  assertAlertaEmpresa: async () => null,
  resolveFuncionarioId: async (c: any) => Number(c.get('userId') || 0),
  auditFrms: async () => {},
  logDomainEventError: () => {},
}));

vi.mock('../../lib/frms/db-service', () => ({
  carregarLimites: async () => ({}),
  reprocessarTripulanteCompleto: async () => {},
}));

vi.mock('../../lib/frms/db-service-escalas', async () => {
  const actual = await vi.importActual('../../lib/frms/db-service-escalas') as any;
  return {
    ...actual,
    atualizarEscala: actual.atualizarEscala,
    deletarEscala: actual.deletarEscala,
    buscarEscalas: actual.buscarEscalas,
    buscarEscalaPorId: actual.buscarEscalaPorId,
  };
});

// ===== HELPERS =====

import frmsRoutes from '../../routes/frms';

interface D1PreparedStatement {
  bind: (...args: unknown[]) => D1PreparedStatement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results: T[] }>;
  run: () => Promise<{ meta: { last_row_id?: number } }>;
}

interface TestDbOpts {
  /** empresa_id of the tripulante that owns the escala */
  tripulanteEmpresaId?: number;
  /** Whether the escala exists */
  escalaExists?: boolean;
  /** Whether the tripulante exists */
  tripulanteExists?: boolean;
}

function createDb(opts: TestDbOpts = {}): D1Database {
  const { tripulanteEmpresaId = 2, escalaExists = true, tripulanteExists = true } = opts;

  const db = {
    prepare: (sql: string) => {
      const stmt: D1PreparedStatement = {
        bind: (...args: unknown[]) => {
          (stmt as any)._binds = args;
          return stmt;
        },
        first: async <T>() => {
          const s = sql.toLowerCase();

          // assertTripulanteEmpresa: checks funcionarios by id + empresa_id
          if (s.includes('from funcionarios') && s.includes('empresa_id')) {
            if (!tripulanteExists) return null;
            const bounds = (stmt as any)._binds || [];
            const queriedEmpresaId = Number(bounds[1] || 0);
            if (queriedEmpresaId === tripulanteEmpresaId) {
              return { id: 100 } as unknown as T;
            }
            return null;
          }

          // Lookup escala by id (PUT handler)
          if (s.includes('from frms_escala_quinzenal') && s.includes('deleted_at is null') && !s.includes('tripulante_id = ?')) {
            if (!escalaExists) return null;
            return {
              id: 'scale-uuid-1',
              tripulante_id: '100',
              ano: 2026,
              ciclo: 1,
              data_inicio_embarque: '2026-01-01',
              data_fim_embarque: '2026-01-14',
              data_inicio_folga: '2026-01-15',
              data_fim_folga: '2026-01-28',
              dias_embarcado: 14,
              dias_folga: 14,
              status_ciclo: 'ativo',
              observacao: null,
              created_at: '2026-01-01',
              updated_at: '2026-01-01',
              deleted_at: null,
            } as unknown as T;
          }

          // DELETE handler: SELECT tripulante_id FROM frms_escala_quinzenal
          if (s.includes('select tripulante_id from frms_escala_quinzenal')) {
            if (!escalaExists) return null;
            return { tripulante_id: '100' } as unknown as T;
          }

          return null;
        },
        all: async <T>() => ({ results: [] as T[] }),
        run: async () => ({ meta: {} }),
      };
      return stmt;
    },
  };

  return db as unknown as D1Database;
}

function createEnv(db: D1Database) {
  return {
    DB: db,
    BUCKET: {} as any,
    ENVIRONMENT: 'test',
  } as unknown as Env;
}

function createApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const statusCode = (err as any)?.statusCode;
    if (typeof statusCode === 'number' && statusCode >= 400) {
      return c.json({ success: false, error: (err as any).message }, statusCode as any);
    }
    return c.json({ success: false, error: 'Internal error' }, 500);
  });
  app.route('/api/frms', frmsRoutes);
  return app;
}

async function frmsRequest(
  method: string,
  path: string,
  opts: {
    userId: number;
    empresaId: number;
    role?: string;
    body?: unknown;
    db?: D1Database;
  },
) {
  const { userId, empresaId, role = 'admin', body, db = createDb() } = opts;

  const app = createApp();
  const headers: Record<string, string> = {
    Authorization: 'Bearer test-token',
    'x-test-user-id': String(userId),
    'x-test-user-role': role,
    'x-test-empresa-id': String(empresaId),
  };

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  return app.fetch(
    new Request(`http://localhost/api/frms${path}`, init),
    createEnv(db),
    {} as ExecutionContext,
  );
}

// ===== TESTS =====

describe('FRMS escalas PUT/DELETE tenant isolation (BUG-003)', () => {
  describe('PUT /api/frms/escalas/:id', () => {
    it('Usuário empresa A tenta editar escala de tripulante da empresa B → 403', async () => {
      const response = await frmsRequest('PUT', '/escalas/scale-uuid-1', {
        userId: 10,
        empresaId: 1, // caller is empresa 1
        body: { status_ciclo: 'ENCERRADO' },
        db: createDb({
          tripulanteEmpresaId: 2, // escala's tripulante belongs to empresa 2
          escalaExists: true,
          tripulanteExists: true,
        }),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.code || body.error).toMatch(/TENANT_ACCESS_DENIED/i);
    });

    it('Usuário empresa A edita escala de tripulante da mesma empresa A → permitido', async () => {
      const response = await frmsRequest('PUT', '/escalas/scale-uuid-1', {
        userId: 10,
        empresaId: 1,
        body: { status_ciclo: 'ENCERRADO' },
        db: createDb({
          tripulanteEmpresaId: 1, // escala's tripulante is from same empresa
          escalaExists: true,
          tripulanteExists: true,
        }),
      });

      // Permitido — o mock de atualizarEscala + db-service pode retornar erro
      // de DB, mas isso não é relevante para o teste de tenant. O importante
      // é que a checagem de tenant não bloqueou.
      expect(response.status).not.toBe(403);
    });
  });

  describe('DELETE /api/frms/escalas/:id', () => {
    it('Usuário empresa A tenta deletar escala de tripulante da empresa B → 403', async () => {
      const response = await frmsRequest('DELETE', '/escalas/scale-uuid-1', {
        userId: 10,
        empresaId: 1,
        db: createDb({
          tripulanteEmpresaId: 2,
          escalaExists: true,
          tripulanteExists: true,
        }),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.code || body.error).toMatch(/TENANT_ACCESS_DENIED/i);
    });

    it('Usuário empresa A deleta escala de tripulante da mesma empresa A → permitido', async () => {
      const response = await frmsRequest('DELETE', '/escalas/scale-uuid-1', {
        userId: 10,
        empresaId: 1,
        db: createDb({
          tripulanteEmpresaId: 1,
          escalaExists: true,
          tripulanteExists: true,
        }),
      });

      expect(response.status).not.toBe(403);
    });

    it('Escala inexistente → erro sem vazar tenant', async () => {
      const response = await frmsRequest('DELETE', '/escalas/nonexistent', {
        userId: 10,
        empresaId: 1,
        db: createDb({
          escalaExists: false,
          tripulanteExists: true,
        }),
      });

      // Deve retornar erro (404 ou similar), mas NÃO 403 de tenant
      // porque a escala não existe para nenhum tenant
      expect(response.status).not.toBe(403);
    });
  });
});
