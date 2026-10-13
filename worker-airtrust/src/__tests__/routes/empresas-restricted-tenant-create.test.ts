import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/auth')>()),
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 1);
    c.set('userRole', 'admin');
    c.set('empresaId', 1);
    await next();
  },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/tenant')>()),
  tenantMiddleware: () => async (_c: any, next: () => Promise<void>) => next(),
  requireTenantRole: () => async (_c: any, next: () => Promise<void>) => next(),
  getTenantContext: () => ({ empresaId: 1, empresaCodigo: 'airtrust' }),
  isPlatformAdminContext: () => true,
}));

vi.mock('../../utils/auditoria', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/auditoria')>()),
  registrarAuditoria: vi.fn(async () => undefined),
}));

import { empresasRoutes } from '../../routes/empresas';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/empresas', empresasRoutes);
  return app;
}

function fakeDb() {
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      const stmt = {
        params: [] as unknown[],
        bind(...params: unknown[]) { stmt.params = params; return stmt; },
        async first() { return null; },
        async all() { return { results: [] }; },
        async run() {
          writes.push({ sql, params: stmt.params });
          return { success: true, meta: { last_row_id: 51 } };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, writes };
}

describe('POST /api/empresas — criação de tenant segregado', () => {
  it('registra empresa separada, inativa, sem módulos até homologação', async () => {
    const { db, writes } = fakeDb();
    const res = await createApp().request(
      'http://localhost/api/empresas',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nome: 'Bombeiros',
          codigo: 'bombeiros',
          plano: 'enterprise',
          max_funcionarios: 130,
          ativo: 0,
          modulos_ativos: [],
        }),
      },
      { DB: db } as Env,
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { id: number; ativo: number; codigo: string } };
    expect(body.data.id).toBe(51);
    expect(body.data.codigo).toBe('bombeiros');
    expect(body.data.ativo).toBe(0);

    const companyInsert = writes.find((w) => /INSERT INTO empresas \(/.test(w.sql));
    expect(companyInsert?.sql).toContain('ativo');
    expect(companyInsert?.params).toContain(130);
    expect(companyInsert?.params).toContain(0);
    const configInsert = writes.find((w) => /INSERT INTO empresas_config \(/.test(w.sql));
    expect(configInsert?.params).toEqual([51, '[]']);
  });

  it('preserva contrato legado quando módulos e status não foram informados', async () => {
    const { db, writes } = fakeDb();
    const res = await createApp().request(
      'http://localhost/api/empresas',
      {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nome: 'Outra Empresa', codigo: 'outra_empresa' }),
      },
      { DB: db } as Env,
    );
    expect(res.status).toBe(201);
    const company = writes.find((w) => /INSERT INTO empresas \(/.test(w.sql));
    expect(company?.params).toContain(1);
    const config = writes.find((w) => /INSERT INTO empresas_config \(/.test(w.sql));
    expect(config?.params).toEqual([51, '["treinamento","compliance"]']);
  });
});
