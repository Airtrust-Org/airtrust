import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

const { publishDomainEventMock } = vi.hoisted(() => ({
  publishDomainEventMock: vi.fn(),
}));

vi.mock('../../shared/domainEvents', () => ({
  publishDomainEvent: publishDomainEventMock,
}));

import adminDomainEventsRoutes from '../../routes/admin-domain-events';

type DbCall = {
  sql: string;
  bindings: unknown[];
};

function createMockEnv(resultsByCall: Array<Array<Record<string, unknown>>> = []) {
  const calls: DbCall[] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      let bindings: unknown[] = [];
      const statement = {
        bind: (...values: unknown[]) => {
          bindings = values;
          return statement;
        },
        all: async () => {
          const callIndex = calls.length;
          calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), bindings });
          return { results: resultsByCall[callIndex] ?? [] };
        },
      };
      return statement;
    }),
  } as unknown as D1Database;

  return {
    calls,
    env: {
      DB: db,
      ENVIRONMENT: 'test',
    } as unknown as Env,
  };
}

function createApp(role: string, empresaId = 7) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  app.use('/api/admin/*', async (c, next) => {
    c.set('userId', 10);
    c.set('empresaId', empresaId);
    c.set('userRole', role);
    c.set('tenantContext', {
      empresaId,
      empresaCodigo: `empresa-${empresaId}`,
      empresaNome: `Empresa ${empresaId}`,
      role: role.toLowerCase() as 'admin' | 'manager' | 'viewer',
      plano: 'pro',
      permissions: role.toLowerCase() === 'admin' ? ['*'] : ['read'],
    });
    await next();
  });
  app.route('/api/admin', adminDomainEventsRoutes);
  return app;
}

beforeEach(() => {
  publishDomainEventMock.mockReset();
  publishDomainEventMock.mockResolvedValue(undefined);
});

describe('admin domain events security', () => {
  it.each([
    ['GET', '/api/admin/domain-events?empresa_id=999'],
    ['GET', '/api/admin/integracoes/health?empresa_id=999'],
    ['POST', '/api/admin/integracoes/test-event'],
  ])('blocks non-admin access to %s %s', async (method, path) => {
    const { env, calls } = createMockEnv();
    const response = await createApp('viewer').request(
      path,
      {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: method === 'POST' ? JSON.stringify({ empresa_id: 999 }) : undefined,
      },
      env,
    );

    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
    expect(publishDomainEventMock).not.toHaveBeenCalled();
  });

  it('ignores empresa_id from query and always scopes domain events to the authenticated tenant', async () => {
    const { env, calls } = createMockEnv();
    const response = await createApp('admin', 7).request(
      '/api/admin/domain-events?empresa_id=999&tipo=TESTE&limit=25',
      {},
      env,
    );

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain('WHERE empresa_id = ? AND deleted_at IS NULL');
    expect(calls[0]?.bindings).toEqual([7, 'TESTE', 25]);
  });

  it('exposes retry and dead-letter states in the tenant-scoped admin response', async () => {
    const retryAt = Date.UTC(2026, 7, 3, 5, 0, 0);
    const { env, calls } = createMockEnv([
      [
        {
          id: 'event-1',
          empresa_id: 7,
          modulo: 'funcionarios',
          tipo: 'FUNCIONARIO_ATUALIZADO',
          payload: '{}',
          consumidores: JSON.stringify(['compliance', 'hospedagem']),
          processado_por: JSON.stringify([
            `__domain_event__|retry|compliance|2|${retryAt}`,
            '__domain_event__|dead|hospedagem|5',
          ]),
          processado: 0,
          ultimo_erro: 'falha persistente',
          created_at: '2026-08-03T04:00:00.000Z',
          processed_at: null,
        },
      ],
    ]);

    const response = await createApp('admin', 7).request('/api/admin/domain-events', {}, env);
    const body = (await response.json()) as {
      data: Array<{
        estado_processamento: string;
        consumidor_status: Array<Record<string, unknown>>;
      }>;
    };

    expect(response.status).toBe(200);
    expect(calls[0]?.bindings).toEqual([7, 50]);
    expect(body.data[0]).toMatchObject({
      estado_processamento: 'dead_letter',
      consumidor_status: [
        {
          consumidor: 'compliance',
          status: 'retry',
          tentativas: 2,
          next_attempt_at: new Date(retryAt).toISOString(),
        },
        {
          consumidor: 'hospedagem',
          status: 'dead_letter',
          tentativas: 5,
        },
      ],
    });
  });

  it('scopes every integration health aggregate to the authenticated tenant', async () => {
    const { env, calls } = createMockEnv();
    const response = await createApp('admin', 7).request(
      '/api/admin/integracoes/health?empresa_id=999',
      {},
      env,
    );

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(3);
    expect(calls.map((call) => call.bindings)).toEqual([[7], [7], [7]]);
    expect(calls.every((call) => call.sql.includes('empresa_id = ?'))).toBe(true);

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { empresa_id: 7 },
    });
  });

  it('rejects event types outside the canonical domain event contract', async () => {
    const { env } = createMockEnv();
    const response = await createApp('admin', 7).request(
      '/api/admin/integracoes/test-event',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'EVENTO_ARBITRARIO' }),
      },
      env,
    );

    expect(response.status).toBe(400);
    expect(publishDomainEventMock).not.toHaveBeenCalled();
  });

  it('prevents body and nested payload from overriding protected event provenance', async () => {
    const { env } = createMockEnv();
    const response = await createApp('admin', 7).request(
      '/api/admin/integracoes/test-event',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: 999,
          modulo: 'manual-test',
          tipo: 'FUNCIONARIO_ATUALIZADO',
          funcionario_id: 55,
          payload: {
            empresa_id: '999',
            origem_modulo: 'forged',
            origem_usuario_id: 'attacker',
            custom: 'preserved',
          },
        }),
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(publishDomainEventMock).toHaveBeenCalledTimes(1);
    expect(publishDomainEventMock).toHaveBeenCalledWith(
      env.DB,
      'manual-test',
      'FUNCIONARIO_ATUALIZADO',
      expect.objectContaining({
        custom: 'preserved',
        empresa_id: '7',
        origem_modulo: 'manual-test',
        origem_usuario_id: '10',
        funcionario_id: '55',
      }),
    );
  });
});
