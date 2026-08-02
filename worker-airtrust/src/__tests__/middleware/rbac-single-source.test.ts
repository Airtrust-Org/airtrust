import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';
import { requireRole, type UserRole } from '../../middleware/rbac';

const testEnv = { ENVIRONMENT: 'test' } as unknown as Env;

function createApp(role: string, ...allowedRoles: UserRole[]) {
  const app = new Hono<{ Bindings: Env; Variables: { userRole: string } }>();
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    c.set('userRole', role);
    await next();
  });
  app.get('/', requireRole(...allowedRoles), (c) => c.json({ success: true }));
  return app;
}

function sourcePath(relativePath: string): string {
  return decodeURIComponent(new URL(relativePath, import.meta.url).pathname);
}

describe('canonical RBAC middleware', () => {
  // Prevent a future import collision from reintroducing the incompatible auth.ts implementation.
  it('keeps middleware/rbac.ts as the only requireRole export', () => {
    const authSource = readFileSync(sourcePath('../../middleware/auth.ts'), 'utf8');
    const rbacSource = readFileSync(sourcePath('../../middleware/rbac.ts'), 'utf8');

    expect(authSource).not.toContain('export function requireRole');
    expect(rbacSource).toContain('export function requireRole');
  });

  it('normalizes administrator and allows the admin role', async () => {
    const response = await createApp('ADMINISTRADOR', 'admin').request('/', {}, testEnv);

    expect(response.status).toBe(200);
  });

  it('allows manager only when explicitly listed', async () => {
    const response = await createApp('GESTOR', 'admin', 'manager').request('/', {}, testEnv);

    expect(response.status).toBe(200);
  });

  it('rejects roles outside the exact allow-list', async () => {
    const response = await createApp('INSTRUTOR', 'admin', 'manager').request('/', {}, testEnv);

    expect(response.status).toBe(403);
  });
});
