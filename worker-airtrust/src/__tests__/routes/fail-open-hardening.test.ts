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
        c.set('tenantContext', {
          empresaId,
          empresaCodigo: `emp-${empresaId}`,
          empresaNome: `Empresa ${empresaId}`,
          role: 'manager',
          plano: 'PRO',
          permissions: ['read', 'write'],
        });
        await next();
      },
    getTenantContext: (c: any) => c.get('tenantContext'),
    getEmpresaId: (c: any) => Number(c.get('empresaId') ?? 0),
  };
});

import { app } from '../../index';

function createMatrizDb(mode: 'ok' | 'fail'): D1Database {
  return {
    prepare: vi.fn((query: string) => {
      if (mode === 'fail') {
        throw new Error('db failure');
      }

      const normalized = query.replace(/\s+/g, ' ').trim();

      if (normalized.startsWith('CREATE TABLE IF NOT EXISTS matriz_treinamento_funcao')) {
        return { run: async () => ({ success: true }) };
      }

      if (normalized.startsWith('CREATE INDEX IF NOT EXISTS idx_matriz_treinamento_empresa_funcao')) {
        return { run: async () => ({ success: true }) };
      }

      if (normalized.startsWith('CREATE INDEX IF NOT EXISTS idx_matriz_treinamento_empresa_tipo')) {
        return { run: async () => ({ success: true }) };
      }

      if (normalized.startsWith('CREATE UNIQUE INDEX IF NOT EXISTS idx_matriz_treinamento_unique_ativo')) {
        return { run: async () => ({ success: true }) };
      }

      if (normalized.includes("PRAGMA table_info('funcionarios')")) {
        return {
          all: async () => ({ results: [{ name: 'id' }, { name: 'nome' }, { name: 'funcao_id' }] }),
        };
      }

      if (normalized.includes('FROM funcionarios') && normalized.includes('WHERE id = ? AND empresa_id = ?')) {
        return {
          bind: () => ({
            first: async () => ({
              id: 10,
              nome: 'Tripulante A',
              funcao_id: null,
              funcao: null,
            }),
          }),
        };
      }

      throw new Error(`Unhandled query in test: ${normalized}`);
    }),
  } as unknown as D1Database;
}

describe('fail-open hardening', () => {
  it('mantém sucesso no fluxo válido de requisitos da matriz', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/matriz-treinamento/requisitos/10', { method: 'GET' }),
      { DB: createMatrizDb('ok') } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: [],
      meta: expect.objectContaining({
        funcionario_nome: 'Tripulante A',
      }),
    });
  });

  it('retorna erro explícito quando requisitos da matriz falham internamente', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/matriz-treinamento/requisitos/10', { method: 'GET' }),
      { DB: createMatrizDb('fail') } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'MATRIZ_TREINAMENTO_FAILED',
      message: 'Erro interno ao carregar requisitos da matriz de treinamento',
    });
  });

  it('retorna indisponibilidade explícita para endpoint legado /api/templates', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/templates', { method: 'GET' }),
      { DB: createMatrizDb('ok') } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(503);
    const payload = (await response.json()) as {
      success: boolean;
      error?: string;
      message?: string;
      data?: unknown;
    };
    expect(payload).toMatchObject({
      success: false,
      error: 'TEMPLATES_ENDPOINT_UNAVAILABLE',
    });
    expect(payload.success).not.toBe(true);
    expect(payload.data).toBeUndefined();
  });
});
