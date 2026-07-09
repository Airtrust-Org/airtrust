import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

// Regression test for production incident: POST /sessoes threw
// "D1_ERROR: no such column: empresa_id at offset 77: SQLITE_ERROR"
// because the `simuladores` table validation query unconditionally
// filtered by `empresa_id`, a column that does not exist on `simuladores`
// in production (confirmed via PRAGMA table_info on the prod D1 database).

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 1);
    c.set('userRole', 'admin');
    c.set('empresaId', Number(c.env?.__mockEmpresaId ?? 6));
    c.set('tenantContext', { empresaId: Number(c.env?.__mockEmpresaId ?? 6) });
    await next();
  },
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [], funcionarioId: null })),
}));

vi.mock('../../routes/simuladores-shared', async () => {
  const actual = await vi.importActual<typeof import('../../routes/simuladores-shared')>(
    '../../routes/simuladores-shared',
  );
  return {
    ...actual,
    getSimuladorModeloAeronave: vi.fn(async () => 'AW139'),
    resolveTemplateIdSessao: vi.fn(async () => null),
    normalizeChecksSessao: vi.fn(async () => []),
    audit: vi.fn(async () => undefined),
  };
});

import simuladoresSessoesRoutes from '../../routes/simuladores-sessoes';

function createDbWithoutSimuladoresEmpresaId() {
  const queries: string[] = [];

  const db = {
    prepare: vi.fn((query: string) => {
      queries.push(query);

      const first = async () => {
        if (query.includes('SELECT COUNT(DISTINCT id) AS total') && query.includes('FROM funcionarios')) {
          return { total: 1 };
        }
        if (query.includes('COALESCE(is_instrutor, 0) as is_instrutor')) {
          return { is_instrutor: 1 };
        }
        if (query === 'SELECT id FROM simuladores WHERE id = ? AND deleted_at IS NULL LIMIT 1') {
          return { id: 7 };
        }
        if (query === 'SELECT id FROM simuladores WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1') {
          // Production has no empresa_id column on `simuladores` — this
          // query must never be issued. If it is, simulate the real D1
          // failure so the regression is caught loudly.
          throw new Error('D1_ERROR: no such column: empresa_id at offset 77: SQLITE_ERROR');
        }
        return null;
      };

      const all = async () => {
        if (query === 'PRAGMA table_info(simuladores)') {
          return {
            results: [
              { name: 'id' },
              { name: 'nome' },
              { name: 'modelo' },
              { name: 'tipo' },
              { name: 'deleted_at' },
            ],
          };
        }
        if (query.includes("PRAGMA table_info('funcionarios')")) {
          return { results: [{ name: 'id' }, { name: 'is_instrutor' }] };
        }
        return { results: [] };
      };

      const run = async () => ({ meta: { changes: 1, last_row_id: 1 } });

      return {
        bind: (..._args: unknown[]) => ({ first, all, run }),
        first,
        all,
        run,
      };
    }),
  } as unknown as D1Database;

  return { db, queries };
}

describe('POST /sessoes — compat com schema de produção (simuladores sem empresa_id)', () => {
  it('não emite empresa_id na query de validação do simulador quando a coluna não existe', async () => {
    const { db, queries } = createDbWithoutSimuladoresEmpresaId();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulador_id: 7,
          data: '2026-07-10',
          // horario_inicio/horario_fim propositalmente omitidos para
          // interromper o fluxo logo após a validação do simulador,
          // isolando o comportamento sob teste.
          instrutor_id: 41,
          tipo_sessao: 'PER',
          tipo_aeronave: 'AW139',
          participantes: [{ funcionario_id: 41 }],
        }),
      }),
      { DB: db, __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    const payload = (await response.json()) as { success: boolean; error?: string };

    // Deve avançar para a próxima validação de negócio (horário obrigatório),
    // nunca para um 500 de "no such column: empresa_id".
    expect(payload.error).not.toMatch(/no such column/i);
    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      success: false,
      error: 'Horário de início e fim são obrigatórios',
    });

    const simuladorQuery = queries.find((sql) => sql.includes('FROM simuladores'));
    expect(simuladorQuery).toBe('SELECT id FROM simuladores WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    expect(simuladorQuery).not.toContain('empresa_id');
  });
});
