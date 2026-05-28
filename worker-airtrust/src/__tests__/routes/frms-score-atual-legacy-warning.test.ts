import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 99);
    c.set('userRole', 'manager');
    c.set('tenantContext', {
      empresaId: 77,
      empresaCodigo: 'acme',
      empresaNome: 'Acme Air',
      role: 'manager',
      plano: 'pro',
      permissions: ['read', 'write'],
    });
    await next();
  },
}));

import frmsRoutes from '../../routes/frms';

function createMockDb() {
  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (..._args: unknown[]) => {
        if (query.includes('INSERT INTO rate_limit_store')) {
          return {
            first: async () => ({ count: 1, reset_at: '2026-05-28T18:00:00.000Z' }),
          };
        }

        if (query.includes('SELECT id FROM funcionarios')) {
          return {
            first: async () => ({ id: 123 }),
          };
        }

        if (query.includes("date(data) >= date('now','-7 days')")) {
          return {
            first: async () => ({ minutos: 360 }),
          };
        }

        if (query.includes('COUNT(DISTINCT date(data)) AS dias')) {
          return {
            first: async () => ({ dias: 5 }),
          };
        }

        if (query.includes("date(data) >= date('now','-28 days')")) {
          return {
            first: async () => ({ minutos: 1200 }),
          };
        }

        if (query.includes('WITH score_base AS')) {
          return {
            first: async () => ({ frms_score: 70, frms_status: 'critico' }),
          };
        }

        return {
          first: async (): Promise<null> => null,
          all: async () => ({ results: [] }),
          run: async () => ({ meta: { changes: 0 } }),
        };
      },
    })),
  } as unknown as D1Database;

  return db;
}

function createFrmsApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  app.route('/frms', frmsRoutes);
  return app;
}

describe('GET /frms/score-atual/:funcionarioid legacy semantics', () => {
  it('mantem apto_para_voo por compatibilidade e retorna warning de interpretacao', async () => {
    const app = createFrmsApp();
    const db = createMockDb();

    const response = await app.request(
      '/frms/score-atual/123',
      {
        method: 'GET',
        headers: { 'CF-Connecting-IP': '127.0.0.1' },
      },
      { DB: db } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { interpretation_warning: string };
    };
    expect(payload).toMatchObject({
      success: true,
      data: {
        funcionarioid: '123',
        nivel: 'critico',
        status_triagem_operacional: 'revisao_operacional',
        fit_for_duty_indicator: null,
        apto_para_voo: false,
        legacy_fields: {
          apto_para_voo:
            'Campo legado derivado de alertas/estado FRMS. Use status_triagem_operacional para leitura informativa.',
        },
      },
    });
    expect(payload.data.interpretation_warning).toContain('nao deve ser usado como decisao automatica');
  });
});
