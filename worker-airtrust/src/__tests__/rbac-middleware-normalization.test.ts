import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../middleware/error-handler';
import { requireRole } from '../middleware/rbac';

type TestEnv = {
  Bindings: {
    DB?: D1Database;
    ENVIRONMENT?: string;
    ENABLE_DEV_AUTH_BYPASS?: string;
    ENABLE_ADMIN_DEBUG_ROUTES?: string;
  };
  Variables: {
    userRole?: string;
    empresaId?: number;
  };
};

function buildApp(requiredRole: 'admin' | 'manager') {
  const app = new Hono<TestEnv>();
  app.onError(errorHandler);

  app.use('*', async (c, next) => {
    const roleHeader = c.req.header('x-role');
    if (roleHeader) c.set('userRole', roleHeader);
    await next();
  });

  app.get('/protected', requireRole(requiredRole), (c) => c.json({ success: true }, 200));

  return app;
}

function buildTenantBoundedApp() {
  const app = new Hono<TestEnv>();
  app.onError(errorHandler);

  app.use('*', async (c, next) => {
    const roleHeader = c.req.header('x-role');
    const empresaHeader = c.req.header('x-empresa-id');
    if (roleHeader) c.set('userRole', roleHeader);
    if (empresaHeader) c.set('empresaId', Number(empresaHeader));
    await next();
  });

  app.all('/api/certificados/admin/*', requireRole('admin'), (c) => c.json({ success: true }, 200));
  app.post('/api/matriz-treinamento/registros', requireRole('admin', 'manager'), async (c) =>
    c.json({ success: true, body: await c.req.json() }, 200),
  );
  app.post('/api/matriz-treinamento/registros/bulk', requireRole('admin', 'manager'), async (c) =>
    c.json({ success: true, body: await c.req.json() }, 200),
  );

  return app;
}

function buildQualificationTypesDb(validIds: Array<number | string>): D1Database {
  const validIdSet = new Set(validIds.map((id) => String(id)));
  return {
    prepare: () => ({
      bind: (...bindings: unknown[]) => ({
        first: async () => {
          const requestedIds = bindings.slice(1).map(String);
          return {
            total: requestedIds.filter((id) => validIdSet.has(id)).length,
          };
        },
      }),
    }),
  } as unknown as D1Database;
}

async function hit(app: Hono<TestEnv>, role?: string): Promise<Response> {
  const headers = role ? { 'x-role': role } : undefined;
  return app.request(
    '/protected',
    { method: 'GET', headers },
    { ENVIRONMENT: 'test', ENABLE_DEV_AUTH_BYPASS: 'false' },
  );
}

async function hitCertificateAdmin(path: string, empresaId = 6): Promise<Response> {
  return buildTenantBoundedApp().request(
    path,
    {
      method:
        path.includes('/copiar-template/') || path.includes('/ativar-template/') ? 'POST' : 'GET',
      headers: {
        'x-role': 'ADMIN',
        'x-empresa-id': String(empresaId),
      },
    },
    {
      ENVIRONMENT: 'test',
      ENABLE_DEV_AUTH_BYPASS: 'false',
    },
  );
}

async function hitMatrix(
  path: '/api/matriz-treinamento/registros' | '/api/matriz-treinamento/registros/bulk',
  body: Record<string, unknown>,
  validIds: Array<number | string>,
): Promise<Response> {
  return buildTenantBoundedApp().request(
    path,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-role': 'GESTOR',
        'x-empresa-id': '6',
      },
      body: JSON.stringify(body),
    },
    {
      DB: buildQualificationTypesDb(validIds),
      ENVIRONMENT: 'test',
      ENABLE_DEV_AUTH_BYPASS: 'false',
    },
  );
}

describe('RBAC middleware role normalization', () => {
  it('accepts GESTOR for requireRole(manager)', async () => {
    const response = await hit(buildApp('manager'), 'GESTOR');
    expect(response.status).toBe(200);
  });

  it('accepts manager for requireRole(manager)', async () => {
    const response = await hit(buildApp('manager'), 'manager');
    expect(response.status).toBe(200);
  });

  it('blocks USUARIO for requireRole(manager)', async () => {
    const response = await hit(buildApp('manager'), 'USUARIO');
    expect(response.status).toBe(403);

    const payload = (await response.json()) as { code?: string };
    expect(payload.code).toBe('RBAC_FORBIDDEN');
  });

  it('blocks GESTOR for requireRole(admin)', async () => {
    const response = await hit(buildApp('admin'), 'GESTOR');
    expect(response.status).toBe(403);

    const payload = (await response.json()) as { code?: string };
    expect(payload.code).toBe('RBAC_FORBIDDEN');
  });

  it('accepts ADMIN for requireRole(admin)', async () => {
    const response = await hit(buildApp('admin'), 'ADMIN');
    expect(response.status).toBe(200);
  });

  it('accepts admin for requireRole(admin)', async () => {
    const response = await hit(buildApp('admin'), 'admin');
    expect(response.status).toBe(200);
  });

  it('blocks unknown role for requireRole(manager)', async () => {
    const response = await hit(buildApp('manager'), 'SUPERVISOR');
    expect(response.status).toBe(403);

    const payload = (await response.json()) as { code?: string };
    expect(payload.code).toBe('RBAC_FORBIDDEN');
  });

  it('blocks missing role for requireRole(manager)', async () => {
    const response = await hit(buildApp('manager'));
    expect(response.status).toBe(403);

    const payload = (await response.json()) as { code?: string };
    expect(payload.code).toBe('NOT_AUTHENTICATED');
  });

  it('blocks INSTRUTOR for requireRole(manager)', async () => {
    const response = await hit(buildApp('manager'), 'INSTRUTOR');
    expect(response.status).toBe(403);

    const payload = (await response.json()) as { code?: string };
    expect(payload.code).toBe('RBAC_FORBIDDEN');
  });
});

describe('certificate admin tenant boundary', () => {
  it('allows listing templates only for the authenticated tenant', async () => {
    const ownTenant = await hitCertificateAdmin('/api/certificados/admin/templates/6');
    expect(ownTenant.status).toBe(200);

    const foreignTenant = await hitCertificateAdmin('/api/certificados/admin/templates/7');
    expect(foreignTenant.status).toBe(403);
    const payload = (await foreignTenant.json()) as { code?: string };
    expect(payload.code).toBe('TENANT_SCOPE_FORBIDDEN');
  });

  it('blocks activating a template for another tenant', async () => {
    const response = await hitCertificateAdmin('/api/certificados/admin/ativar-template/7/99');
    expect(response.status).toBe(403);
  });

  it('blocks cross-tenant template copy', async () => {
    const response = await hitCertificateAdmin('/api/certificados/admin/copiar-template/6/7');
    expect(response.status).toBe(403);
  });

  it('blocks global company enumeration for tenant admins', async () => {
    const response = await hitCertificateAdmin('/api/certificados/admin/empresas-com-templates');
    expect(response.status).toBe(403);
  });
});

describe('training matrix tenant boundary', () => {
  it('allows a qualification type from the authenticated tenant and preserves the request body', async () => {
    const response = await hitMatrix(
      '/api/matriz-treinamento/registros',
      { funcao_id: 10, qualificacao_tipo_id: 101 },
      [101],
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success?: boolean;
      body?: { qualificacao_tipo_id?: number };
    };
    expect(payload.success).toBe(true);
    expect(payload.body?.qualificacao_tipo_id).toBe(101);
  });

  it('allows a textual qualification type ID from the authenticated tenant', async () => {
    const response = await hitMatrix(
      '/api/matriz-treinamento/registros',
      { funcao_id: 10, qualificacao_tipo_id: 'tipo-aw139' },
      ['tipo-aw139'],
    );
    expect(response.status).toBe(200);
  });

  it('blocks a qualification type from another tenant', async () => {
    const response = await hitMatrix(
      '/api/matriz-treinamento/registros',
      { funcao_id: 10, qualificacao_tipo_id: 999 },
      [101],
    );
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { code?: string };
    expect(payload.code).toBe('TENANT_SCOPE_FORBIDDEN');
  });

  it('blocks a bulk payload containing any foreign qualification type', async () => {
    const response = await hitMatrix(
      '/api/matriz-treinamento/registros/bulk',
      { funcao_id: 10, qualificacao_tipo_ids: [101, 'foreign-type'] },
      [101],
    );
    expect(response.status).toBe(403);
  });

  it('rejects a boolean qualification type ID before the legacy handler', async () => {
    const response = await hitMatrix(
      '/api/matriz-treinamento/registros',
      { funcao_id: 10, qualificacao_tipo_id: true },
      [1],
    );
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { code?: string };
    expect(payload.code).toBe('INVALID_QUALIFICATION_TYPE_ID');
  });

  it('rejects a boolean qualification type hidden in a bulk payload', async () => {
    const response = await hitMatrix(
      '/api/matriz-treinamento/registros/bulk',
      { funcao_id: 10, qualificacao_tipo_ids: [101, true] },
      [101, 1],
    );
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { code?: string };
    expect(payload.code).toBe('INVALID_QUALIFICATION_TYPE_ID');
  });
});
