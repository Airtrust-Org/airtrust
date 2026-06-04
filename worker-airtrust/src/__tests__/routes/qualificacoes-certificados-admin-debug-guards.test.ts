import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 1);
    c.set('userRole', 'admin');
    c.set('empresaId', 1);
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    () =>
    async (_c: any, next: () => Promise<void>) => {
      await next();
    },
}));

import routes from '../../routes/qualificacoes-certificados-admin';

function createDb() {
  const first = vi
    .fn()
    .mockResolvedValueOnce({ id: 7, empresa_id: 1, funcionario_id: 9 })
    .mockResolvedValueOnce({
      id: 11,
      nome: 'Template Base',
      empresa_id: 1,
      ativo: 1,
      template_json: '<div>{{funcionario_nome}}</div>',
      deleted_at: null,
    })
    .mockResolvedValueOnce({
      id: 11,
      nome: 'Template Base',
      empresa_id: 1,
      ativo: 1,
      template_json: '<div>{{funcionario_nome}}</div>',
    });

  return {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      first,
    })),
  } as unknown as D1Database;
}

describe('qualificacoes certificados admin debug guards', () => {
  it('falha fechado sem ENABLE_ADMIN_DEBUG_ROUTES', async () => {
    const response = await routes.request(
      '/debug/template/7',
      { method: 'GET' },
      { DB: createDb() } as unknown as Env,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Admin debug endpoints are disabled'),
    });
  });

  it('permite debug controlado somente com flag explícita', async () => {
    const response = await routes.request(
      '/debug/template/7',
      { method: 'GET' },
      {
        DB: createDb(),
        ENABLE_ADMIN_DEBUG_ROUTES: 'true',
        CF_ACCOUNT_ID: 'acct',
        CF_BROWSER_API_TOKEN: 'token',
      } as unknown as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        qualificacao_id: 7,
        empresa_id: 1,
      },
    });
  });
});
