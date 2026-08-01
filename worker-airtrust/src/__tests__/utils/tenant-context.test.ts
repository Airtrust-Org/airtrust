import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedRequestEnv } from '../../utils/tenant-context';
import { getEmpresaIdSafe, getUserIdSafe } from '../../utils/tenant-context';

function createContextProbe(values: { empresaId?: number; userId?: number }) {
  const app = new Hono<AuthenticatedRequestEnv>();
  app.get('/', (c) => {
    if (values.empresaId !== undefined) c.set('empresaId', values.empresaId);
    if (values.userId !== undefined) c.set('userId', values.userId);
    return c.json({ empresaId: getEmpresaIdSafe(c), userId: getUserIdSafe(c) });
  });
  return app.request('http://localhost/');
}

describe('tenant context accessors', () => {
  it('returns positive integer identifiers', async () => {
    const response = await createContextProbe({ empresaId: 6, userId: 42 });
    await expect(response.json()).resolves.toEqual({ empresaId: 6, userId: 42 });
  });

  it.each([
    { empresaId: 0, userId: 0 },
    { empresaId: -1, userId: -2 },
    { empresaId: 1.5, userId: 2.5 },
  ])('fails closed for invalid identifiers: %o', async (values) => {
    const response = await createContextProbe(values);
    await expect(response.json()).resolves.toEqual({ empresaId: null, userId: null });
  });

  it('fails closed when middleware did not provide identifiers', async () => {
    const response = await createContextProbe({});
    await expect(response.json()).resolves.toEqual({ empresaId: null, userId: null });
  });
});
