import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 71);
    c.set('userRole', 'manager');
    c.set('empresaId', Number(c.req.header('x-test-tenant') || 0));
    await next();
  },
}));
vi.mock('../../middleware/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/rate-limit')>()),
  rateLimiter: () => async (_c: any, next: () => Promise<void>) => next(),
}));
vi.mock('../../routes/frms-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../routes/frms-shared')>()),
  getEmpresaIdSafe: (c: any) => Number(c.get('empresaId') || 0) || undefined,
}));
import frmsRoutes from '../../routes/frms';

function app() {
  const a = new Hono();
  a.route('/api/frms', frmsRoutes);
  return a;
}
function dbSpy() {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => {
    const stmt = {
      params: [] as unknown[],
      bind(...params: unknown[]) { stmt.params = params; return stmt; },
      async first() {
        statements.push({ sql, params: stmt.params });
        return { count: 4, total: 4 };
      },
      async all() {
        statements.push({ sql, params: stmt.params });
        return { results: [] };
      },
    };
    return stmt;
  });
  return { db: { prepare } as unknown as D1Database, prepare, statements };
}
async function request(path: string, tenant: number, db: D1Database) {
  return app().request('http://localhost/api/frms' + path,
    { headers: { 'x-test-tenant': String(tenant) } },
    { DB: db } as Env);
}

describe('FRMS alert list and count tenant gating', () => {
  it.each(['/alertas', '/alertas/count', '/ultimo-mes'])('fails closed without empresa context on %s', async path => {
    const fake = dbSpy();
    const res = await request(path, 0, fake.db);
    expect(res.status).toBe(403);
    expect((await res.json()) as object).toMatchObject({ code: 'FRMS_TENANT_CONTEXT_REQUIRED' });
    expect(fake.prepare).not.toHaveBeenCalled();
  });

  it('uses mandatory tenant binding for the most recent month', async () => {
    const fake = dbSpy();
    const res = await request('/ultimo-mes', 27, fake.db);
    expect(res.status).toBe(200);
    expect(fake.statements).toHaveLength(1);
    expect(fake.statements[0].sql).toContain('f.empresa_id = ?');
    expect(fake.statements[0].sql).not.toContain('? IS NULL OR');
    expect(fake.statements[0].params).toEqual([27]);
  });

  it('uses mandatory tenant binding for the counter', async () => {
    const fake = dbSpy();
    const res = await request('/alertas/count', 27, fake.db);
    expect(res.status).toBe(200);
    expect(fake.statements).toHaveLength(1);
    expect(fake.statements[0].sql).toContain('f.empresa_id = ?');
    expect(fake.statements[0].sql).not.toContain('? IS NULL OR');
    expect(fake.statements[0].params).toEqual([27]);
  });
});
