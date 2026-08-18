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

    c.set('userId', 99);
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
  failRelprevList?: boolean;
};

function createMockDb(opts: MockOpts = {}) {
  const calls: Array<{ query: string; args: unknown[] }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => {
        calls.push({ query, args });

        if (
          query.includes('FROM sgso_relatos r') &&
          query.includes('JOIN sgso_relato_capturas rc ON rc.relato_id = r.id') &&
          query.includes('ORDER BY r.created_at DESC')
        ) {
          if (opts.failRelprevList) {
            return {
              all: async () => {
                throw new Error('db list failure');
              },
            };
          }

          return {
            all: async () => ({
              results: [
                {
                  id: 'relato-a',
                  numero_protocolo: 'REL-2026-0001',
                  tipo: 'INCIDENTE',
                  status: 'ABERTO',
                },
              ],
            }),
          };
        }

        if (
          query.includes(
            'SELECT id, numero_protocolo, tipo, status, created_at, tipo_investigacao FROM sgso_relatos',
          )
        ) {
          const [relatoId, empresaId] = args;
          if (relatoId === 'relato-a' && Number(empresaId) === 77) {
            return {
              first: async () => ({
                id: 'relato-a',
                numero_protocolo: 'REL-2026-0001',
                tipo: 'INCIDENTE',
                status: 'ABERTO',
                created_at: '2026-05-26T00:00:00.000Z',
                tipo_investigacao: null,
              }),
            };
          }
          return {
            first: async (): Promise<null> => null,
          };
        }

        if (query.includes('SELECT fase, horas_prazo FROM sgso_sla_config')) {
          return {
            all: async () => ({ results: [] }),
          };
        }

        if (
          query.includes('UPDATE sgso_relatos') ||
          query.includes('INSERT INTO sgso_relato_workflow_eventos') ||
          query.includes('INSERT INTO sgso_audit_trail')
        ) {
          return {
            run: async () => ({ meta: { changes: 1 } }),
          };
        }

        return {
          first: async (): Promise<null> => null,
          all: async () => ({ results: [] }),
          run: async () => ({ meta: { changes: 0 } }),
        };
      };

      // Real D1 lets .all()/.first()/.run() be called straight off prepare()
      // when the statement has no placeholders (e.g. tableHasColumn's bare
      // `PRAGMA table_info(...)`, hit via getEmployeeSectorAccess for the
      // RELPREV read-scope check) — mirror that instead of requiring .bind()
      // first for every call.
      return {
        bind,
        first: () => (bind() as any).first(),
        all: () => (bind() as any).all(),
        run: () => (bind() as any).run(),
      };
    }),
  } as unknown as D1Database;

  return { db, calls };
}

function createSgsoApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/sgso', sgsoRoutes);
  return app;
}

describe('sgso nextgen relatos/acoes guards', () => {
  it('retorna 401 sem auth em escrita de workflow RELPREV', async () => {
    const app = createSgsoApp();
    const { db } = createMockDb();

    const response = await app.request(
      '/sgso/relprev/submissoes/relato-a/workflow',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'EM_TRIAGEM' }),
      },
      { DB: db, __authMode: 'missing' } as unknown as Env,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'AUTH_REQUIRED',
    });
  });

  it('falha fechado sem tenantContext em escrita RELPREV', async () => {
    const app = createSgsoApp();
    const { db } = createMockDb();

    const response = await app.request(
      '/sgso/relprev/submissoes/relato-a/workflow',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'EM_TRIAGEM' }),
      },
      { DB: db, __authMode: 'no-tenant' } as unknown as Env,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'SGSO_NEXT_ERROR',
    });
  });

  it('lista submissões RELPREV filtrando por empresa_id do tenant', async () => {
    const app = createSgsoApp();
    const { db, calls } = createMockDb();

    const response = await app.request('/sgso/relprev/submissoes?limit=20', { method: 'GET' }, {
      DB: db,
      __authMode: 'ok',
      __mockEmpresaId: 77,
    } as unknown as Env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: expect.any(Array),
    });

    const listCall = calls.find(
      (c) =>
        c.query.includes('FROM sgso_relatos r') &&
        c.query.includes('JOIN sgso_relato_capturas rc ON rc.relato_id = r.id'),
    );

    expect(listCall).toBeTruthy();
    expect(listCall?.args[0]).toBe(77);
  });

  it('bloqueia update cross-tenant ao não encontrar relato da empresa', async () => {
    const app = createSgsoApp();
    const { db } = createMockDb();

    const response = await app.request(
      '/sgso/relprev/submissoes/relato-b/workflow',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'EM_TRIAGEM' }),
      },
      { DB: db, __authMode: 'ok', __mockEmpresaId: 77 } as unknown as Env,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Relato não encontrado',
    });
  });

  it('workflow válido preserva contrato e propaga empresa_id no update', async () => {
    const app = createSgsoApp();
    const { db, calls } = createMockDb();

    const response = await app.request(
      '/sgso/relprev/submissoes/relato-a/workflow',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'EM_TRIAGEM', observacao: 'triagem inicial' }),
      },
      { DB: db, __authMode: 'ok', __mockEmpresaId: 77 } as unknown as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        id: 'relato-a',
        status: 'EM_TRIAGEM',
      },
    });

    const updateCall = calls.find((c) =>
      c.query.includes("SET status = 'EM_TRIAGEM', em_triagem_em = ?"),
    );
    expect(updateCall).toBeTruthy();
    expect(updateCall?.args.at(-1)).toBe(77);
  });

  it('retorna erro explícito quando listagem RELPREV falha no DB', async () => {
    const app = createSgsoApp();
    const { db } = createMockDb({ failRelprevList: true });

    const response = await app.request('/sgso/relprev/submissoes?limit=20', { method: 'GET' }, {
      DB: db,
      __authMode: 'ok',
      __mockEmpresaId: 77,
    } as unknown as Env);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'SGSO_NEXT_ERROR',
    });
  });
});
