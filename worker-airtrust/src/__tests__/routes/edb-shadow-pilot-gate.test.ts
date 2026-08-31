import { Hono, type Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../middleware/error-handler';
import type { Env, Variables } from '../../types';

type TestContext = Context<{ Bindings: Env; Variables: Variables }>;

const { loadPreviewMock } = vi.hoisted(() => ({ loadPreviewMock: vi.fn() }));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: TestContext, next: () => Promise<void>) => {
    if (!c.req.header('Authorization')) {
      return c.json({ success: false, error: 'Token de autenticacao nao fornecido' }, 401);
    }
    const tenantId = Number(c.req.header('x-test-empresa-id') || 6);
    const role = String(c.req.header('x-test-role') || 'manager').toLowerCase();
    c.set('userId', 10);
    c.set('empresaId', tenantId);
    c.set('userRole', role);
    c.set('tenantContext', {
      empresaId: tenantId,
      empresaCodigo: `empresa-${tenantId}`,
      empresaNome: `Empresa ${tenantId}`,
      role,
      plano: 'pro',
      permissions: ['read'],
    });
    await next();
  },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  const hierarchy: Record<string, number> = { admin: 100, manager: 80, viewer: 10 };
  return {
    ...actual,
    getEmpresaId: (c: TestContext) => Number(c.get('tenantContext')?.empresaId || 0),
    checkPermission: (c: TestContext, minimumRole: string) => {
      const role = String(c.get('tenantContext')?.role || 'viewer');
      return (hierarchy[role] || 0) >= (hierarchy[minimumRole] || 0);
    },
  };
});

vi.mock('../../services/edb/control-flight-shadow-preview', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/edb/control-flight-shadow-preview')>();
  return { ...actual, loadEdbShadowPreview: loadPreviewMock };
});

import { auth } from '../../middleware/auth';
import { registerSystemRoutes } from '../../routes/system';

function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  app.use('/api/*', auth());
  registerSystemRoutes(app);
  return app;
}

function headers(tenantId = 6, role = 'manager') {
  return {
    Authorization: 'Bearer synthetic-token',
    'x-test-empresa-id': String(tenantId),
    'x-test-role': role,
  };
}

function env(environment: 'development' | 'staging' | 'production', tenants = '6'): Env {
  return {
    DB: {} as D1Database,
    ENVIRONMENT: environment,
    EDB_SHADOW_PILOT_TENANTS: tenants,
  } as unknown as Env;
}

beforeEach(() => {
  loadPreviewMock.mockReset();
  loadPreviewMock.mockResolvedValue({
    draft: { status: 'INCOMPLETE' },
    findings: [],
    fieldSources: [],
  });
});

describe('eDB shadow pilot route gate', () => {
  it('requires authentication for the tenant capability', async () => {
    const response = await createApp().request('/api/edb/capability', {}, env('staging'));
    expect(response.status).toBe(401);
  });

  it('reports capability only for manager, staging and allowlisted tenant', async () => {
    const enabled = await createApp().request(
      '/api/edb/capability',
      { headers: headers(6, 'manager') },
      env('staging'),
    );
    expect(enabled.status).toBe(200);
    expect(enabled.headers.get('x-airtrust-edb-mode')).toBe('staging-shadow-not-regulatory');
    expect(await enabled.json()).toMatchObject({ success: true, data: { enabled: true } });

    const wrongTenant = await createApp().request(
      '/api/edb/capability',
      { headers: headers(7, 'manager') },
      env('staging'),
    );
    expect(await wrongTenant.json()).toMatchObject({ success: true, data: { enabled: false } });

    const production = await createApp().request(
      '/api/edb/capability',
      { headers: headers(6, 'manager') },
      env('production'),
    );
    expect(await production.json()).toMatchObject({ success: true, data: { enabled: false } });

    const viewer = await createApp().request(
      '/api/edb/capability',
      { headers: headers(6, 'viewer') },
      env('staging'),
    );
    expect(await viewer.json()).toMatchObject({ success: true, data: { enabled: false } });
  });

  it('returns not found before loading data outside the enabled scope', async () => {
    const wrongTenant = await createApp().request(
      '/api/edb/shadow-preview/42',
      { headers: headers(7) },
      env('staging'),
    );
    expect(wrongTenant.status).toBe(404);
    expect(loadPreviewMock).not.toHaveBeenCalled();

    const production = await createApp().request(
      '/api/edb/shadow-preview/42',
      { headers: headers(6) },
      env('production'),
    );
    expect(production.status).toBe(404);
    expect(loadPreviewMock).not.toHaveBeenCalled();
  });

  it('allows the reviewed staging tenant and preserves authenticated tenant scope', async () => {
    const response = await createApp().request(
      '/api/edb/shadow-preview/42',
      { headers: headers(6) },
      env('staging'),
    );
    expect(response.status).toBe(200);
    expect(loadPreviewMock).toHaveBeenCalledWith(expect.anything(), 6, 42);
  });
});
