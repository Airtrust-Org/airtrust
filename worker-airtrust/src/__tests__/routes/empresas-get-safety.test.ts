import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 1);
    c.set('empresaId', 1);
    c.set('userRole', 'admin');
    c.set('tenantContext', { empresaId: 1, role: 'admin', userId: 1 });
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  tenantMiddleware: () => async (c: any, next: () => Promise<void>) => {
    c.set('tenantContext', { empresaId: 1, role: 'admin', userId: 1 });
    await next();
  },
  getTenantContext: () => ({ empresaId: 1, role: 'admin', userId: 1 }),
  requireTenantRole: () => async (_c: any, next: () => Promise<void>) => await next(),
  isPlatformAdminContext: () => true,
}));

import { empresasRoutes } from '../../routes/empresas';

describe('P00-06: GET /api/empresas/minha safety in production', () => {
  it('em produção (ENVIRONMENT=production), se empresa 1 não existir, retorna 404 e NÃO executa escritas no banco', async () => {
    const executedQueries: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        executedQueries.push(sql);
        return {
          bind: vi.fn(() => ({
            first: vi.fn(async () => null), // empresa não encontrada
            all: vi.fn(async () => ({ results: [] })),
            run: vi.fn(async () => ({ success: true })),
          })),
          first: vi.fn(async () => null),
          all: vi.fn(async () => ({ results: [] })),
          run: vi.fn(async () => ({ success: true })),
        };
      }),
    };

    const app = new Hono<any>();
    app.onError(errorHandler);
    app.route('/api/empresas', empresasRoutes);

    const env = { DB: db, ENVIRONMENT: 'production' } as any;
    const res = await app.request('/api/empresas/minha', { method: 'GET' }, env);

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/Empresa não encontrada/i);

    // Garante que NENHUM INSERT ou UPDATE foi executado na tentativa de auto-recovery
    const writeQueries = executedQueries.filter(
      (q) => q.toUpperCase().includes('INSERT') || q.toUpperCase().includes('UPDATE'),
    );
    expect(writeQueries.length).toBe(0);
  });
});
