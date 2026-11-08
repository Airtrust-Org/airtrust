import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../middleware/error-handler';

const viewer = vi.hoisted(() => ({ role: 'aluno' }));
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
    const db = {
      prepare: vi.fn(() => ({
        bind: () => ({ first: async () => null }),
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
    } finally {
      viewer.role = 'aluno';
    }
  });
});
