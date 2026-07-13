import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  simuladoresHasEmpresaId,
  getSimuladorModeloAeronave,
} from '../../routes/simuladores-shared';
import { assertEntityOwnership } from '../../routes/simuladores-shared-session-validation';
import type { NormalizedSharedSessionRequest } from '../../routes/simuladores-shared-session-logic';

/**
 * Schema compatibility tests for the simuladores table.
 *
 * The simuladores table may be GLOBAL (no empresa_id column) or
 * TENANT-SCOPED (with empresa_id column). Both schemas exist in
 * production and this test suite guarantees the hotfix never
 * introduces `D1_ERROR: no such column: empresa_id`.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

type TableColumn = { name: string };

function dbWithColumns(columns: string[]) {
  const pragmaResults = columns.map((name) => ({ name }));

  function makeBindResult(query: string, bindArgs: unknown[]) {
    return {
      first: async () => {
        if (query.includes('FROM simuladores')) {
          return bindArgs[0] != null ? { id: bindArgs[0] } : null;
        }

        if (query.includes('COUNT(DISTINCT id)') && query.includes('FROM funcionarios')) {
          return { total: bindArgs.length > 1 ? bindArgs.length - 1 : 1 };
        }

        if (query.includes('FROM funcionarios') && query.includes('WHERE id = ?')) {
          return { id: bindArgs[0] };
        }

        return null;
      },
      all: async () => {
        if (query.includes('FROM modelos_sessao ms')) {
          return {
            results: [
              {
                id: 80,
                codigo: 'EXA-V01',
                nome: 'EXA-V01',
                ativo: 1,
                tipo: 'SIMULADOR',
                modelo_aeronave: null,
                tipo_sessao_codigo: 'EXA',
                gera_qualificacao: 0,
                qualificacao_tipo_id: null,
              },
            ],
          };
        }

        if (query.includes('FROM simulador_agendamentos')) {
          return { results: [] };
        }

        return { results: [] };
      },
    };
  }

  return {
    prepare: vi.fn((query: string) => {
      const bindResult = (...args: unknown[]) => makeBindResult(query, args);

      return {
        // Direct .all() (no .bind()) — used by PRAGMA queries
        all: async () => {
          if (query.includes('PRAGMA table_info(simuladores)')) {
            return { results: pragmaResults };
          }
          return { results: [] };
        },
        // Direct .first() (no .bind()) — rare but supported
        first: async () => null,
        // .bind() chain
        bind: bindResult,
      };
    }),
  } as unknown as D1Database;
}

function buildValidPayload(overrides?: Partial<NormalizedSharedSessionRequest>): NormalizedSharedSessionRequest {
  return {
    instrutor_id: 201,
    simulador_id: 10,
    data: '2026-07-20',
    hora_inicio: '08:00',
    hora_fim: '10:00',
    participantes: [{ funcionario_id: 101 }],
    segmentos: [],
    resumo_participantes: [],
    atribuicoes_planejadas: [
      {
        assignment_key: 'k1',
        funcionario_id: 101,
        modelo_sessao_id: 80,
        treinamento_planejado_id: null,
        carga_horaria_total_minutos: 120,
        gera_ficha: true,
      },
    ],
    ...overrides,
  } as unknown as NormalizedSharedSessionRequest;
}

// ── CENÁRIO 1: Schema GLOBAL (sem empresa_id) ──────────────────────────────

describe('Schema GLOBAL — simuladores sem empresa_id', () => {
  let db: D1Database;

  beforeEach(() => {
    db = dbWithColumns(['id', 'nome', 'modelo', 'tipo', 'deleted_at']);
  });

  describe('simuladoresHasEmpresaId', () => {
    it('retorna false quando a coluna empresa_id não existe', async () => {
      const has = await simuladoresHasEmpresaId(db);
      expect(has).toBe(false);
    });

    it('cacheia o resultado e não repete o PRAGMA', async () => {
      await simuladoresHasEmpresaId(db);
      await simuladoresHasEmpresaId(db);
      // prepare should have been called only once for PRAGMA
      const pragmaCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: string[]) => call[0].includes('PRAGMA'),
      );
      expect(pragmaCalls.length).toBe(1);
    });
  });

  describe('getSimuladorModeloAeronave', () => {
    it('NÃO inclui empresa_id na query quando a coluna não existe', async () => {
      const modelo = await getSimuladorModeloAeronave(db, 10, 6);
      expect(modelo).toBeDefined();

      // Regression: the SQL must NOT contain empresa_id
      const allCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls.flat();
      const simuladorSql = allCalls.find((c: string) =>
        typeof c === 'string' && c.includes('FROM simuladores') && c.includes('deleted_at IS NULL'),
      );
      expect(simuladorSql).toBeDefined();
      expect(simuladorSql).not.toContain('empresa_id');
    });

    it('funciona sem empresaId informado (schema global)', async () => {
      const modelo = await getSimuladorModeloAeronave(db, 10);
      expect(modelo).toBeDefined();
    });
  });

  describe('assertEntityOwnership', () => {
    it('NÃO inclui empresa_id na query de simuladores quando a coluna não existe', async () => {
      let capturedSimuladorSql: string | undefined;

      // Wrap to capture the SQL for simuladores query
      const originalPrepare = db.prepare;
      db.prepare = vi.fn((query: string) => {
        if (query.includes('FROM simuladores') && query.includes('deleted_at IS NULL')) {
          capturedSimuladorSql = query;
        }
        return (originalPrepare as ReturnType<typeof vi.fn>)(query);
      }) as unknown as D1Database['prepare'];

      try {
        await assertEntityOwnership(db, 6, buildValidPayload());
      } catch {
        // Ownership check may fail due to mocked data, that's fine
      }

      expect(capturedSimuladorSql).toBeDefined();
      expect(capturedSimuladorSql).not.toContain('empresa_id');
    });
  });
});

// ── CENÁRIO 2: Schema TENANT-SCOPED (com empresa_id) ──────────────────────

describe('Schema TENANT-SCOPED — simuladores com empresa_id', () => {
  let db: D1Database;

  beforeEach(() => {
    db = dbWithColumns(['id', 'nome', 'modelo', 'tipo', 'empresa_id', 'deleted_at']);
  });

  describe('simuladoresHasEmpresaId', () => {
    it('retorna true quando a coluna empresa_id existe', async () => {
      const has = await simuladoresHasEmpresaId(db);
      expect(has).toBe(true);
    });
  });

  describe('getSimuladorModeloAeronave', () => {
    it('inclui empresa_id na query quando a coluna existe e empresaId é informado', async () => {
      const modelo = await getSimuladorModeloAeronave(db, 10, 6);
      expect(modelo).toBeDefined();

      const allCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls.flat();
      const simuladorSql = allCalls.find((c: string) =>
        typeof c === 'string' && c.includes('FROM simuladores') && c.includes('deleted_at IS NULL'),
      );
      expect(simuladorSql).toBeDefined();
      expect(simuladorSql).toContain('empresa_id');
    });

    it('NÃO inclui empresa_id quando empresaId NÃO é informado', async () => {
      const modelo = await getSimuladorModeloAeronave(db, 10);
      expect(modelo).toBeDefined();

      const allCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls.flat();
      const simuladorSql = allCalls.find((c: string) =>
        typeof c === 'string' && c.includes('FROM simuladores') && c.includes('deleted_at IS NULL'),
      );
      expect(simuladorSql).toBeDefined();
      expect(simuladorSql).not.toContain('empresa_id');
    });
  });

  describe('assertEntityOwnership', () => {
    it('inclui empresa_id na query de simuladores quando a coluna existe', async () => {
      let capturedSimuladorSql: string | undefined;

      const originalPrepare = db.prepare;
      db.prepare = vi.fn((query: string) => {
        if (query.includes('FROM simuladores') && query.includes('deleted_at IS NULL')) {
          capturedSimuladorSql = query;
        }
        return (originalPrepare as ReturnType<typeof vi.fn>)(query);
      }) as unknown as D1Database['prepare'];

      try {
        await assertEntityOwnership(db, 6, buildValidPayload());
      } catch {
        // May fail due to mocked data
      }

      expect(capturedSimuladorSql).toBeDefined();
      expect(capturedSimuladorSql).toContain('empresa_id');
    });
  });
});

// ── REGRESSÃO: Nenhuma SQL with empresa_id when PRAGMA says no ─────────────

describe('Regression gate — empresa_id nunca deve aparecer em SQL quando PRAGMA não retorna a coluna', () => {
  it('nenhum prepare chamado contra simuladores contém empresa_id com schema global', async () => {
    const db = dbWithColumns(['id', 'nome', 'modelo', 'tipo', 'deleted_at']);

    try {
      await assertEntityOwnership(db, 6, buildValidPayload());
    } catch {
      // Expected to fail on mocked data
    }

    // Also exercise getSimuladorModeloAeronave
    await getSimuladorModeloAeronave(db, 10, 6);

    const allCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls.flat();
    const simuladorCalls = allCalls.filter(
      (c: unknown) => typeof c === 'string' && c.includes('FROM simuladores'),
    );

    for (const call of simuladorCalls) {
      expect(call as string).not.toContain('empresa_id');
    }
  });
});
