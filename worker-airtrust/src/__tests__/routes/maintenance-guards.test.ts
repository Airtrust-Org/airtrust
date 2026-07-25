import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../lib/frms/fortnight-coverage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/frms/fortnight-coverage')>();
  return {
    ...actual,
    getFrmsFortnightCoverage: vi.fn().mockResolvedValue({ total: 0, items: [] }),
  };
});

vi.mock('../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/auth')>();
  return {
    ...actual,
    auth: () => async (c: any, next: () => Promise<void>) => {
      if (!c.req.header('authorization')) {
        return c.json(
          { success: false, error: 'Token de autenticação não fornecido', code: 'MISSING_TOKEN' },
          401,
        );
      }
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

vi.mock('../../middleware/maintenance-access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/maintenance-access')>();
  return {
    ...actual,
    requireMaintenanceCapability: () => async (_c: any, next: () => Promise<void>) => {
      await next();
    },
    recordMaintenanceAudit: vi.fn().mockResolvedValue(undefined),
    assertNoImpersonation: vi.fn().mockResolvedValue(null),
  };
});

import * as coverage from '../../lib/frms/fortnight-coverage';
import { app } from '../../index';
import frmsRoutes from '../../routes/frms';
import { sigvoosRouter } from '../../routes/integracoes_sigvoos';

function createDb() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    })),
  } as unknown as D1Database;
}

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: createDb(),
    ENVIRONMENT: 'staging',
    APP_VERSION: 'test-maintenance',
    ...overrides,
  } as unknown as Env;
}

const coveragePath = '/maintenance/fortnight-coverage?empresa_id=10&data_inicio=2026-06-01&data_fim=2026-06-07';
const appCoveragePath = `/api/frms${coveragePath}`;

beforeEach(() => {
  vi.mocked(coverage.getFrmsFortnightCoverage).mockClear();
});

describe('authenticated maintenance policy', () => {
  it('exige JWT tanto no router direto quanto no app completo', async () => {
    const [routerResponse, appResponse] = await Promise.all([
      frmsRoutes.request(`http://example.test${coveragePath}`, {}, createEnv()),
      app.request(`http://remote.example${appCoveragePath}`, { method: 'POST', body: '{not-json' }, createEnv()),
    ]);

    expect(routerResponse.status).toBe(401);
    expect(appResponse.status).toBe(401);
    expect(coverage.getFrmsFortnightCoverage).not.toHaveBeenCalled();
  });

  it('não depende de localhost, host ou headers secretos estáticos', async () => {
    const response = await frmsRoutes.request(
      `http://localhost${coveragePath}`,
      {
        headers: {
          authorization: 'Bearer synthetic',
          host: 'localhost',
          'x-forwarded-host': 'localhost',
          origin: 'http://localhost',
          'x-maintenance-secret': 'obsolete-secret',
        },
      },
      createEnv({ ENABLE_DEV_AUTH_BYPASS: 'true' }),
    );

    expect(response.status).toBe(200);
    expect(coverage.getFrmsFortnightCoverage).toHaveBeenCalled();
  });

  it('mantém mutation endpoints HTTP de maintenance indisponíveis após autenticação', async () => {
    const env = createEnv();
    const [apply, reprocess, sync] = await Promise.all([
      frmsRoutes.request('http://example.test/maintenance/fortnight-materialization-apply', { method: 'POST', headers: { authorization: 'Bearer synthetic' }, body: '{not-json' }, env),
      frmsRoutes.request('http://example.test/maintenance/reprocessar-lote', { method: 'POST', headers: { authorization: 'Bearer synthetic' }, body: '{not-json' }, env),
      sigvoosRouter.request('http://example.test/maintenance/sincronizar-frms', { method: 'POST', headers: { authorization: 'Bearer synthetic' }, body: '{not-json' }, env),
    ]);

    expect([apply.status, reprocess.status, sync.status]).toEqual([404, 404, 404]);
  });
});
