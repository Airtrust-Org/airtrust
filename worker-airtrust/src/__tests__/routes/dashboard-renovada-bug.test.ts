import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import dashboardRoutes from '../../routes/dashboard';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: any, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: any) => ({
    empresaId: 42,
    empresaCodigo: 'teste',
    empresaNome: 'Empresa Teste',
    role: 'admin',
    plano: 'pro',
    permissions: ['read', 'write'],
  }),
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({
    mode: 'unrestricted',
    setorIds: [],
    funcionarioId: null,
  })),
  buildFuncionarioScopeWhere: vi.fn(() => ({ clause: '1 = 1', bindings: [] })),
}));

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/dashboard', dashboardRoutes);
  return app;
}

function createPreparedDb(queue: Array<{ first?: unknown; all?: { results: unknown[] } }>) {
  let index = 0;
  const bindCalls: unknown[][] = [];
  const queries: string[] = [];

  const env = {
    DB: {
      prepare: vi.fn().mockImplementation((query: string) => {
        queries.push(query);
        return {
          bind: (...args: unknown[]) => {
            bindCalls.push(args);
            const entry = queue[index++];
            return {
              first: vi.fn().mockResolvedValue(entry?.first ?? null),
              all: vi.fn().mockResolvedValue(entry?.all ?? { results: [] }),
            };
          },
          first: vi.fn().mockResolvedValue(queue[index]?.first ?? null),
          all: vi.fn().mockResolvedValue(queue[index]?.all ?? { results: [] }),
        };
      }),
    },
  } as unknown as Env;

  return { env, bindCalls, queries };
}

describe('Dashboard Qualificacoes - Corrigir bug da classificacao RENOVADA', () => {
  it('aplica regra canonica de renovacao_de (sucessor real) e nao a legada (qh.renovacao_de IS NOT NULL) que excluía incorretamente', async () => {
    const { env, queries } = createPreparedDb([
      // 1: getQualificacoesAlertaDias
      { first: { dias_alerta_vencimento: 30 } },
      // 2: PRAGMA table_info(qualificacoes_historico) para hasDashboardRenovacaoDeColumn
      { all: { results: [{ name: 'renovacao_de' }] } },
      // 3: The actual stats query
      {
        first: {
          total: 10,
          validas: 5,
          vencendo: 2,
          vencidas: 3,
          renovadas: 1,
          planejadas: 0,
        },
      },
      // 4: The category grouping query
      { all: { results: [] } },
      // 5: The type grouping query
      { all: { results: [] } }
    ]);

    const app = createApp();
    const response = await app.fetch(
      new Request('http://localhost/dashboard/qualificacoes', {
        method: 'GET',
        headers: { 'x-empresa-id': '42' },
      }),
      env,
      {} as any,
    );

    expect(response.status).toBe(200);

    const statsQuery = queries.find(q => q.includes('COUNT(*) as total'));
    expect(statsQuery).toBeDefined();

    // The bug: the query used to say "OR qh.renovacao_de IS NOT NULL" which incorrectly excluded records
    // that WERE renewals, instead of checking if the record WAS RENEWED.
    expect(statsQuery).not.toContain('OR qh.renovacao_de IS NOT NULL');

    // The canonical logic: must check if it is the target of a newer record's renovacao_de
    expect(statsQuery).toContain('qh_renovadora.renovacao_de = qh.id');
    expect(statsQuery).toContain('EXISTS');
  });
});
