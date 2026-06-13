import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../middleware/error-handler';
import { requireRole } from '../middleware/rbac';

type TestEnv = {
  Bindings: {
    ENVIRONMENT?: string;
    ENABLE_DEV_AUTH_BYPASS?: string;
  };
  Variables: {
    userRole?: string;
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

async function hit(app: Hono<TestEnv>, role?: string): Promise<Response> {
  const headers = role ? { 'x-role': role } : undefined;
  return app.request(
    '/protected',
    { method: 'GET', headers },
    { ENVIRONMENT: 'test', ENABLE_DEV_AUTH_BYPASS: 'false' },
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
