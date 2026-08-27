import { describe, expect, it, vi } from 'vitest';

import { loadCanonicalCategoryRows } from '../../routes/qualificacoes/tipos-canonical-boundary';

type BoundRow = {
  tipo_id: number;
  categoria_id: number | null;
};

/**
 * D1 limita a quantidade de variáveis ligadas por consulta. A listagem de
 * tipos subiu o teto de 75 para 500 (c35b6f25) e expôs um bug no boundary
 * canônico: `loadCanonicalCategoryRows` montava um `IN (...)` com um
 * placeholder por tipo, estourando o teto quando a listagem passava de 99
 * linhas (99 ids + 1 empresa_id = 100 variáveis). Este teste garante que a
 * leitura é fatiada em lotes de no máximo 99 IDs por consulta.
 */
describe('qualificacoes tipos canonical boundary', () => {
  function createMockDb(tipoCount: number) {
    const selectCalls: Array<{ sql: string; args: unknown[] }> = [];

    const db = {
      prepare: vi.fn((query: string) => {
        if (query.includes('PRAGMA table_info')) {
          return {
            all: async () => ({
              results: [{ name: 'dominio_codigo' }, { name: 'lms_integrada' }],
            }),
            first: async () => null,
            bind: () => ({ all: async () => ({ results: [] }), first: async () => null }),
          };
        }

        return {
          all: async () => ({ results: [] }),
          first: async () => null,
          bind: (...args: unknown[]) => ({
            all: async () => {
              selectCalls.push({ sql: query, args });
              const [empresaId, ...ids] = args as number[];
              const rows: BoundRow[] = (ids as number[]).map((id) => ({
                tipo_id: id,
                categoria_id: id % 10,
              }));
              return { results: rows };
            },
            first: async () => null,
          }),
        };
      }),
    } as unknown as D1Database;

    return { db, selectCalls };
  }

  function countInPlaceholders(sql: string): number {
    const match = sql.match(/qt\.id IN \(([^)]*)\)/);
    if (!match) return 0;
    return (match[1].match(/\?/g) || []).length;
  }

  it('fatia IDs em lotes de no máximo 99 por consulta (limite D1 de 100 variáveis)', async () => {
    const tipoCount = 250;
    const { db, selectCalls } = createMockDb(tipoCount);
    const ids = Array.from({ length: tipoCount }, (_, index) => index + 1);

    const result = await loadCanonicalCategoryRows(db, 6, ids);

    expect(result.size).toBe(tipoCount);
    expect(selectCalls.length).toBe(Math.ceil(tipoCount / 99));

    const allBoundIds: number[] = [];
    for (const call of selectCalls) {
      const [empresaId, ...chunk] = call.args as number[];
      expect(empresaId).toBe(6);
      expect(chunk.length).toBeLessThanOrEqual(99);
      expect(countInPlaceholders(call.sql)).toBe(chunk.length);
      // 1 empresa_id + chunk <= 100 variáveis (teto D1).
      expect(1 + chunk.length).toBeLessThanOrEqual(100);
      allBoundIds.push(...chunk);
    }

    expect(new Set(allBoundIds).size).toBe(tipoCount);
    expect(allBoundIds.map(Number).sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
  });

  it('retorna vazio sem IDs sem consultar', async () => {
    const { db, selectCalls } = createMockDb(0);
    const result = await loadCanonicalCategoryRows(db, 6, []);
    expect(result.size).toBe(0);
    expect(selectCalls.length).toBe(0);
  });

  it('deduplica IDs antes de consultar', async () => {
    const { db, selectCalls } = createMockDb(10);
    const result = await loadCanonicalCategoryRows(db, 6, [7, 7, 7, 8, 8]);
    expect(result.size).toBe(2);
    expect(selectCalls.length).toBe(1);
    expect(selectCalls[0].args.length).toBe(3); // empresaId + 2 ids
  });
});
