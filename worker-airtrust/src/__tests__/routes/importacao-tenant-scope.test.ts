import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    const authMode = String(c.env?.__authMode || 'ok');
    if (authMode === 'missing') {
      return c.json({ success: false, error: 'AUTH_REQUIRED' }, 401);
    }

    c.set('userId', 1);
    c.set('userRole', 'manager');
    c.set('empresaId', authMode === 'no-tenant' ? 0 : Number(c.env?.__mockEmpresaId ?? 1));
    await next();
  },
}));

import importacaoRoutes from '../../routes/importacao';

function createListDb(mode: 'ok' | 'fail') {
  const resultsByTenant: Record<number, Array<Record<string, unknown>>> = {
    1: [{ id: 1, funcionario_cpf: '11111111111', qualificacao_codigo: 'CMA1' }],
    2: [{ id: 2, funcionario_cpf: '22222222222', qualificacao_codigo: 'CMA2' }],
  };

  return {
    prepare: vi.fn((query: string) => {
      if (mode === 'fail') {
        throw new Error('db failure');
      }

      if (query.includes('FROM qualificacoes_historico h') && query.includes('h.empresa_id = ?')) {
        return {
          bind: (empresaId: number) => ({
            all: async () => ({ results: resultsByTenant[empresaId] || [] }),
          }),
        };
      }

      throw new Error(`Unhandled query: ${query}`);
    }),
  } as unknown as D1Database;
}

describe('GET /historico/list (importacao tenant scope)', () => {
  it('retorna apenas dados do tenant autenticado', async () => {
    const response = await importacaoRoutes.fetch(
      new Request('http://localhost/historico/list?limit=10&offset=0', { method: 'GET' }),
      { DB: createListDb('ok'), __mockEmpresaId: 2 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      total: 1,
      data: [expect.objectContaining({ id: 2, funcionario_cpf: '22222222222' })],
    });
  });

  it('falha com 403 sem tenant válido', async () => {
    const response = await importacaoRoutes.fetch(
      new Request('http://localhost/historico/list', { method: 'GET' }),
      { DB: createListDb('ok'), __authMode: 'no-tenant' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'TENANT_CONTEXT_REQUIRED',
    });
  });

  it('retorna erro explícito sem sucesso silencioso quando backend falha', async () => {
    const response = await importacaoRoutes.fetch(
      new Request('http://localhost/historico/list', { method: 'GET' }),
      { DB: createListDb('fail') } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { success: boolean; error?: string };
    expect(payload.success).toBe(false);
    expect(payload.error).toBeTruthy();
  });
});
