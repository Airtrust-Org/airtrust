import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('userId', 10);
    c.set('userRole', 'admin');
    await next();
  },
}));
vi.mock('../../middleware/rbac', () => ({
  hasRole: () => true,
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../routes/escalas-shared', () => ({ getEmpresaIdSafe: () => 6 }));
vi.mock('../../services/employee-sector-access', () => ({
  assertFuncionarioInScope: vi.fn(),
  employeeSectorSql: () => ({ clause: '1 = 1', bindings: [] }),
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [] })),
}));

import lmsMatriculasRoutes from '../../routes/lms-matriculas';
import { errorHandler } from '../../middleware/error-handler';

function setup(physicalType = 'scorm', activation = true, missingTable = false) {
  const prepares: string[] = [];
  const writes: string[] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      prepares.push(sql);
      if (sql.includes('INSERT') || sql.includes('UPDATE')) writes.push(sql);
      return {
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (sql.includes('lms_native_catalog_activation')) {
              if (missingTable) throw new Error('no such table');
              return activation ? { curso_id: 99 } : null;
            }
            if (sql.includes('FROM lms_cursos')) {
              return { id: 99, titulo: 'Curso Novo', tipo_conteudo: physicalType,
                qualificacao_tipo_id: null };
            }
            throw new Error('UNEXPECTED_QUERY_AFTER_ENROLLMENT_GUARD');
          },
        }),
      };
    }),
  } as unknown as D1Database;
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/', lmsMatriculasRoutes);
  const env = {
    ENVIRONMENT: 'staging',
    NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS: '6',
    DB: db,
  } as Env;
  return { app, db, env, prepares, writes };
}

describe('legacy enrollment cannot create or reactivate Native-marked training', () => {
  it.each([
    ['/', { curso_id: 99, funcionario_id: 16 }],
    ['/lote', { curso_id: 99, funcionario_ids: [16, 17] }],
  ])('rejects activated course before any write on POST %s', async (path, body) => {
    const { app, env, writes, prepares } = setup();
    const response = await app.fetch(new Request('http://localhost' + path, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }), env, {} as ExecutionContext);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'NATIVE_LEGACY_ENROLLMENT_BLOCKED' });
    expect(prepares.some((sql) => sql.includes('lms_native_catalog_activation'))).toBe(true);
    expect(writes).toHaveLength(0);
  });
  it('refuses single enrollment of physical Native even without an activation row', async () => {
    const { app, env, prepares } = setup('native', false);
    const response = await app.fetch(new Request('http://localhost/', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ curso_id: 99, funcionario_id: 16 }),
    }), env, {} as ExecutionContext);
    expect(response.status).toBe(409);
    expect(prepares.some((sql) => sql.includes('lms_native_catalog_activation'))).toBe(false);
  });
  it('fails closed when the configured Native activation table is unavailable', async () => {
    const { app, env, writes } = setup('scorm', true, true);
    const response = await app.fetch(new Request('http://localhost/', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ curso_id: 99, funcionario_id: 16 }),
    }), env, {} as ExecutionContext);
    expect(response.status).toBe(503);
    expect(writes).toHaveLength(0);
  });
});
