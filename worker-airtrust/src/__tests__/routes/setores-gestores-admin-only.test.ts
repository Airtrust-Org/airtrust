/**
 * Setor-gestor assignment/removal is an administrative function
 * (gestor-operational-domain-rbac §1): a GESTOR must not be able to
 * assign, alter, or remove setor-gestor links — not even for their own
 * setor. Only ADMINISTRADOR can. This exercises the REAL requireRole
 * middleware (not mocked) so the actual role gate on each route is what's
 * under test.
 */
import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      c.set('userId', Number(c.req.header('x-test-user-id') || 1));
      c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 1));
      c.set('userRole', c.req.header('x-test-role') || 'admin');
      await next();
    },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
  };
});

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn().mockResolvedValue(undefined),
  extrairUsuarioAuditoria: () => ({ usuario_id: 1, usuario_nome: 'teste' }),
}));

vi.mock('../../services/setores-gestores', () => ({
  setorGestorSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
  setorGestorUpdateSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
  createSetorGestor: vi.fn().mockResolvedValue(1),
  getSetorGestorById: vi.fn().mockResolvedValue({ id: 1, setor_id: 10, usuario_id: 100 }),
  getSetorGestoresBySetor: vi.fn().mockResolvedValue([]),
  getSetorGestoresByGestor: vi.fn().mockResolvedValue([]),
  getAllSetorGestores: vi.fn().mockResolvedValue([]),
  updateSetorGestor: vi.fn().mockResolvedValue(undefined),
  deleteSetorGestor: vi.fn().mockResolvedValue(undefined),
  getGestoresByFuncionarioSetor: vi.fn().mockResolvedValue([]),
  listEligibleGestorUsers: vi.fn().mockResolvedValue([]),
  SetorGestorValidationError: class extends Error {},
  SetorGestorConflictError: class extends Error {},
  assertBulkReassignmentDoesNotStripLastSector: vi.fn().mockResolvedValue(undefined),
}));

import router from '../../routes/setores-gestores';

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/setores-gestores', router);
  return app;
}

// Minimal DB stub: createSetorGestor/getSetorGestorById/etc. are mocked
// above, but the bulk-assign handler also issues a couple of raw
// c.env.DB.prepare(...) calls directly (listing current vínculos, soft
// deleting them) before delegating — those just need to not throw here.
function makeFakeDb(): Env['DB'] {
  const statement = {
    bind: () => statement,
    all: async () => ({ results: [] }),
    first: async () => null,
    run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
  };
  return { prepare: () => statement } as unknown as Env['DB'];
}

async function request(
  path: string,
  method: string,
  role: string,
  body?: unknown,
) {
  const app = buildApp();
  return app.request(
    `/api/setores-gestores${path}`,
    {
      method,
      headers: { 'x-test-role': role, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    },
    { DB: makeFakeDb() } as unknown as Env,
  );
}

describe('setores-gestores write endpoints are admin-only', () => {
  it('gestor não cria vínculo setor-gestor', async () => {
    const res = await request('', 'POST', 'gestor', { setor_id: 10, usuario_id: 100 });
    expect(res.status).toBe(403);
  });

  it('gestor não altera vínculo setor-gestor', async () => {
    const res = await request('/1', 'PUT', 'gestor', { ativo: false });
    expect(res.status).toBe(403);
  });

  it('gestor não remove vínculo setor-gestor', async () => {
    const res = await request('/1', 'DELETE', 'gestor');
    expect(res.status).toBe(403);
  });

  it('gestor não pode fazer bulk-assign de gestores de um setor', async () => {
    const res = await request('/bulk-assign/10', 'POST', 'gestor', { usuario_ids: [100] });
    expect(res.status).toBe(403);
  });

  it('administrador continua podendo criar vínculo setor-gestor', async () => {
    const res = await request('', 'POST', 'admin', { setor_id: 10, usuario_id: 100 });
    expect(res.status).toBe(201);
  });

  it('administrador continua podendo alterar vínculo setor-gestor', async () => {
    const res = await request('/1', 'PUT', 'admin', { ativo: false });
    expect(res.status).toBe(200);
  });

  it('administrador continua podendo remover vínculo setor-gestor', async () => {
    const res = await request('/1', 'DELETE', 'admin');
    expect(res.status).toBe(200);
  });

  it('administrador continua podendo fazer bulk-assign', async () => {
    const res = await request('/bulk-assign/10', 'POST', 'admin', { usuario_ids: [100] });
    expect(res.status).toBe(200);
  });
});
