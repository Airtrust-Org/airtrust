import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 55);
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

import sgsoRoutes from '../../routes/sgso';

function createMockDb() {
  const calls: Array<{ query: string; args: unknown[] }> = [];

  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => {
        calls.push({ query, args });

        if (query.includes('SELECT id, efetividade_cognitiva FROM sgso_relatos')) {
          return {
            first: async () => ({ id: 'relato-frms', efetividade_cognitiva: 62.4 }),
          };
        }

        if (query.includes('FROM sgso_matriz_risco_perfis')) {
          return {
            first: async () => ({ id: 9, codigo: 'PADRAO' }),
          };
        }

        if (query.includes('FROM sgso_matriz_risco_celulas')) {
          return {
            first: async () => ({ score: 12, nivel_risco: 'ALTO', exige_aprovacao: 0 }),
          };
        }

        if (query.includes('INSERT INTO sgso_avaliacao_risco')) {
          return {
            run: async () => ({ meta: { last_row_id: 321 } }),
          };
        }

        if (query.includes('INSERT INTO sgso_avaliacao_risco_contexto')) {
          return {
            run: async () => ({ meta: { last_row_id: 654 } }),
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

describe('SGSO FRMS decision neutralization', () => {
  it('nao altera probabilidade SGSO por indice FRMS estimado abaixo de 70', async () => {
    const app = createSgsoApp();
    const { db, calls } = createMockDb();

    const response = await app.request(
      '/sgso/relatos/relato-frms/avaliacao-risco',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo_avaliacao: 'INICIAL',
          probabilidade: 'C',
          severidade: 4,
        }),
      },
      { DB: db } as unknown as Env,
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload).toMatchObject({
      success: true,
      data: {
        probabilidade: 'C',
        elevado_por_fadiga: false,
        justificativa_elevacao: null,
        frms_context_indicator: {
          effectiveness_pct: 62.4,
          source: 'sgso_relatos.efetividade_cognitiva',
        },
      },
    });

    const riskInsert = calls.find((call) =>
      call.query.includes('INSERT INTO sgso_avaliacao_risco'),
    );
    expect(riskInsert?.args[3]).toBe('C');
    expect(riskInsert?.args[6]).toBeNull();
    expect(riskInsert?.args[7]).toBe(0);
    expect(riskInsert?.args[8]).toBeNull();

    const cellLookup = calls.find((call) =>
      call.query.includes('FROM sgso_matriz_risco_celulas'),
    );
    expect(cellLookup?.args).toEqual([9, 'C', 4]);
  });
});
