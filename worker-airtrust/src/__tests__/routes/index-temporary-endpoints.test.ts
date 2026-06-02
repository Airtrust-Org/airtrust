import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/auth')>();
  return {
    ...actual,
    auth: () => async (c: any, next: () => Promise<void>) => {
      c.set('userId', 101);
      c.set('userEmail', 'admin@tenant.local');
      c.set('userRole', 'admin');
      c.set('empresaId', 10);
      await next();
    },
  };
});

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    tenantMiddleware: () => async (c: any, next: () => Promise<void>) => {
      c.set('empresaId', 10);
      c.set('tenantContext', {
        empresaId: 10,
        empresaCodigo: 'tenant-test',
        empresaNome: 'Tenant Test',
        role: 'admin',
        plano: 'pro',
        permissions: ['*'],
      });
      await next();
    },
  };
});

import { app } from '../../index';

function createHealthyEnv(): Env {
  return {
    ENVIRONMENT: 'test',
    APP_VERSION: 'test-index-temp',
    DB: {
      prepare: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ test: 1 }),
      }),
    } as unknown as D1Database,
  } as Env;
}

describe('index temporary production endpoints', () => {
  it('remove POST /api/fix/populate-qualificacao-ids from production routing', async () => {
    const env = createHealthyEnv();
    const response = await app.request(
      '/api/fix/populate-qualificacao-ids',
      { method: 'POST' },
      env,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'ENDPOINT_NOT_FOUND',
      path: '/api/fix/populate-qualificacao-ids',
      method: 'POST',
    });
  });

  it('não mantém endpoints /api/fix/* ativos no index', async () => {
    const response = await app.request('/api/fix/qualquer-coisa', { method: 'POST' }, createHealthyEnv());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'ENDPOINT_NOT_FOUND',
      path: '/api/fix/qualquer-coisa',
    });
  });

  it('mantém health e version públicos funcionando', async () => {
    const env = createHealthyEnv();

    const health = await app.request('/api/health', {}, env);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      success: true,
      status: 'healthy',
    });

    const version = await app.request('/api/version', {}, env);
    expect(version.status).toBe(200);
    await expect(version.json()).resolves.toMatchObject({
      success: true,
      data: {
        version: 'test-index-temp',
      },
    });
  });

  it('mantém alias principal /api/historico redirecionando sem depender do fix removido', async () => {
    const response = await app.request('/api/historico?limit=1', {}, createHealthyEnv());

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('/api/qualificacoes/historico?limit=1');
  });
});
