import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
  getEmpresaId: () => 6,
  };
});

vi.mock('../../routes/simuladores-fichas-helpers', () => ({
  gerarQualificacaoDaFicha: vi.fn(),
  getQualificacaoGeracaoErrorStatus: vi.fn(),
}));

vi.mock('../../utils/ficha-availability', () => ({
  getFichaAvailabilityFromDb: vi.fn(async () => ({
    available: true,
    code: 'OK',
    message: '',
    sessionStartsAt: null,
    timezone: 'America/Sao_Paulo',
  })),
}));

import simuladoresFichasSimuladorRoutes from '../../routes/simuladores-fichas-simulador';
import { errorHandler } from '../../middleware/error-handler';

// Bloqueador 5 closure: requireRole now legitimately throws ApiError for
// unauthorized roles on these routes. Registering the real error handler
// on this bare router (tested via .fetch() directly, bypassing the
// parent app's global app.onError) turns that into the proper JSON
// status code instead of Hono's generic 500.
simuladoresFichasSimuladorRoutes.onError(errorHandler);

function normalizeSql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

function createDbMock(options?: {
  existingManobra?: boolean;
  unsafeOverride?: string | null;
}) {
  const runs: Array<{ query: string; args: unknown[] }> = [];
  const seenQueries: string[] = [];

  const db = {
    prepare(query: string) {
      const sql = normalizeSql(query);
      seenQueries.push(sql);

      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
            if (
              sql ===
              'SELECT id FROM fichas_sessao WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL'
            ) {
              return { id: Number(args[0]) } as T;
            }

            // operational-domain-access.ts: isTenantRbacEnabled — legacy tenant.
            if (sql.includes('FROM empresas WHERE id')) {
              return { operational_domain_rbac_enabled: 0 } as T;
            }
            if (
              sql ===
              'SELECT * FROM fichas_sessao_manobras WHERE ficha_id=? AND ordem=? AND deleted_at IS NULL'
            ) {
                if (options?.existingManobra) {
                  return {
                    ficha_id: 901,
                    ordem: 1,
                    codigo: 'A139-CKL-01',
                    descricao: 'Descricao existente materializada',
                    categoria: 'PROCEDIMENTO',
                    resultado: null,
                    observacoes: '',
                  } as T;
                }
                return null as T | null;
              }

              if (sql.includes('FROM fichas_sessao fs')) {
                return {
                  id: 901,
                  tipo_sessao: 'PER',
                  tipo_aeronave: 'AW139',
                  tipo_sessao_real: 'PER',
                  tipo_aeronave_real: 'AW139',
                } as T;
              }

              if (sql.includes('FROM modelos_sessao ms') && sql.includes('LIMIT 1')) {
                return { id: 77 } as T;
              }

              if (sql.includes('FROM modelos_sessao_manobras msm') && sql.includes('LIMIT 1')) {
                return {
                  codigo: 'A139-CKL-01',
                  descricao: 'Normal checklist',
                  categoria: 'PROCEDIMENTO',
                  observacoes: options?.unsafeOverride ?? null,
                } as T;
              }

              if (
                sql ===
                'SELECT * FROM fichas_sessao_manobras WHERE ficha_id=? AND ordem=?'
              ) {
                return {
                  ficha_id: 901,
                  ordem: 1,
                  codigo: 'A139-CKL-01',
                  descricao: 'Normal checklist',
                  categoria: 'PROCEDIMENTO',
                  resultado: 8,
                  observacoes: 'ok',
                } as T;
              }

              return null as T | null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              runs.push({ query: sql, args });
              return { meta: { changes: 1, last_row_id: 1 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, runs, seenQueries };
}

describe('simuladores fichas simulador observacoes guard', () => {
  it('self-heal ignora override inseguro e usa a descricao original da manobra', async () => {
    const { db, runs } = createDbMock({ unsafeOverride: 'sourceNotes do loader' });

    const response = await simuladoresFichasSimuladorRoutes.fetch(
      new Request('http://localhost/fichas-simulador/901/manobras/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultado: 8, observacoes: 'ok' }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);

    const insert = runs.find((item) => item.query.includes('INSERT INTO fichas_sessao_manobras('));
    expect(insert).toBeDefined();
    // Bind order is (ficha_id, codigo, descricao, categoria, ordem, resultado,
    // observacoes) — empresa_id was removed: fichas_sessao_manobras has no
    // such column in production (schema-compat hotfix).
    expect(insert?.query).not.toContain('empresa_id');
    expect(insert?.args[1]).toBe('A139-CKL-01');
    expect(insert?.args[2]).toBe('Normal checklist');
  });

  it('quando a ficha ja tem a linha materializada, nao recalcula nem reinsere a manobra', async () => {
    const { db, runs, seenQueries } = createDbMock({
      existingManobra: true,
      unsafeOverride: 'sourceNotes do loader',
    });

    const response = await simuladoresFichasSimuladorRoutes.fetch(
      new Request('http://localhost/fichas-simulador/901/manobras/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultado: 7, observacoes: 'mantida' }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(runs.some((item) => item.query.includes('INSERT INTO fichas_sessao_manobras('))).toBe(
      false,
    );
    expect(
      seenQueries.some((query) => query.includes('FROM modelos_sessao_manobras msm')),
    ).toBe(false);
    expect(
      runs.some((item) =>
        item.query.includes(
          'UPDATE fichas_sessao_manobras SET resultado=?, observacoes=?, updated_at=datetime("now") WHERE ficha_id=? AND ordem=?',
        ),
      ),
    ).toBe(true);
  });
});
