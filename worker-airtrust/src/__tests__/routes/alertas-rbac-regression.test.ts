import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../middleware/error-handler';

const viewer = vi.hoisted(() => ({ role: 'aluno', setorIds: [17] as number[] }));
vi.mock('../../middleware/employee-sector-access', async () => {
  const mod = await vi.importActual<typeof import('../../middleware/employee-sector-access')>(
    '../../middleware/employee-sector-access',
  );
  return {
    ...mod,
    getEmployeeSectorAccess: vi.fn(async () =>
      viewer.role === 'manager'
        ? { mode: 'restricted', setorIds: viewer.setorIds, funcionarioId: null }
        : { mode: 'all', setorIds: [], funcionarioId: null },
    ),
  };
});
vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 9);
    c.set('empresaId', 1);
    c.set('userRole', viewer.role);
    c.set('tenantContext', { empresaId: 1, role: viewer.role, userId: 9 });
    await next();
  },
}));
vi.mock('../../middleware/legacy-tenant-boundaries', () => ({
  enforceLegacyTenantBoundaries: async () => undefined,
}));
import alertasRoutes from '../../routes/alertas';

describe('manual training alerts RBAC (P04-02/P04-03)', () => {
  it('rejects student access to recipient data and manual sending before DB access', async () => {
    const db = { prepare: vi.fn(() => { throw new Error('unauthorized DB access'); }) };
    const app = new Hono<any>();
    app.onError(errorHandler);
    app.route('/api', alertasRoutes);
    viewer.role = 'aluno';
    const env = { DB: db, ENVIRONMENT: 'production' } as any;
    for (const [method, url] of [
      ['GET', '/api/alertas/vencimentos'],
      ['POST', '/api/alertas/ead-vencido/999'],
    ]) {
      const response = await app.request(url, { method }, env);
      expect(response.status).toBe(403);
    }
    expect(db.prepare).not.toHaveBeenCalled();
    viewer.role = 'aluno';
  });

  it('preserves manager access to the qualified route without sending anything', async () => {
    const queries: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: (...args: unknown[]) => {
          queries.push({ sql, args });
          return { first: async () => null };
        },
      })),
    };
    const app = new Hono<any>();
    app.onError(errorHandler);
    app.route('/api', alertasRoutes);
    viewer.role = 'manager';
    try {
      const response = await app.request(
        '/api/alertas/ead-vencido/999',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
        { DB: db, ENVIRONMENT: 'production' } as any,
      );
      expect(response.status).toBe(404);
      expect(db.prepare).toHaveBeenCalled();
      expect(queries.some(({ sql, args }) =>
        sql.includes('FROM qualificacoes_historico qh')
        && sql.includes('f.setor_id IN (?)')
        && args.includes(17),
      )).toBe(true);
    } finally {
      viewer.role = 'aluno';
    }
  });

  it('filters both qualification and license visibility by a manager sector', async () => {
    const queries: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: (...args: unknown[]) => {
          queries.push({ sql, args });
          return {
            first: async () => null,
            all: async () => ({ success: true, results: [] }),
          };
        },
      })),
    };
    const app = new Hono<any>();
    app.onError(errorHandler);
    app.route('/api', alertasRoutes);
    viewer.role = 'manager';
    viewer.setorIds = [17];
    try {
      const response = await app.request('/api/alertas/vencimentos', {},
        { DB: db, ENVIRONMENT: 'production' } as any);
      expect(response.status).toBe(200);
      const qualifications = queries.find(({ sql }) => sql.includes('FROM qualificacoes_historico qh'));
      const licenses = queries.find(({ sql }) => sql.includes('FROM licencas l'));
      expect(qualifications?.sql).toContain('p.setor_id IN (?)');
      expect(licenses?.sql).toContain('p.setor_id IN (?)');
      expect(qualifications?.args).toContain(17);
      expect(licenses?.args).toContain(17);

      viewer.setorIds = [];
      queries.length = 0;
      const noSector = await app.request('/api/alertas/vencimentos', {},
        { DB: db, ENVIRONMENT: 'production' } as any);
      expect(noSector.status).toBe(200);
      expect(queries.filter(({ sql }) => sql.includes('FROM qualificacoes_historico qh')
        || sql.includes('FROM licencas l')).every(({ sql }) => sql.includes('1 = 0'))).toBe(true);
    } finally {
      viewer.role = 'aluno';
      viewer.setorIds = [17];
    }
  });
});
