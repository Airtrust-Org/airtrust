import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../middleware/error-handler';
import { requireRole } from '../../middleware/rbac';
import type { Env } from '../../types';

describe('SCORM direct replacement administrator role boundary', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/routes/lms-cursos-upload-routes.ts'), 'utf8');

  it.each([
    "/:id/scorm-replace",
    "/:id/scorm-package-versions/:packageId/replace-direct",
  ])('registers an explicit admin guard BEFORE configurable edit permissions on %s', (path) => {
    const location = source.indexOf("app.post('" + path + "'");
    expect(location).toBeGreaterThan(0);
    const route = source.slice(location, location + 220);
    expect(route).toMatch(/requireRole\('admin'\),\s*requirePermission\('lms', 'editar', 'admin'\)/);
    expect(route).toContain("requireOperacoesCurso('update')");
  });

  it('rejects a GESTOR with an explicit editing grant before the replacement handler can run', async () => {
    const app = new Hono<{ Bindings: Env; Variables: { userRole: string } }>();
    app.onError(errorHandler);
    app.use('*', async (c, next) => {
      c.set('userRole', 'GESTOR');
      await next();
    });
    app.post('/replace', requireRole('admin'), (c) => c.json({ replaced: true }));
    const response = await app.request('/replace', {
      method: 'POST',
      headers: { 'x-test-grant': 'lms.editar' },
    }, { ENVIRONMENT: 'test', ENABLE_DEV_AUTH_BYPASS: 'false' } as unknown as Env);
    expect(response.status).toBe(403);
    const payload = await response.json() as { code?: string };
    expect(payload.code).toBe('RBAC_FORBIDDEN');
  });
});
