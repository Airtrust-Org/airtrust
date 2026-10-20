import { describe, expect, it } from 'vitest';
import { loadBombeirosCheckinMonthlyEvidence } from '../../lib/frms/bombeiros-checkin-evidence';

const crew = new Set([10, 11, 12, 13, 14, 15]);
function mockDb(rows: Array<{ receipt_person_days: number; distinct_people: number }>) {
  const queries: { sql: string; args: unknown[] }[] = [];
  let n = 0;
  const db = {
    prepare(sql: string) {
      const query = { sql, args: [] as unknown[] };
      queries.push(query);
      return {
        bind(...args: unknown[]) {
          query.args = args;
          return { async first() { return rows[n++]; } };
        },
      };
    },
  } as unknown as D1Database;
  return { db, queries };
}

describe('BOA/CBMMG check-in monthly evidence — independent of offshore scores', () => {
  it('never executes a query for empresa 6', async () => {
    const { db, queries } = mockDb([]);
    await expect(loadBombeirosCheckinMonthlyEvidence(db, 6, '2026-09', crew))
      .rejects.toThrow('BOMBEIROS_TENANT_REQUIRED');
    expect(queries).toHaveLength(0);
  });

  it('filters BOTH join and checkin by tenant and uses only submitted receipts', async () => {
    const { db, queries } = mockDb([
      { receipt_person_days: 17, distinct_people: 6 },
      { receipt_person_days: 13, distinct_people: 6 },
    ]);
    const data = await loadBombeirosCheckinMonthlyEvidence(db, 130, '2026-09', crew);
    expect(queries).toHaveLength(2);
    expect(queries[0].args).toEqual([130, 130, '2026-09-01', '2026-10-01', 10, 11, 12, 13, 14, 15]);
    expect(queries[1].args).toEqual([130, 130, '2026-08-01', '2026-09-01', 10, 11, 12, 13, 14, 15]);
    expect(queries[0].sql).toContain('e.empresa_id = ?');
    expect(queries[0].sql).toContain('f.empresa_id = ?');
    expect(queries[0].sql).toContain('f.empresa_id = e.empresa_id');
    expect(queries[0].sql).toContain("json_extract(e.payload_json, '$.submitted_at') IS NOT NULL");
    expect(queries[0].sql).toContain("e.tipo = 'BOA_CHECKIN_V1'");
    expect(queries[0].sql).toContain('f.ativo = 1');
    expect(queries[0].sql).not.toMatch(/KSS|PVT|SCORE|HELICOPTER_OFFSHORE|COSTA/i);
    expect(data.current.receipt_person_days).toBe(17);
    expect(data.receipt_person_days_delta).toBe(4);
    expect(JSON.stringify(data)).not.toContain('funcionario_id');
  });

  it('suppresses entire cohort below five without reading D1', async () => {
    const { db, queries } = mockDb([]);
    const data = await loadBombeirosCheckinMonthlyEvidence(db, 130, '2026-09', new Set([11, 12]));
    expect(data.current.privacy_state).toBe('SMALL_COHORT_SUPPRESSED');
    expect(data.current.receipt_person_days).toBeNull();
    expect(queries).toHaveLength(0);
  });

  it('suppresses a single employee who has 30 check-in days', async () => {
    const { db } = mockDb([
      { receipt_person_days: 30, distinct_people: 1 },
      { receipt_person_days: 28, distinct_people: 1 },
    ]);
    const data = await loadBombeirosCheckinMonthlyEvidence(db, 130, '2026-09', crew);
    expect(data.current.privacy_state).toBe('SMALL_PARTICIPANT_SET_SUPPRESSED');
    expect(data.current.receipt_person_days).toBeNull();
    expect(data.receipt_person_days_delta).toBeNull();
  });

  it('does not convert invalid aggregate values to zero', async () => {
    const { db } = mockDb([
      { receipt_person_days: 3, distinct_people: 5 },
      { receipt_person_days: 0, distinct_people: 0 },
    ]);
    await expect(loadBombeirosCheckinMonthlyEvidence(db, 130, '2026-09', crew))
      .rejects.toThrow('BOMBEIROS_CHECKIN_AGGREGATE_INTEGRITY_ERROR');
  });

  it('handles no records explicitly without claiming compliance', async () => {
    const { db } = mockDb([
      { receipt_person_days: 0, distinct_people: 0 },
      { receipt_person_days: 0, distinct_people: 0 },
    ]);
    const data = await loadBombeirosCheckinMonthlyEvidence(db, 130, '2026-09', crew);
    expect(data.current).toMatchObject({ receipt_person_days: 0, privacy_state: 'NO_RECEIPTS' });
    expect(data.restrictions.join(' ')).toContain('não confirma completude');
  });
});
