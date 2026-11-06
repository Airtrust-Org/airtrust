import { describe, expect, it, vi } from 'vitest';
import { loadTipoListMetrics } from '../../routes/qualificacoes/tipos-list-metrics';

type SqlCall = { sql: string; bindings: unknown[] };

function createDb() {
  const calls: SqlCall[] = [];
  const prepare = vi.fn((sql: string) => ({
    bind: (...bindings: unknown[]) => ({
      all: async () => {
        calls.push({ sql, bindings });
        if (sql.includes('FROM qualificacoes_historico')) {
          return {
            results: [
              { tipo_id: 1, total_no_historico: 3 },
              { tipo_id: 500, total_no_historico: 1 },
            ],
          };
        }
        if (sql.includes('FROM qualificacoes_tipos_setores')) {
          return {
            results: [
              { tipo_id: 1, setores_json: '[{"id":10,"nome":"Treinamento"}]', setores_count: 1 },
            ],
          };
        }
        throw new Error('Unexpected SQL query');
      },
    }),
  }));
  return { db: { prepare } as unknown as D1Database, calls, prepare };
}

describe('qualificacoes tipos bounded listing metrics', () => {
  it('skips all aggregate queries for an empty permitted result set', async () => {
    const { db, prepare } = createDb();
    expect(await loadTipoListMetrics(db, 6, [], true)).toEqual(new Map());
    expect(prepare).not.toHaveBeenCalled();
  });

  it('queries only the selected 500 IDs with two binds and explicit tenant scope', async () => {
    const { db, calls } = createDb();
    const ids = Array.from({ length: 500 }, (_, index) => index + 1);
    const metrics = await loadTipoListMetrics(db, 6, ids, true);

    expect(metrics.size).toBe(500);
    expect(calls).toHaveLength(2);
    for (const { sql, bindings } of calls) {
      expect(bindings).toHaveLength(2); // empresa_id + one JSON array; no D1 bind overflow
      expect(bindings[0]).toBe(6);
      expect(JSON.parse(bindings[1] as string)).toEqual(ids.map(String));
      expect(sql).toMatch(/empresa_id\s*=\s*\?/);
      expect(sql).toMatch(/IN \(SELECT value FROM json_each\(\?\)\)/);
      expect(sql).toMatch(/deleted_at IS NULL/);
      expect(sql).toMatch(/GROUP BY/);
    }
    expect(metrics.get('1')).toEqual({
      total_no_historico: 3,
      setores_json: '[{"id":10,"nome":"Treinamento"}]',
      setores_count: 1,
    });
    expect(metrics.get('200')).toEqual({ total_no_historico: 0, setores_json: '[]', setores_count: 0 });
    expect(metrics.get('500')).toEqual({ total_no_historico: 1, setores_json: '[]', setores_count: 0 });
  });

  it('skips sector lookups when the optional table is absent, preserving empty sector defaults', async () => {
    const { db, calls } = createDb();
    const metrics = await loadTipoListMetrics(db, 6, [1, 2, 1], false);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('FROM qualificacoes_historico');
    expect(JSON.parse(calls[0].bindings[1] as string)).toEqual(['1', '2']);
    expect(metrics.get('2')).toEqual({ total_no_historico: 0, setores_json: '[]', setores_count: 0 });
  });
});
