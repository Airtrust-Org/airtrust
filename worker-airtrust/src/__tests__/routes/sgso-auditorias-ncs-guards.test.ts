import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

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

    c.set('userId', 55);
    c.set('userRole', String(c.env?.__mockRole || 'manager'));

    if (authMode !== 'no-tenant') {
      c.set('tenantContext', {
        empresaId: Number(c.env?.__mockEmpresaId ?? 77),
        empresaCodigo: 'acme',
        empresaNome: 'Acme Air',
        role: 'manager',
        plano: 'pro',
        permissions: ['read', 'write'],
      });
    }

    await next();
  },
}));

import sgsoRoutes from '../../routes/sgso';

type MockOpts = {
  failNcInsert?: boolean;
};

function createMockDb(opts: MockOpts = {}) {
  const calls: Array<{ query: string; args: unknown[] }> = [];

  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => {
        calls.push({ query, args });

        if (query.includes('SELECT COUNT(*) as n FROM sgso_auditorias')) {
          return {
            first: async (): Promise<{ n: number }> => ({ n: 1 }),
          };
        }

        if (query.includes('FROM sgso_auditorias a') && query.includes('ORDER BY a.data_programada DESC')) {
          return {
            all: async () => ({
              results: [
                {
                  id: 'aud-1',
                  titulo: 'Auditoria interna',
                  status: 'PROGRAMADA',
                },
              ],
            }),
          };
        }

        if (query.includes('INSERT INTO sgso_auditorias')) {
          return {
            run: async () => ({ meta: { last_row_id: 1 } }),
          };
        }

        if (query.includes('INSERT INTO sgso_nao_conformidades')) {
          if (opts.failNcInsert) {
            return {
              run: async () => {
                throw new Error('db write failure');
              },
            };
          }
          return {
            run: async () => ({ meta: { last_row_id: 42 } }),
          };
        }

        return {
          first: async (): Promise<null> => null,
          all: async () => ({ results: [] }),
          run: async () => ({ meta: { last_row_id: 0 } }),
        };
      },
    })),
  } as unknown as D1Database;

  return { db, calls };
}

function createSgsoApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/sgso', sgsoRoutes);
  return app;
}

describe('sgso auditorias/nc guards', () => {
  it('retorna 401 sem auth em escrita SGSO', async () => {
    const app = createSgsoApp();
    const { db } = createMockDb();

    const response = await app.request(
      '/sgso/auditorias',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'INTERNA', titulo: 'Auditoria mensal' }),
      },
      { DB: db, __authMode: 'missing' } as unknown as Env,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'AUTH_REQUIRED',
    });
  });

  it('falha fechado sem tenantContext em escrita SGSO', async () => {
    const app = createSgsoApp();
    const { db } = createMockDb();

    const response = await app.request(
      '/sgso/auditorias',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'INTERNA', titulo: 'Auditoria mensal' }),
      },
      { DB: db, __authMode: 'no-tenant' } as unknown as Env,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'SGSO_AUDITORIA_CREATE_ERROR',
    });
  });

  it('cria auditoria válida e propaga empresa_id do tenant no bind', async () => {
    const app = createSgsoApp();
    const { db, calls } = createMockDb();

    const response = await app.request(
      '/sgso/auditorias',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'INTERNA', titulo: 'Auditoria mensal' }),
      },
      { DB: db, __authMode: 'ok', __mockEmpresaId: 77 } as unknown as Env,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { id: expect.any(String) },
    });

    const insertCall = calls.find((c) => c.query.includes('INSERT INTO sgso_auditorias'));
    expect(insertCall).toBeTruthy();
    // bind(id, empresaId, ...)
    expect(insertCall?.args[1]).toBe(77);
  });

  it('lista auditorias filtrando por empresa_id do tenant', async () => {
    const app = createSgsoApp();
    const { db, calls } = createMockDb();

    const response = await app.request(
      '/sgso/auditorias?page=1&limit=20',
      { method: 'GET' },
      { DB: db, __authMode: 'ok', __mockEmpresaId: 77 } as unknown as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      pagination: { page: 1, limit: 20, total: 1 },
    });

    const countCall = calls.find((c) => c.query.includes('SELECT COUNT(*) as n FROM sgso_auditorias'));
    expect(countCall).toBeTruthy();
    expect(countCall?.args[0]).toBe(77);
  });

  it('retorna 400 para payload inválido em criação de NC', async () => {
    const app = createSgsoApp();
    const { db } = createMockDb();

    const response = await app.request(
      '/sgso/nao-conformidades',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'INVALID', descricao: 'abc' }),
      },
      { DB: db, __authMode: 'ok' } as unknown as Env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Dados inválidos',
    });
  });

  it('retorna erro explícito sem sucesso silencioso quando DB falha na NC', async () => {
    const app = createSgsoApp();
    const { db } = createMockDb({ failNcInsert: true });

    const response = await app.request(
      '/sgso/nao-conformidades',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'MINOR', descricao: 'Nao conformidade detectada' }),
      },
      { DB: db, __authMode: 'ok' } as unknown as Env,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'SGSO_NC_CREATE_ERROR',
    });
  });
});
