import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 'mock-user-id');
    c.set('userRole', 'admin');
    c.set('empresaId', 123);
    c.set('tenantContext', { empresaId: 123, role: 'admin' });
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

import modelosApp from '../../routes/simuladores-modelos';
import type { Env } from '../../types';

describe('Simuladores Modelos N+1 Characterization', () => {
  let app: Hono<{ Bindings: Env }>;
  let prepareSpy: any;

  beforeEach(() => {
    app = new Hono<{ Bindings: Env }>();

    prepareSpy = vi.fn().mockImplementation((query: string) => {
      const q = query.toUpperCase();
      const mockResult = {
        first: async () => {
          if (q.includes('FROM TIPOS_SESSAO')) return { id: 1 };
          if (q.includes('FROM MODELOS_SESSAO')) return { id: 1, codigo: 'MOD', nome: 'Modelo' };
          if (q.includes('FROM MANOBRAS')) return { id: 2, codigo: 'MAN', nome: 'Manobra' };
          if (q.includes('FROM MODELOS_SESSAO_MANOBRAS')) return null;
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => ({ meta: { last_row_id: 10 } }),
        bind: () => mockResult,
      };
      return mockResult;
    });

    app.use('*', async (c, next) => {
      c.set('tenantContext', { empresaId: 123, role: 'admin' });
      c.env = { DB: { prepare: prepareSpy } as any } as Env;
      await next();
    });

    app.route('/modelos', modelosApp);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('characterizes query count for IMPORTAR RELACOES', async () => {
    const dados = Array.from({ length: 50 }).map((_, i) => ({
      modelo_codigo: `MOD${i}`,
      manobra_codigo: `MAN${i}`,
      ordem: i + 1,
    }));

    const res = await app.request('/modelos/modelos-sessao/importar-relacoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dados, auto_criar: false }),
    });

    const body = await res.json();
    expect(res.status).toBe(207);
    expect(body.sucesso).toBe(false);

    const callCount = prepareSpy.mock.calls.length;
    console.log(`[Importar Relacoes N+1] 50 linhas -> ${callCount} chamadas prepare`);
    // Before fix: 1 (normalize) + 1 (tipo sessao) + 50*3 = ~152 calls
    // After fix: should be O(1) calls (e.g. 5-10 calls total using IN (...))
  });
});
