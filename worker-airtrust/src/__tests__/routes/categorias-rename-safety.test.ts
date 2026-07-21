import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('empresaId', Number(c.req.header('x-test-empresa-id')));
    c.set('userRole', 'admin');
    await next();
  },
}));
vi.mock('../../middleware/tenant', () => ({ getEmpresaId: (c: any) => c.get('empresaId') }));
vi.mock('../../middleware/rbac', () => ({ requireRole: () => async (_c: any, next: () => Promise<void>) => next() }));
vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn(),
  extrairUsuarioAuditoria: vi.fn(() => ({})),
}));

import categoriasRoutes from '../../routes/categorias';

type Usage = 'canonical' | 'legacy' | 'none';

function createApp(usage: Usage, expectedEmpresaId = 7) {
  const calls: Array<{ query: string; args: unknown[] }> = [];
  const db = {
    prepare(query: string) {
      return {
        bind(...args: unknown[]) {
          calls.push({ query, args });
          return {
            first: async () => {
              if (query.includes('SELECT * FROM qualificacoes_categorias')) {
                return args[1] === expectedEmpresaId ? { id: 3, empresa_id: expectedEmpresaId, nome: 'Atual' } : null;
              }
              if (query.includes('id <> ?')) return null;
              if (query.includes('FROM qualificacoes_tipos')) {
                if (usage === 'canonical') return { id: 88 };
                if (usage === 'legacy') return { id: 89 };
                return null;
              }
              return null;
            },
            run: async () => ({ meta: { changes: 1 } }),
          };
        },
      };
    },
  };
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/categorias', categoriasRoutes);
  return { app, calls, db };
}

describe('qualification category rename safety', () => {
  it.each(['canonical', 'legacy'] as const)('blocks %s active bindings with a tenant-scoped 409', async (usage) => {
    const { app, calls, db } = createApp(usage);
    const response = await app.request('/api/categorias/3', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-test-empresa-id': '7' },
      body: JSON.stringify({ nome: 'Novo' }),
    }, { DB: db } as Env);

    expect(response.status).toBe(409);
    expect(calls.find((call) => call.query.includes('FROM qualificacoes_tipos'))?.args).toEqual([7, 3, 'Atual']);
  });

  it('allows renaming a category with no active types', async () => {
    const { app, db } = createApp('none');
    const response = await app.request('/api/categorias/3', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-test-empresa-id': '7' },
      body: JSON.stringify({ nome: 'Novo' }),
    }, { DB: db } as Env);

    expect(response.status).toBe(200);
  });

  it('does not inspect or update a category from another tenant', async () => {
    const { app, calls, db } = createApp('none', 7);
    const response = await app.request('/api/categorias/3', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-test-empresa-id': '8' },
      body: JSON.stringify({ nome: 'Novo' }),
    }, { DB: db } as Env);

    expect(response.status).toBe(404);
    expect(calls.some((call) => call.query.includes('FROM qualificacoes_tipos'))).toBe(false);
  });
});
