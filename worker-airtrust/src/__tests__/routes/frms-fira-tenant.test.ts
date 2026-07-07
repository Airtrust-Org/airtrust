/**
 * BUG-AIRTRUST-004 — FIRA Upload Tenant Isolation Tests
 *
 * Verifica que upload FIRA não cai em empresa_id='1' quando
 * operador/funcionário não resolve. Deve usar tenant do JWT.
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
      if (!c.req.header('Authorization')) {
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
  createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  toError: (e: any) => e instanceof Error ? e : new Error(String(e)),
}));

// Mock frms-shared to track which empresaId is used
let lastEmpresaIdUsed: string | null = null;

vi.mock('../../routes/frms-shared', () => ({
  safe: (fn: any) => fn,
  getEmpresaIdSafe: (c: any) => {
    const empresaId = c.get('empresaId');
    return empresaId && empresaId > 0 ? empresaId : null;
  },
  assertTripulanteEmpresa: async () => null,
  assertJornadaEmpresa: async () => null,
  assertAlertaEmpresa: async () => null,
  resolveFuncionarioId: async (c: any) => Number(c.get('userId') || 0),
  auditFrms: async () => {},
  logDomainEventError: () => {},
}));

// Mock fira-service to capture which empresaId is passed
let capturedEmpresaId: string | null = null;

vi.mock('../../lib/frms/fira-service', () => ({
  processarUploadFira: async (
    _db: any, _bucket: any, _buffer: any, _name: string,
    _operadorId: number, empresaId: string, _texto: string | undefined,
  ) => {
    capturedEmpresaId = empresaId;
    return { id: 'preview-1', empresa_id: empresaId };
  },
  processarUploadFirasPorPagina: async (
    _db: any, _bucket: any, _files: any[],
    _operadorId: number, empresaId: string,
  ) => {
    capturedEmpresaId = empresaId;
    return [{ id: 'preview-1', empresa_id: empresaId }];
  },
  confirmarImportacaoFira: async () => ({}),
  buscarHistoricoFira: async () => [],
  buscarImportacaoFiraById: async () => null,
  deletarImportacaoFira: async () => {},
  vincularTripulanteFira: async () => ({}),
}));

vi.mock('../../lib/frms/fira-horas-voo', () => ({
  syncHorasVooFromFira: async () => {},
}));

vi.mock('../../lib/frms/db-service', () => ({
  carregarLimites: async () => ({}),
  reprocessarTripulanteCompleto: async () => {},
}));

// ===== HELPERS =====

import firaRoutes from '../../routes/frms-fira';

function createDb(opts?: { operadorTemEmpresa?: boolean }): D1Database {
  const operadorTemEmpresa = opts?.operadorTemEmpresa ?? true;

  const db = {
    prepare: (sql: string) => {
      const stmt: any = {
        bind: (..._args: unknown[]) => stmt,
        first: async () => {
          // resolveFuncionarioId: look up funcionario by user_id
          if (sql.includes('SELECT id, empresa_id FROM funcionarios')) {
            if (operadorTemEmpresa) {
              return { id: 50, empresa_id: 3 }; // note: empresa_id from funcionario, not tenant!
            }
            return null;
          }
          // operadorRow: SELECT empresa_id FROM funcionarios WHERE id = ?
          if (sql.includes('SELECT empresa_id FROM funcionarios') && sql.includes('deleted_at')) {
            if (operadorTemEmpresa) {
              return { empresa_id: '3' }; // this is the WRONG pattern: fallback to '1' if null
            }
            return null;
          }
          return null;
        },
        all: async () => ({ results: [] }),
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
    BUCKET: { put: async () => {}, get: async () => null } as any,
    ENVIRONMENT: 'test',
  } as unknown as Env;
}

function createApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const statusCode = (err as any)?.statusCode;
    if (typeof statusCode === 'number') {
      return c.json({ success: false, error: (err as any).message }, statusCode as any);
    }
    return c.json({ success: false, error: 'Internal error' }, 500);
  });
  app.route('/api/frms', firaRoutes);
  return app;
}

async function uploadFiraRequest(opts: {
  userId: number;
  empresaId: number;
  role?: string;
  db?: D1Database;
}) {
  const { userId, empresaId, role = 'admin', db = createDb() } = opts;

  const app = createApp();
  const headers: Record<string, string> = {
    Authorization: 'Bearer test-token',
    'x-test-user-id': String(userId),
    'x-test-user-role': role,
    'x-test-empresa-id': String(empresaId),
  };

  const formData = new FormData();
  formData.append('arquivo', new Blob(['fake-pdf'], { type: 'application/pdf' }), 'test.pdf');
  formData.append('texto_extraido', 'fake text');

  return app.fetch(
    new Request('http://localhost/api/frms/importacao/fira/upload', {
      method: 'POST',
      headers,
      body: formData,
    }),
    createEnv(db),
    {} as ExecutionContext,
  );
}

// ===== TESTS =====

describe('FIRA upload tenant isolation (BUG-004)', () => {
  beforeEach(() => {
    capturedEmpresaId = null;
  });

  it('Upload FIRA com operador sem funcionário → usa tenant do JWT, não empresa 1', async () => {
    // operador sem vinculo em funcionarios → antes caía em empresa_id='1'
    const response = await uploadFiraRequest({
      userId: 10,
      empresaId: 5, // caller's tenant is empresa 5
      db: createDb({ operadorTemEmpresa: false }),
    });

    // Deve usar empresaId do tenant (5), NÃO '1' nem '3' do operadorRow
    expect(String(capturedEmpresaId)).toBe('5');
    expect(capturedEmpresaId).not.toBe('1');
    expect(response.status).toBe(200);
  });

  it('Upload FIRA com tenant válido → usa empresa_id do tenant', async () => {
    const response = await uploadFiraRequest({
      userId: 10,
      empresaId: 7,
      db: createDb({ operadorTemEmpresa: true }),
    });

    // Mesmo com operadorRow.empresa_id = '3', deve usar tenant empresaId = 7
    expect(String(capturedEmpresaId)).toBe('7');
    expect(String(capturedEmpresaId)).not.toBe('3');
    expect(response.status).toBe(200);
  });

  it('Upload FIRA sem tenant válido → 403 (fail-closed)', async () => {
    const response = await uploadFiraRequest({
      userId: 10,
      empresaId: 0, // invalid context
      db: createDb({ operadorTemEmpresa: true }),
    });

    // Sem tenant válido, não deve processar
    expect(response.status).not.toBe(200);
    expect(capturedEmpresaId).toBeNull(); // never called
  });
});
