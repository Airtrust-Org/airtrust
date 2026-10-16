import { describe, expect, it, vi } from 'vitest';
import {
  IMA_COHORT_CHECKIN_SQL,
  IMA_COHORT_JOURNEY_SQL,
  lastClosedMonthWindow,
  loadImaCohortEvidenceRows,
} from '../../lib/frms/ima-v3-cohort-reader';
import { auditImaCohortEvidence } from '../../lib/frms/ima-v3-cohort-evidence';

function fakeDb(
  checkins: Array<Record<string, unknown>>,
  journeys: Array<Record<string, unknown>>,
) {
  const prepare = vi.fn((sql: string) => {
    const isCheckin = sql.includes('FROM frms_fadiga_checkin ch');
    if (!isCheckin && !sql.includes('FROM frms_jornada j')) {
      throw new Error('UNEXPECTED_SQL');
    }
    return {
      bind: (...values: unknown[]) => {
        expect(values).toEqual([6, '2026-09-01', '2026-09-30']);
        return { all: async () => ({ results: isCheckin ? checkins : journeys }) };
      },
    };
  });
  return { db: { prepare } as unknown as D1Database, prepare };
}

describe('FRMS IMA V3 cohort scan — bounded, read-only, tenant-only', () => {
  it('uses only two SELECT queries with employee and tenant guards', () => {
    for (const sql of [IMA_COHORT_CHECKIN_SQL, IMA_COHORT_JOURNEY_SQL]) {
      expect(sql).toMatch(/^SELECT\s/i);
      expect(sql).toContain('empresa_id = ?');
      expect(sql).toContain('f.empresa_id =');
      expect(sql).toContain('LIMIT 15001');
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP)\s+/i);
    }
  });

  it('fixes 30/60/90-day coverage at last closed calendar month end', () => {
    expect(lastClosedMonthWindow(new Date('2026-10-15T21:00:00Z'), 30))
      .toEqual({ startDate: '2026-09-01', endDate: '2026-09-30', windowDays: 30 });
    expect(lastClosedMonthWindow(new Date('2026-10-15T21:00:00Z'), 60).startDate)
      .toBe('2026-08-02');
    expect(lastClosedMonthWindow(new Date('2026-10-15T21:00:00Z'), 90).startDate)
      .toBe('2026-07-03');
    expect(() => lastClosedMonthWindow(new Date('invalid'), 30))
      .toThrow('IMA_COHORT_WINDOW_NOT_APPROVED');
  });

  it('deduplicates legitimate multi-leg jornadas but not duplicate check-ins', async () => {
    const { db, prepare } = fakeDb([
      { funcionario_id: 42, data_operacional: '2026-09-01', horas_sono: 7,
        wake_time: '06:20', kss_score: 4 },
    ], [
      { funcionario_id: 42, data_operacional: '2026-09-01' },
      { funcionario_id: 42, data_operacional: '2026-09-01' },
      { funcionario_id: 43, data_operacional: '2026-09-01' },
    ]);
    const rows = await loadImaCohortEvidenceRows(db, 6, '2026-09-01', '2026-09-30');
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      funcionario_id: 42, checkin_status: 'RECEBIDO',
      sleep_data_source: 'REAL', wake_data_source: 'REAL',
      teve_jornada: true, jornada_data_source: 'MANUAL',
      operational_data_source: 'AUSENTE',
    });
    expect(rows[1]).toMatchObject({
      funcionario_id: 43, checkin_status: 'AUSENTE',
      teve_jornada: true, sleep_data_source: 'AUSENTE',
    });
  });

  it('rejects duplicate check-ins and refuses to release any aggregated evidence', async () => {
    const checkin = {
      funcionario_id: 42, data_operacional: '2026-09-01',
      horas_sono: 7, wake_time: '06:00', kss_score: 3,
    };
    const { db } = fakeDb([checkin, checkin], []);
    await expect(loadImaCohortEvidenceRows(db, 6, '2026-09-01', '2026-09-30'))
      .rejects.toThrow('IMA_COHORT_DUPLICATE_CHECKIN');
  });

  it('treats missing wake and impossible sleep/KSS as missing evidence', async () => {
    const { db } = fakeDb([
      { funcionario_id: 42, data_operacional: '2026-09-01',
        horas_sono: -8, wake_time: '25:00', kss_score: 0 },
    ], []);
    const rows = await loadImaCohortEvidenceRows(db, 6, '2026-09-01', '2026-09-30');
    const report = auditImaCohortEvidence({
      expectedEmpresaId: 6, startDate: '2026-09-01',
      endDate: '2026-09-30', rows, boundaryProvenanceUnavailable: true,
    });
    expect(rows[0]).toMatchObject({
      sleep_data_source: 'AUSENTE', wake_data_source: 'AUSENTE',
      jornada_data_source: 'AUSENTE',
    });
    expect(report.state).toBe('PRIVACY_SUPPRESSED');
    expect(report.reconstructedDutyBoundaryPctApprox).toBeNull();
  });

  it('rejects requests without a valid tenant BEFORE opening the database', async () => {
    const { db, prepare } = fakeDb([], []);
    await expect(loadImaCohortEvidenceRows(db, 0, '2026-09-01', '2026-09-30'))
      .rejects.toThrow('IMA_COHORT_TENANT_REQUIRED');
    expect(prepare).not.toHaveBeenCalled();
  });
});
