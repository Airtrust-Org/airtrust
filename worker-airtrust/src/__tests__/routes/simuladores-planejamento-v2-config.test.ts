import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

import router, {
  normalizeSimulatorRosterPolicy,
} from '../../routes/simuladores-planejamento-v2-config';

type Policy = 'FOLGA' | 'TRABALHO' | 'AMBAS';

function createDb(initial: Record<number, Policy> = { 6: 'AMBAS', 7: 'TRABALHO' }) {
  const rows = new Map<number, Policy>(
    Object.entries(initial).map(([empresaId, policy]) => [Number(empresaId), policy]),
  );
  const calls: Array<{ query: string; args: unknown[]; kind: 'run' | 'first' }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      let bound: unknown[] = [];
      const statement = {
        bind: (...args: unknown[]) => {
          bound = args;
          return statement;
        },
        run: async () => {
          calls.push({ query, args: [...bound], kind: 'run' });
          if (query.includes('INSERT INTO empresas_config')) {
            rows.set(Number(bound[0]), String(bound[1]) as Policy);
          }
          return { meta: { changes: 1, last_row_id: 0 } };
        },
        first: async () => {
          calls.push({ query, args: [...bound], kind: 'first' });
          if (!query.includes('FROM empresas_config')) return null;

          const policy = rows.get(Number(bound[0]));
          if (!policy) return null;

          return {
            planejamento_simulador_antecedencia_dias: 90,
            planejamento_simulador_regra_quinzena: policy,
            planejamento_simulador_preferencia_sessoes_por_dia: 2,
            planejamento_simulador_preferencia_minutos_por_dia: 240,
            planejamento_simulador_permitir_quebra_preferencia: 1,
            planejamento_simulador_permitir_sessao_compartilhada: 1,
            planejamento_simulador_preferir_mesmo_treinamento: 1,
            planejamento_simulador_preferir_mesma_sessao: 1,
            planejamento_simulador_aprovacao_obrigatoria: 1,
          };
        },
      };
      return statement;
    }),
  } as unknown as D1Database;

  return { db, rows, calls };
}

function createApp(role: string, empresaId: number) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  app.use('/api/simuladores/planejamento-v2/*', async (c, next) => {
    c.set('userId', 1001);
    c.set('empresaId', empresaId);
    c.set('userRole', role);
    c.set('tenantContext', {
      empresaId,
      empresaCodigo: `tenant-${empresaId}`,
      empresaNome: `Tenant ${empresaId}`,
      role: role.toLowerCase() as 'admin' | 'manager' | 'viewer',
      plano: 'pro',
      permissions: ['read'],
    });
    await next();
  });
  app.route('/api/simuladores/planejamento-v2', router);
  return app;
}

function putPolicy(policy: unknown, extra: Record<string, unknown> = {}) {
  return {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roster_policy: policy, ...extra }),
  };
}

describe('simulator planning company roster policy', () => {
  it('accepts the three canonical company policies case-insensitively', () => {
    expect(normalizeSimulatorRosterPolicy('folga')).toBe('FOLGA');
    expect(normalizeSimulatorRosterPolicy(' TRABALHO ')).toBe('TRABALHO');
    expect(normalizeSimulatorRosterPolicy('ambas')).toBe('AMBAS');
  });

  it('rejects unknown or empty values', () => {
    expect(normalizeSimulatorRosterPolicy('fora')).toBeNull();
    expect(normalizeSimulatorRosterPolicy('')).toBeNull();
    expect(normalizeSimulatorRosterPolicy(null)).toBeNull();
  });

  it.each(['viewer', 'student', 'instructor', 'editor'])(
    'blocks %s before any company-policy database access',
    async (role) => {
      const { db } = createDb();
      const env = { DB: db, ENVIRONMENT: 'test' } as unknown as Env;

      const response = await createApp(role, 6).request(
        '/api/simuladores/planejamento-v2/config',
        putPolicy('FOLGA'),
        env,
      );

      expect(response.status).toBe(403);
      expect(db.prepare).not.toHaveBeenCalled();
    },
  );

  it.each(['admin', 'manager'])(
    'allows %s and writes only the authenticated tenant policy',
    async (role) => {
      const { db, rows, calls } = createDb();
      const env = { DB: db, ENVIRONMENT: 'test' } as unknown as Env;

      const response = await createApp(role, 6).request(
        '/api/simuladores/planejamento-v2/config',
        putPolicy('FOLGA'),
        env,
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        success: true,
        data: { roster_policy: 'FOLGA' },
      });

      expect(rows.get(6)).toBe('FOLGA');
      expect(rows.get(7)).toBe('TRABALHO');

      const upsert = calls.find((call) => call.query.includes('INSERT INTO empresas_config'));
      expect(upsert?.kind).toBe('run');
      expect(upsert?.args).toEqual([6, 'FOLGA']);

      const readback = calls.find((call) => call.query.includes('FROM empresas_config'));
      expect(readback?.kind).toBe('first');
      expect(readback?.args).toEqual([6]);
    },
  );

  it('ignores a spoofed empresa_id in the request body and keeps the authenticated tenant', async () => {
    const { db, rows, calls } = createDb();
    const env = { DB: db, ENVIRONMENT: 'test' } as unknown as Env;

    const response = await createApp('admin', 6).request(
      '/api/simuladores/planejamento-v2/config',
      putPolicy('FOLGA', { empresa_id: 7 }),
      env,
    );

    expect(response.status).toBe(200);
    expect(rows.get(6)).toBe('FOLGA');
    expect(rows.get(7)).toBe('TRABALHO');

    const upsert = calls.find((call) => call.query.includes('INSERT INTO empresas_config'));
    expect(upsert?.args).toEqual([6, 'FOLGA']);
  });

  it('rejects invalid policy before any write', async () => {
    const { db, rows, calls } = createDb();
    const env = { DB: db, ENVIRONMENT: 'test' } as unknown as Env;

    const response = await createApp('admin', 6).request(
      '/api/simuladores/planejamento-v2/config',
      putPolicy('FORA'),
      env,
    );

    expect(response.status).toBe(400);
    expect(rows.get(6)).toBe('AMBAS');
    expect(calls.some((call) => call.kind === 'run')).toBe(false);
  });
});
