import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    const authMode = String(c.env?.__authMode || 'ok');

    if (authMode === 'missing') {
      return c.json(
        {
          success: false,
          error: 'AUTH_REQUIRED',
          message: 'Token de autenticação não fornecido',
        },
        401,
      );
    }

    c.set('userId', 101);
    c.set('userRole', 'manager');
    c.set('empresaId', authMode === 'no-tenant' ? 0 : 1);
    await next();
  },
}));

vi.mock('../../services/dashboardService', () => ({
  getDashboardMetrics: vi.fn(async () => ({
    tripulantesAtivos: 10,
    qualificacoesAVencer: 2,
    qualificacoesVencidas: 1,
    demandaFutura30Dias: 3,
  })),
  getComplianceScore: vi.fn(async () => ({
    scoreGeral: 90,
    metaOrganizacional: 95,
    qualificacoesValidas: 20,
    totalQualificacoes: 22,
  })),
  getDashboardAlerts: vi.fn(async () => []),
  getAtividadesRecentes: vi.fn(async () => []),
}));

import assistenteRoutes from '../../routes/assistente';

function createMockDb(): D1Database {
  return {
    prepare: vi.fn(() => ({
      bind: () => ({
        first: async () => null,
        all: async () => ({ results: [] }),
      }),
    })),
  } as unknown as D1Database;
}

describe('POST /home-perfil/chat', () => {
  it('retorna 401 quando não autenticado', async () => {
    const response = await assistenteRoutes.fetch(
      new Request('http://localhost/home-perfil/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'oi' }),
      }),
      { DB: createMockDb(), __authMode: 'missing' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'AUTH_REQUIRED',
    });
  });

  it('retorna 403 quando contexto de tenant é inválido', async () => {
    const response = await assistenteRoutes.fetch(
      new Request('http://localhost/home-perfil/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'oi' }),
      }),
      { DB: createMockDb(), __authMode: 'no-tenant' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'TENANT_CONTEXT_REQUIRED',
    });
  });

  it('retorna sucesso quando autenticado com tenant válido', async () => {
    const response = await assistenteRoutes.fetch(
      new Request('http://localhost/home-perfil/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'oi' }),
      }),
      { DB: createMockDb(), __authMode: 'ok' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        provider: expect.any(String),
        model: expect.any(String),
        message: expect.any(String),
      },
    });
  });
});
