import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

type MockContext = {
  req: { header: (name: string) => string | undefined };
  set: (key: string, value: unknown) => void;
  get: (key: string) => unknown;
  json: (body: unknown, status?: number) => Response;
};

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: MockContext, next: () => Promise<void>) => {
    if (!c.req.header('Authorization')) {
      return c.json({ success: false, error: 'Token de autenticação não fornecido' }, 401);
    }
    c.set('userId', 10);
    c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 1));
    c.set('userRole', c.req.header('x-test-role') || 'admin');
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (c: MockContext) => Number(c.get('empresaId')),
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    (...requiredRoles: string[]) =>
    async (c: MockContext, next: () => Promise<void>) => {
      const role = String(c.get('userRole') || '').toLowerCase();
      if (!requiredRoles.map((required) => required.toLowerCase()).includes(role)) {
        return c.json({ success: false, error: 'Permissão negada' }, 403);
      }
      await next();
    },
}));

import formatosRouter from '../../routes/qualificacoes/formatos';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/qualificacoes/formatos', formatosRouter);
  return app;
}

function authenticatedRequest(path: string, role = 'admin', empresaId = 1, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer test-token');
  headers.set('x-test-role', role);
  headers.set('x-test-empresa-id', String(empresaId));
  return createApp().request(path, { ...init, headers }, {} as Env);
}

async function expectRetired(response: Response) {
  expect(response.status).toBe(410);
  const body = (await response.json()) as {
    success: boolean;
    error: string;
    code: string;
  };
  expect(body).toEqual({
    success: false,
    error: 'Formato de qualificação foi aposentado; use categoria_id',
    code: 'QUALIFICATION_FORMAT_REMOVED',
  });
}

describe('qualificacoes formatos — retired API contract', () => {
  it('rejects unauthenticated reads before exposing the retirement response', async () => {
    const response = await createApp().request('/api/qualificacoes/formatos', {}, {} as Env);
    expect(response.status).toBe(401);
  });

  it.each(['admin', 'manager', 'viewer'])(
    'returns 410 to authenticated %s on collection reads',
    async (role) => {
      await expectRetired(await authenticatedRequest('/api/qualificacoes/formatos', role, 1));
    },
  );

  it('returns 410 on authenticated item reads', async () => {
    await expectRetired(await authenticatedRequest('/api/qualificacoes/formatos/99', 'viewer', 2));
  });

  it.each([
    ['POST', '/api/qualificacoes/formatos'],
    ['PUT', '/api/qualificacoes/formatos/1'],
    ['DELETE', '/api/qualificacoes/formatos/1'],
  ] as const)('returns 410 to admin on retired %s mutations', async (method, path) => {
    await expectRetired(
      await authenticatedRequest(path, 'admin', 1, {
        method,
        headers: method === 'DELETE' ? undefined : { 'Content-Type': 'application/json' },
        body: method === 'DELETE' ? undefined : JSON.stringify({ nome: 'Não deve persistir' }),
      }),
    );
  });

  it.each([
    ['POST', '/api/qualificacoes/formatos'],
    ['PUT', '/api/qualificacoes/formatos/1'],
    ['DELETE', '/api/qualificacoes/formatos/1'],
  ] as const)('keeps admin RBAC ahead of retirement for %s', async (method, path) => {
    const response = await authenticatedRequest(path, 'viewer', 1, {
      method,
      headers: method === 'DELETE' ? undefined : { 'Content-Type': 'application/json' },
      body: method === 'DELETE' ? undefined : JSON.stringify({ nome: 'Não autorizado' }),
    });
    expect(response.status).toBe(403);
  });

  it('returns the same retired contract for another tenant without touching a formato store', async () => {
    await expectRetired(await authenticatedRequest('/api/qualificacoes/formatos', 'admin', 77));
  });
});
