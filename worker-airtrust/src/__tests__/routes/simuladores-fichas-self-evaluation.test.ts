import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 101);
    c.set('userRole', 'manager');
    c.set('empresaId', Number(c.env?.__mockEmpresaId ?? 6));
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

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [], funcionarioId: null })),
}));

vi.mock('../../utils/ficha-role-scope', () => ({
  resolveFichaScope: () => 'FULL_ACCESS',
}));

vi.mock('../../routes/simuladores-shared', async () => {
  const actual = await vi.importActual('../../routes/simuladores-shared');
  return {
    ...actual,
    audit: vi.fn(async () => undefined),
  };
});

import simuladoresFichasRoutes from '../../routes/simuladores-fichas';

function createDbMock() {
  const runs: Array<{ query: string; args: unknown[] }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          // operational-domain-access.ts: isTenantRbacEnabled — legacy tenant.
          if (query.includes('FROM empresas WHERE id')) {
            return { operational_domain_rbac_enabled: 0 };
          }
          if (query.includes('SELECT COUNT(DISTINCT id) AS total') && query.includes('FROM funcionarios')) {
            return { total: 2 };
          }
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => {
          runs.push({ query, args });
          return { meta: { changes: 1, last_row_id: 901 } };
        },
      });

      return {
        bind,
        first: () => bind().first(),
        all: () => bind().all(),
        run: () => bind().run(),
      };
    }),
  } as unknown as D1Database;

  return { db, runs };
}

describe('simuladores fichas — self-evaluation guard (examiner training and generic)', () => {
  it('POST /fichas bloqueia quando instrutor_id === colaborador_id_aluno (EXA-V01)', async () => {
    const { db, runs } = createDbMock();

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          colaborador_id_aluno: 10,
          instrutor_id: 10,
          tipo_sessao: 'EXA-V01',
          tipo_aeronave: 'AW139',
        }),
      }),
      { DB: db, __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('autoavaliação'),
    });
    expect(runs.some((item) => item.query.includes('INSERT INTO fichas_sessao'))).toBe(false);
  });

  it('POST /fichas permite instrutor distinto do aluno (EXA-V01)', async () => {
    const { db, runs } = createDbMock();

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          colaborador_id_aluno: 10,
          instrutor_id: 11,
          tipo_sessao: 'EXA-V01',
          tipo_aeronave: 'AW139',
        }),
      }),
      { DB: db, __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(201);
    expect(runs.some((item) => item.query.includes('INSERT INTO fichas_sessao'))).toBe(true);
  });
});
