import { describe, expect, it, vi } from 'vitest';
import { getReadinessBaselineSnapshot, prepareReadinessAssessmentWrites } from '../../lib/frms/readiness-persistence';

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

    const snapshot = await getReadinessBaselineSnapshot(db, 7, 70, 'airtrust-pvtb-v2', '2026-08-27');

    expect(snapshot).toEqual({ sessions: 7, medianRtMs: 310, lapseRate: 0.1 });
    expect(queries).toHaveLength(2);
    for (const query of queries) {
      expect(query.sql).toContain('empresa_id = ?');
      expect(query.sql).toContain('funcionario_id = ?');
      expect(query.sql).toContain('protocol_version = ?');
      expect(query.sql).toContain('response_trials > 0');
      expect(query.sql).toContain('reference_date < ?');
      expect(query.binds.slice(0, 5)).toEqual([7, 70, 'airtrust-pvtb-v2', '2026-08-27', '2026-08-27']);
    }
    expect(queries[1].binds[5]).toBe(5);
  });

  it('never mixes protocol versions in a baseline snapshot', async () => {
    const seen: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        void sql;
        const statement = {
          bind: (...values: unknown[]) => {
            seen.push(String(values[2]));
            return statement;
          },
          first: async () => ({ total: 3 }),
          all: async () => ({ results: [] }),
        };
        return statement;
      }),
    } as unknown as D1Database;

    await getReadinessBaselineSnapshot(db, 6, 42, 'airtrust-vigilance-v1', '2026-08-27');
    expect(new Set(seen)).toEqual(new Set(['airtrust-vigilance-v1']));
  });
});

describe('FRMS readiness upload protocol integrity', () => {
  const input = {
    empresaId: 7, funcionarioId: 70, userId: 9, checkinId: 'checkin-1',
    referenceDate: '2026-11-03', kssScore: 4, sleepHours: 7,
    durationMs: 60_000,
    trials: Array.from({ length: 10 }, (_, index) => ({
      sequence: index + 1, scheduledAtMs: index * 5_000,
      stimulusAtMs: index * 5_000 + 100, responseAtMs: index * 5_000 + 350,
      reactionTimeMs: 250, outcome: 'response' as const,
    })),
  };
  const neverDb = { prepare: vi.fn() } as unknown as D1Database;

  it.each(['airtrust-pvtb-v2', 'airtrust-vigilance-v1', 'custom-pvt'] as const)(
    'rejects new uploads pretending to use historical protocol %s', async (protocolVersion) => {
      await expect(prepareReadinessAssessmentWrites(neverDb, { ...input, protocolVersion }))
        .rejects.toThrow('invalid_readiness_protocol');
      expect(neverDb.prepare).not.toHaveBeenCalled();
    },
  );

  it('requires a 60 s brief sample within allowed drift and sufficient trials', async () => {
    await expect(prepareReadinessAssessmentWrites(neverDb, { ...input, durationMs: 180_000 }))
      .rejects.toThrow('invalid_duration');
    await expect(prepareReadinessAssessmentWrites(neverDb, { ...input, trials: input.trials.slice(0, 3) }))
      .rejects.toThrow('readiness_trials_required');
    expect(neverDb.prepare).not.toHaveBeenCalled();
  });
});
