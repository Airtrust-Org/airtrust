import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 1);
    c.set('userRole', 'manager');
    c.set('empresaId', 1);
    await next();
  },
  optionalAuth: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
  requireRole: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    tenantMiddleware:
      () =>
      async (c: any, next: () => Promise<void>) => {
        c.set('empresaId', 1);
        c.set('tenant', { empresaId: 1, userId: 1, role: 'ADMINISTRADOR' });
        await next();
      },
    getTenantContext: () => ({ empresaId: 1, userId: 1, role: 'ADMINISTRADOR' }),
    getEmpresaId: () => 1,
  };
});

import { app } from '../../index';

function createMockDb(mode: 'ok' | 'fail') {
  const results = [
    {
      id: 10,
      funcionario_id: 101,
      modelo_aeronave_id: 2,
      data_sessao: '2026-06-01',
      tipo: 'SIMULADOR',
      status: 'AGENDADA',
      observacoes: null,
      created_at: '2026-05-01T10:00:00.000Z',
      updated_at: '2026-05-01T10:00:00.000Z',
    },
  ];

  const db = {
    prepare: vi.fn((query: string) => {
      if (mode === 'fail') {
        throw new Error('db unavailable');
      }

      if (query.includes('FROM sessoes') && query.includes('ORDER BY data_sessao DESC')) {
        return {
          bind: (..._args: unknown[]) => ({
            all: async () => ({ results }),
          }),
        };
      }

      if (query.includes('SELECT COUNT(*) as total FROM sessoes')) {
        return {
          first: async () => ({ total: 1 }),
        };
      }

      throw new Error(`Unhandled query in test: ${query}`);
    }),
  } as unknown as D1Database;

  return db;
}

describe('GET /api/sessoes', () => {
  it('retorna success=true e lista quando consulta funciona', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/sessoes?limit=5&offset=0', { method: 'GET' }),
      { DB: createMockDb('ok') } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      total: 1,
      limit: 5,
      offset: 0,
      data: [
        expect.objectContaining({
          id: 10,
          funcionario_id: 101,
        }),
      ],
    });
  });

  it('retorna erro HTTP e success=false quando backend falha', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/sessoes?limit=5&offset=0', { method: 'GET' }),
      { DB: createMockDb('fail') } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(500);

    const payload = (await response.json()) as {
      success: boolean;
      error?: string;
      message?: string;
      data?: unknown;
    };
    expect(payload).toMatchObject({
      success: false,
      error: 'SESSOES_LIST_FAILED',
      message: 'Erro interno ao listar sessões',
    });
    expect(payload.success).not.toBe(true);
    expect(payload.data).toBeUndefined();
  });
});
