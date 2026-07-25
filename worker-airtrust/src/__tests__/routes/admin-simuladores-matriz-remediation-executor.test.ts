import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 99);
    c.set('userRole', String(c.env?.__mockRole ?? 'admin'));
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    (...roles: string[]) =>
    async (c: any, next: () => Promise<void>) => {
      const role = String(c.get('userRole') || '').toLowerCase();
      if (!roles.includes(role)) return c.json({ success: false, error: 'forbidden' }, 403);
      await next();
    },
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: any) => ({ empresaId: Number(c.env?.__mockEmpresaId ?? 6) }),
}));

import executorRoutes from '../../routes/admin-simuladores-matriz-remediation-executor';

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/x', executorRoutes);
  return app;
}

function fakeDb(migrationsPresent: boolean) {
  return {
    prepare(sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        async all() {
          if (sql.includes('sqlite_master')) {
            return {
              results: migrationsPresent ? [{ name: 'simuladores_matriz_remediations' }, { name: 'simuladores_matriz_resolution_corrections' }] : [],
            };
          }
          return { results: [] };
        },
        async run() {
          return { success: true };
        },
      };
      return stmt;
    },
    async batch() {
      return [];
    },
  } as unknown as D1Database;
}

function baseEnv(overrides: Record<string, unknown> = {}) {
  return {
    ENABLE_SIMULADORES_MATRIZ_REMEDIATION_EXECUTOR: 'true',
    __mockEmpresaId: 6,
    DB: fakeDb(true),
    ...overrides,
  } as unknown as Env;
}

const MINIMAL_PLAN = {
  schema_version: 1,
  remediation_uuid: 'rem-x',
  empresa_id: 6,
  versao_matriz: 'M2026.07',
  source_matrix_import_uuid: 'imp',
  source_guide_import_uuid: 'guide',
  base_fingerprint: 'a'.repeat(64),
  expected_hash: 'b'.repeat(64),
  mapping_count: 5,
  model_count: 9,
  link_count: 13,
  mappings: [],
};

describe('admin-simuladores-matriz-remediation-executor: gating', () => {
  it('refuses when the executor flag is not explicitly enabled', async () => {
    const app = buildApp();
    const env = baseEnv({ ENABLE_SIMULADORES_MATRIZ_REMEDIATION_EXECUTOR: undefined });
    const res = await app.request('/x/dry-run', { method: 'POST', body: JSON.stringify(MINIMAL_PLAN) }, env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error?: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/desabilitado/);
  });

  it('refuses a non-admin role', async () => {
    const app = buildApp();
    const env = baseEnv({ __mockRole: 'manager' });
    const res = await app.request('/x/dry-run', { method: 'POST', body: '{}' }, env);
    expect(res.status).toBe(403);
  });

  it('refuses a tenant other than empresa_id 6', async () => {
    const app = buildApp();
    const env = baseEnv({ __mockEmpresaId: 8 });
    const res = await app.request('/x/dry-run', { method: 'POST', body: JSON.stringify(MINIMAL_PLAN) }, env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/não autorizado|tenant do plano diverge/);
  });

  it('fails closed when migration 0443 tables are absent', async () => {
    const app = buildApp();
    const env = baseEnv({ DB: fakeDb(false) });
    const res = await app.request('/x/dry-run', { method: 'POST', body: JSON.stringify(MINIMAL_PLAN) }, env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/migration 0443/);
  });

  it('checks the flag before any DB access (apply)', async () => {
    const app = buildApp();
    let dbTouched = false;
    const env = baseEnv({
      ENABLE_SIMULADORES_MATRIZ_REMEDIATION_EXECUTOR: undefined,
      DB: new Proxy(fakeDb(true), {
        get(target, prop) {
          dbTouched = true;
          return (target as any)[prop];
        },
      }),
    });
    await app.request('/x/apply', { method: 'POST', body: JSON.stringify(MINIMAL_PLAN) }, env);
    expect(dbTouched).toBe(false);
  });

  it('status endpoint reports not-found for an unknown remediation_uuid without requiring the flag', async () => {
    const app = buildApp();
    const env = baseEnv({ ENABLE_SIMULADORES_MATRIZ_REMEDIATION_EXECUTOR: undefined });
    const res = await app.request('/x/status/unknown-uuid', { method: 'GET' }, env);
    expect(res.status).toBe(404);
  });
});
