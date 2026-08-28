import { describe, expect, it, vi } from 'vitest';
import { getReadinessBaselineSnapshot } from '../../lib/frms/readiness-persistence';

describe('FRMS readiness baseline persistence', () => {
  it('builds a tenant-scoped chronological snapshot from the five most recent valid prior sessions', async () => {
    const queries: Array<{ sql: string; binds: unknown[] }> = [];
    const rows = [
      { median_rt_ms: 280, lapse_rate: 0 },
      { median_rt_ms: 300, lapse_rate: 0.1 },
      { median_rt_ms: 310, lapse_rate: 0.2 },
      { median_rt_ms: 320, lapse_rate: 0.05 },
      { median_rt_ms: 900, lapse_rate: 0.4 },
    ];

    const db = {
      prepare: vi.fn((sql: string) => {
        let binds: unknown[] = [];
        const statement = {
          bind: (...values: unknown[]) => {
            binds = values;
            return statement;
          },
          first: async () => {
            queries.push({ sql, binds });
            return { total: 7 };
          },
          all: async () => {
            queries.push({ sql, binds });
            return { results: rows };
          },
        };
        return statement;
      }),
    } as unknown as D1Database;

    const snapshot = await getReadinessBaselineSnapshot(db, 7, 70, '2026-08-27');

    expect(snapshot).toEqual({ sessions: 7, medianRtMs: 310, lapseRate: 0.1 });
    expect(queries).toHaveLength(2);
    for (const query of queries) {
      expect(query.sql).toContain('empresa_id = ?');
      expect(query.sql).toContain('funcionario_id = ?');
      expect(query.sql).toContain('response_trials > 0');
      expect(query.sql).toContain('reference_date < ?');
      expect(query.binds.slice(0, 4)).toEqual([7, 70, '2026-08-27', '2026-08-27']);
    }
    expect(queries[1].binds[4]).toBe(5);
  });
});
