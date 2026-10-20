import { describe, expect, it } from 'vitest';
import { loadBoaMonthlyManagementPreview } from '../../lib/frms/bombeiros-monthly-management-report';

const crew = new Set([10, 11, 12, 13, 14, 15]);
type Period = {
  receipt_count: number; unique_person_days: number; participants: number; opened: number;
  untreated: number; treating: number; closed: number; invalid: number;
};
const verified: Period = {
  receipt_count: 21, unique_person_days: 21, participants: 6, opened: 21,
  untreated: 11, treating: 5, closed: 5, invalid: 0,
};
function dbRows(rows: Period[]) {
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  let index = 0;
  const db = {
    prepare(sql: string) {
      const statement = { sql, args: [] as unknown[] };
      statements.push(statement);
      return {
        bind(...args: unknown[]) {
          statement.args = args;
          return { async first() { return rows[index++]; } };
        },
      };
    },
  } as unknown as D1Database;
  return { db, statements };
}

describe('BOA monthly managerial/technical evidence preview — source and privacy', () => {
  it('blocks Costa do Sol, invalid month and small authorized cohort before D1', async () => {
    const { db, statements } = dbRows([]);
    await expect(loadBoaMonthlyManagementPreview(db, 6, '2026-10', crew))
      .rejects.toThrow('BOA_REPORT_TENANT_REQUIRED');
    await expect(loadBoaMonthlyManagementPreview(db, 130, '2026-13', crew))
      .rejects.toThrow('BOA_REPORT_MONTH_INVALID');
    await expect(loadBoaMonthlyManagementPreview(db, 130, '2026-10', new Set([1, 2, 3, 4])))
      .rejects.toThrow('BOA_REPORT_SMALL_AUTHORIZED_COHORT');
    expect(statements).toHaveLength(0);
  });

  it('executes separate month-scoped, tenant-scoped read-only queries for BOA event cases', async () => {
    const { db, statements } = dbRows([verified, {
      receipt_count: 15, unique_person_days: 15, participants: 6, opened: 15,
      untreated: 5, treating: 5, closed: 5, invalid: 0,
    }]);
    const report = await loadBoaMonthlyManagementPreview(db, 130, '2026-10', crew);
    expect(statements).toHaveLength(2);
    expect(statements[0].args).toEqual([
      130, 130, 'BOA_CHECKIN_V1', 'BOA_CHECKIN_V1',
      '2026-10-01', '2026-11-01', 10, 11, 12, 13, 14, 15,
      130, 'BOA_CASE_OPENED_V1', 'BOA_CASE_TREATMENT_V1', 'BOA_CASE_CLOSED_V1',
    ]);
    expect(statements[1].args).toEqual([
      130, 130, 'BOA_CHECKIN_V1', 'BOA_CHECKIN_V1',
      '2026-09-01', '2026-10-01', 10, 11, 12, 13, 14, 15,
      130, 'BOA_CASE_OPENED_V1', 'BOA_CASE_TREATMENT_V1', 'BOA_CASE_CLOSED_V1',
    ]);
    expect(statements[0].sql).toContain('f.empresa_id = e.empresa_id');
    expect(statements[0].sql).toContain('o.empresa_id = ?');
    expect(statements[0].sql).toContain('treatment.empresa_id = o.empresa_id');
    expect(statements[0].sql).toContain('closure.empresa_id = o.empresa_id');
    expect(statements[0].sql).toContain('f.id IN (?, ?, ?, ?, ?, ?)');
    expect(statements[0].sql).not.toMatch(/HELICOPTER_OFFSHORE|frms_alerta|frms_fadiga_checkin/);
    expect(report.current).toMatchObject({
      month: '2026-10', participants: 6, checkin_receipts: 21,
      cases: { opened: 21, awaiting_treatment: 11, under_treatment: 5,
        closed_with_efficacy: 5, privacy: 'OBSERVED' },
    });
    expect(report.receipt_delta).toBe(6);
    expect(report.state).toBe('UNSIGNED_UNVALIDATED_PREVIEW');
    expect(report.provenance).toMatchObject({ signed: false, stored: false });
    expect(JSON.stringify(report)).not.toMatch(/funcionario_id|nome_guerra|kss_reported|sleep_hours_24h/);
  });

  it('suppresses everything when participation is 1–4, even if check-in count is large', async () => {
    const { db } = dbRows([
      { receipt_count: 29, unique_person_days: 29, participants: 1, opened: 29,
        untreated: 29, treating: 0, closed: 0, invalid: 0 },
      verified,
    ]);
    const report = await loadBoaMonthlyManagementPreview(db, 130, '2026-10', crew);
    expect(report.current.participants).toBeNull();
    expect(report.current.checkin_receipts).toBeNull();
    expect(report.current.cases.opened).toBeNull();
    expect(report.receipt_delta).toBeNull();
  });

  it('hides the entire distribution when one category has a small cell', async () => {
    const { db } = dbRows([
      { receipt_count: 6, unique_person_days: 6, participants: 6, opened: 6,
        untreated: 4, treating: 1, closed: 1, invalid: 0 },
      verified,
    ]);
    const report = await loadBoaMonthlyManagementPreview(db, 130, '2026-10', crew);
    expect(report.current.checkin_receipts).toBe(6);
    expect(report.current.cases).toEqual({
      opened: null, awaiting_treatment: null, under_treatment: null,
      closed_with_efficacy: null, privacy: 'SMALL_CELL_SUPPRESSED',
    });
  });

  it('does not misrepresent no observations as complete reporting', async () => {
    const empty: Period = {
      receipt_count: 0, unique_person_days: 0, participants: 0, opened: 0,
      untreated: 0, treating: 0, closed: 0, invalid: 0,
    };
    const { db } = dbRows([empty, empty]);
    const report = await loadBoaMonthlyManagementPreview(db, 130, '2026-10', crew);
    expect(report.current.cases.privacy).toBe('NO_RECEIPTS');
    expect(report.coverage).toBe('NOT_DETERMINABLE_WITHOUT_ROSTER');
    expect(report.technical_caveats.join(' ')).toMatch(/não taxa de adesão|não é persistido/i);
  });

  it('rejects repeated check-in receipts for the same employee and day', async () => {
    const { db } = dbRows([
      { receipt_count: 6, unique_person_days: 5, participants: 5,
        opened: 6, untreated: 6, treating: 0, closed: 0, invalid: 0 },
      verified,
    ]);
    await expect(loadBoaMonthlyManagementPreview(db, 130, '2026-10', crew))
      .rejects.toThrow('BOA_MONTHLY_CASE_STREAM_INTEGRITY_ERROR');
  });

  it.each([
    { receipt_count: 5, unique_person_days: 5, participants: 5, opened: 4, untreated: 4,
      treating: 0, closed: 0, invalid: 1 },
    { receipt_count: 5, unique_person_days: 5, participants: 6, opened: 5, untreated: 5,
      treating: 0, closed: 0, invalid: 0 },
    { receipt_count: 5, unique_person_days: 5, participants: 5, opened: 5, untreated: 0,
      treating: 0, closed: 6, invalid: 0 },
  ])('refuses broken provenance instead of exporting plausible numbers', async row => {
    const { db } = dbRows([row, verified]);
    await expect(loadBoaMonthlyManagementPreview(db, 130, '2026-10', crew))
      .rejects.toThrow('BOA_MONTHLY_CASE_STREAM_INTEGRITY_ERROR');
  });
});
