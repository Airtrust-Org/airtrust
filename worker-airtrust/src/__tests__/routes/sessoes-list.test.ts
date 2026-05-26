import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    const empresaId = Number(c.env?.__mockEmpresaId ?? 1);
    c.set('userId', 1);
    c.set('userRole', 'manager');
    c.set('empresaId', empresaId);
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
        const empresaId = Number(c.env?.__mockEmpresaId ?? 1);
        c.set('empresaId', empresaId);
        c.set('tenant', { empresaId, userId: 1, role: 'ADMINISTRADOR' });
        await next();
      },
    getTenantContext: (c: any) => ({
      empresaId: Number(c.get('empresaId') ?? 0),
      userId: 1,
      role: 'ADMINISTRADOR',
    }),
    getEmpresaId: (c: any) => Number(c.get('empresaId') ?? 0),
  };
});

import { app } from '../../index';

function createMockDb(mode: 'ok' | 'fail') {
  const resultsByTenant: Record<number, Array<Record<string, unknown>>> = {
    1: [
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
    ],
    2: [
      {
        id: 20,
        funcionario_id: 202,
        modelo_aeronave_id: 4,
        data_sessao: '2026-07-01',
        tipo: 'CHEQUE',
        status: 'CONFIRMADA',
        observacoes: null,
        created_at: '2026-05-01T11:00:00.000Z',
        updated_at: '2026-05-01T11:00:00.000Z',
      },
    ],
  };

  const db = {
    prepare: vi.fn((query: string) => {
      if (mode === 'fail') {
        throw new Error('db unavailable');
      }

      if (
        query.includes('FROM sessoes') &&
        query.includes('ORDER BY data_sessao DESC') &&
        query.includes('empresa_id = ?')
      ) {
        return {
          bind: (empresaId: number) => ({
            all: async () => ({ results: resultsByTenant[empresaId] || [] }),
          }),
        };
      }

      if (
        query.includes('SELECT COUNT(*) as total FROM sessoes') &&
        query.includes('empresa_id = ?')
      ) {
        return {
          bind: (empresaId: number) => ({
            first: async () => ({ total: (resultsByTenant[empresaId] || []).length }),
          }),
        };
      }

      throw new Error(`Unhandled query in test: ${query}`);
    }),
  } as unknown as D1Database;

  return db;
}

describe('GET /api/sessoes', () => {
  it('retorna success=true e lista apenas sessões da empresa autenticada', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/sessoes?limit=5&offset=0', { method: 'GET' }),
      { DB: createMockDb('ok') } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      total: number;
      limit: number;
      offset: number;
      data: Array<{ id: number; funcionario_id: number }>;
    };
    expect(payload).toMatchObject({
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
    expect(payload.data.map((item) => item.id)).not.toContain(20);
  });

  it('não retorna sessões de outra empresa (isolamento tenant)', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/sessoes?limit=5&offset=0', { method: 'GET' }),
      { DB: createMockDb('ok'), __mockEmpresaId: 2 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      total: 1,
      data: [
        expect.objectContaining({
          id: 20,
          funcionario_id: 202,
        }),
      ],
    });
  });

  it('falha em modo fail-closed quando tenant é inválido', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/sessoes?limit=5&offset=0', { method: 'GET' }),
      { DB: createMockDb('ok'), __mockEmpresaId: 0 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'TENANT_CONTEXT_REQUIRED',
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
