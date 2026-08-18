/**
 * P0-FRMS-001 / P0-FRMS-002 — FRMS tenant scope regression tests.
 *
 * `listarTripulantesAtivos` and `reprocessarTodosTripulantes` used to query
 * `frms_jornada` with no `empresa_id` filter at all. An authenticated admin
 * of tenant A could:
 *   - list tripulante names/ids of tenant B via GET /api/frms/tripulantes-ativos
 *   - trigger a background reprocessamento of tenant B's jornadas/alertas via
 *     POST /api/frms/reprocessar
 *
 * These tests exercise the real route handlers (frmsRoutes.request) and
 * verify that:
 *   1. `listarTripulantesAtivos`/`reprocessarTodosTripulantes` (unmocked,
 *      real SQL-shape logic) filter by empresa_id when an id is passed, and
 *      preserve the "no filter" global behavior needed by cron when omitted.
 *   2. The `/tripulantes-ativos` and `/reprocessar` routes always pass the
 *      authenticated tenant's empresaId through to the service layer, and
 *      refuse to run (403) when tenant context is missing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

// empresaId is injected per-request via header to simulate different tenants,
// exactly like frms-jornadas-empresa-guard.test.ts does.
vi.mock('../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/auth')>();
  return {
    ...actual,
    auth: () => async (c: any, next: () => Promise<void>) => {
      if (!c.req.header('authorization')) {
        return c.json(
          { success: false, error: 'Token de autenticação não fornecido', code: 'MISSING_TOKEN' },
          401,
        );
      }
      c.set('userId', 101);
      c.set('userRole', 'admin');
      const empresaIdHeader = c.req.header('x-test-empresa-id');
      const empresaId = empresaIdHeader ? Number(empresaIdHeader) : undefined;
      if (empresaId) {
        c.set('empresaId', empresaId);
        c.set('tenantContext', {
          empresaId,
          empresaCodigo: `tenant-${empresaId}`,
          empresaNome: `Tenant ${empresaId}`,
          role: 'admin',
          plano: 'pro',
          permissions: ['*'],
        });
      }
      await next();
    },
  };
});

vi.mock('../../middleware/maintenance-access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/maintenance-access')>();
  return {
    ...actual,
    requireMaintenanceCapability: () => async (_c: any, next: () => Promise<void>) => {
      await next();
    },
    recordMaintenanceAudit: vi.fn().mockResolvedValue(undefined),
    assertNoImpersonation: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('../../middleware/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/rate-limit')>();
  return {
    ...actual,
    rateLimiter: () => async (_c: any, next: () => Promise<void>) => {
      await next();
    },
  };
});

const reprocessarTodosTripulantesMock = vi.fn().mockResolvedValue({
  tripulantes: 0,
  jornadas: 0,
  erros: 0,
});
const listarTripulantesAtivosMock = vi.fn().mockResolvedValue([]);

vi.mock('../../lib/frms/db-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/frms/db-service')>();
  return {
    ...actual,
    reprocessarTodosTripulantes: (...args: unknown[]) => reprocessarTodosTripulantesMock(...args),
    listarTripulantesAtivos: (...args: unknown[]) => listarTripulantesAtivosMock(...args),
  };
});

import frmsRoutes from '../../routes/frms';
import {
  listarTripulantesAtivos as listarTripulantesAtivosReal,
  reprocessarTodosTripulantes as reprocessarTodosTripulantesReal,
} from '../../lib/frms/db-service-jornadas';

const waitUntilPromises: Promise<unknown>[] = [];

function createEnv(): Env {
  return {
    DB: {} as unknown as Env['DB'],
    ENVIRONMENT: 'test',
  } as unknown as Env;
}

function createExecCtx(): ExecutionContext {
  return {
    waitUntil: (promise: Promise<unknown>) => {
      waitUntilPromises.push(promise);
    },
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
}

describe('P0-FRMS-001/002 — routes pass tenant empresaId to global FRMS helpers', () => {
  beforeEach(() => {
    reprocessarTodosTripulantesMock.mockClear();
    listarTripulantesAtivosMock.mockClear();
    waitUntilPromises.length = 0;
  });

  it('GET /tripulantes-ativos passes the authenticated tenant empresaId, never a cross-tenant list', async () => {
    const response = await frmsRoutes.request(
      'http://localhost/tripulantes-ativos',
      { method: 'GET', headers: { authorization: 'Bearer synthetic', 'x-test-empresa-id': '1' } },
      createEnv(),
      createExecCtx(),
    );

    expect(response.status).toBe(200);
    expect(listarTripulantesAtivosMock).toHaveBeenCalledTimes(1);
    expect(listarTripulantesAtivosMock).toHaveBeenCalledWith(expect.anything(), 1);
  });

  it('GET /tripulantes-ativos refuses to run without a valid tenant context (fail-closed)', async () => {
    const response = await frmsRoutes.request(
      'http://localhost/tripulantes-ativos',
      { method: 'GET', headers: { authorization: 'Bearer synthetic' } },
      createEnv(),
      createExecCtx(),
    );

    expect(response.status).toBe(403);
    expect(listarTripulantesAtivosMock).not.toHaveBeenCalled();
  });

  it('POST /reprocessar passes the authenticated tenant empresaId to reprocessarTodosTripulantes', async () => {
    const response = await frmsRoutes.request(
      'http://localhost/reprocessar',
      { method: 'POST', headers: { authorization: 'Bearer synthetic', 'x-test-empresa-id': '2' } },
      createEnv(),
      createExecCtx(),
    );

    expect(response.status).toBe(200);
    // The reprocessing runs inside c.executionCtx.waitUntil.
    await Promise.all(waitUntilPromises);
    expect(reprocessarTodosTripulantesMock).toHaveBeenCalledWith(expect.anything(), 2);
  });

  it('POST /reprocessar refuses to run without a valid tenant context (fail-closed)', async () => {
    const response = await frmsRoutes.request(
      'http://localhost/reprocessar',
      { method: 'POST', headers: { authorization: 'Bearer synthetic' } },
      createEnv(),
      createExecCtx(),
    );

    expect(response.status).toBe(403);
    await Promise.all(waitUntilPromises);
    expect(reprocessarTodosTripulantesMock).not.toHaveBeenCalled();
  });
});

describe('P0-FRMS-001/002 — listarTripulantesAtivos/reprocessarTodosTripulantes real SQL-shape scoping', () => {
  // Minimal D1 double modeling frms_jornada LEFT JOIN funcionarios, with two
  // tenants (empresa 1 and empresa 2) each owning a tripulante.
  function createScopedDb() {
    const jornadas = [
      { tripulante_id: 100, empresa_id: 1, nome: 'Tripulante A' },
      { tripulante_id: 200, empresa_id: 2, nome: 'Tripulante B' },
    ];
    return {
      prepare: (sql: string) => {
        let binds: unknown[] = [];
        const stmt = {
          bind: (...args: unknown[]) => {
            binds = args;
            return stmt;
          },
          all: async () => {
            // listarTripulantesAtivos: SELECT DISTINCT ... FROM frms_jornada j
            // LEFT JOIN funcionarios p ... — the only query in this suite that
            // joins funcionarios, and binds empresaId twice for the
            // "AND (? IS NULL OR p.empresa_id = ?)" clause.
            if (sql.includes('FROM frms_jornada') && sql.includes('LEFT JOIN funcionarios')) {
              const [empresaIdA, empresaIdB] = binds as [number | null, number | null];
              // sanity: both bound params must match (query binds empresaId twice)
              expect(empresaIdA).toBe(empresaIdB);
              const rows = jornadas
                .filter((j) => empresaIdA == null || j.empresa_id === empresaIdA)
                .map((j) => ({ id: j.tripulante_id, nome: j.nome, empresa_id: j.empresa_id }));
              return { results: rows };
            }
            // reprocessarTripulanteCompleto's per-tripulante jornada lookup —
            // no jornadas needed for this suite, just needs to not error.
            return { results: [] };
          },
          first: async () => null,
          run: async () => ({ meta: {} }),
        };
        return stmt;
      },
    } as unknown as Env['DB'];
  }

  it('listarTripulantesAtivos(db, empresaId) returns only that tenant tripulantes', async () => {
    const db = createScopedDb();
    const rowsTenantA = await listarTripulantesAtivosReal(db, 1);
    expect(rowsTenantA).toEqual([{ id: 100, nome: 'Tripulante A', empresa_id: 1 }]);

    const rowsTenantB = await listarTripulantesAtivosReal(db, 2);
    expect(rowsTenantB).toEqual([{ id: 200, nome: 'Tripulante B', empresa_id: 2 }]);
  });

  it('listarTripulantesAtivos(db) without empresaId preserves the global cron behavior', async () => {
    const db = createScopedDb();
    const rows = await listarTripulantesAtivosReal(db);
    expect(rows).toHaveLength(2);
  });

  it('reprocessarTodosTripulantes(db, empresaId) only reprocesses tripulantes within that tenant', async () => {
    const db = createScopedDb();
    const result = await reprocessarTodosTripulantesReal(db, 1);
    expect(result.tripulantes).toBe(1);
  });
});
