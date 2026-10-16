import { describe, expect, it } from 'vitest';
import {
  auditImaCohortEvidence,
  type ImaCohortSourceRow,
} from '../../lib/frms/ima-v3-cohort-evidence';

const START = '2026-09-01';
const END = '2026-09-30';
const makeRow = (
  crew: number, date = START,
  changes: Partial<ImaCohortSourceRow> = {},
): ImaCohortSourceRow => ({
  empresa_id: 6,
  funcionario_id: crew,
  data_operacional: date,
  checkin_status: 'RECEBIDO',
  sleep_data_source: 'REAL',
  wake_data_source: 'REAL',
  horas_sono: 7.5,
  kss_score: 4,
  teve_jornada: true,
  jornada_data_source: 'REAL',
  operational_data_source: 'CONTROLE_VOOS',
  ...changes,
});
const cohort = (n: number) =>
  Array.from({ length: n }, (_, i) => makeRow(100 + i));
const audit = (rows: readonly ImaCohortSourceRow[], startDate = START, endDate = END) =>
  auditImaCohortEvidence({ expectedEmpresaId: 6, startDate, endDate, rows });

describe('IMA V3 cohort historical evidence inventory — privacy and scientific limits', () => {
  it('suppress all count and percentage metrics for fewer than ten distinct people', () => {
    const report = audit(cohort(9));
    expect(report).toMatchObject({
      state: 'PRIVACY_SUPPRESSED', minCrewForRelease: 10,
      approximateCrew: null, approximateCrewDays: null,
      checkinReceivedPctApprox: null, realSleepDurationPctApprox: null,
      realWakeReportPctApprox: null, validKssPctApprox: null,
      sourceIncompletePctApprox: null, reconstructedDutyBoundaryPctApprox: null,
      verifiedSleepEpisodePct: null, validatedPvtBaselinePct: null,
      physiologicalImaScore: null, operationalFitness: 'NOT_ASSESSED',
      methodologyStatus: 'NOT_VALIDATED',
    });
    expect(report.blockers).toContain('PRIVACIDADE_COORTE_INSUFICIENTE');
    expect(JSON.stringify(report)).not.toContain('funcionario_id');
  });

  it('does not equate many rows for one person with ten people', () => {
    const records = Array.from({ length: 30 }, (_, i) => makeRow(
      100, new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10),
    ));
    expect(audit(records).state).toBe('PRIVACY_SUPPRESSED');
    expect(audit(records).approximateCrewDays).toBeNull();
  });

  it('returns only approximate aggregate coverage with >=ten people, not sleep readiness', () => {
    const records = cohort(13);
    const report = audit(records);
    expect(report).toMatchObject({
      state: 'AGGREGATED_RESEARCH_COVERAGE',
      approximateCrew: 15, approximateCrewDays: 10,
      checkinReceivedPctApprox: 100, realSleepDurationPctApprox: 100,
      realWakeReportPctApprox: 100, validKssPctApprox: 100,
      reconstructedDutyBoundaryPctApprox: 100,
      sourceIncompletePctApprox: 0,
      verifiedSleepEpisodePct: null, validatedPvtBaselinePct: null,
      physiologicalImaScore: null, operationalFitness: 'NOT_ASSESSED',
    });
    expect(JSON.stringify(report)).not.toContain('"funcionario_id"');
    expect(JSON.stringify(report)).not.toContain('"empresa_id"');
    expect(JSON.stringify(report)).not.toContain('"data_operacional"');
    expect(JSON.stringify(report)).not.toContain('2026-09-01');
  });

  it('never credits pending check-ins, missing sleep or nonnumeric KSS', () => {
    const rows = cohort(10);
    rows[0] = makeRow(100, START, { checkin_status: 'PENDENTE' });
    rows[1] = makeRow(101, START, { horas_sono: 0 });
    rows[2] = makeRow(102, START, { kss_score: 10 });
    rows[3] = makeRow(103, START, { wake_data_source: 'ESTIMADO' });
    const report = audit(rows);
    expect(report).toMatchObject({
      checkinReceivedPctApprox: 90,
      realSleepDurationPctApprox: 80,
      validKssPctApprox: 80,
      realWakeReportPctApprox: 80,
      sourceIncompletePctApprox: 40,
    });
    expect(report.blockers).toContain('FONTES_DE_DADOS_INCOMPLETAS');
  });

  it('does not classify valid check-ins on non-duty days as missing duty evidence', () => {
    const rows = cohort(10).map((r) => ({
      ...r, teve_jornada: false, jornada_data_source: 'AUSENTE' as const,
      operational_data_source: 'AUSENTE' as const,
    }));
    const report = audit(rows);
    expect(report.sourceIncompletePctApprox).toBe(0);
    expect(report.realSleepDurationPctApprox).toBe(100);
  });

  it('handles 30, 60 and 90 day windows without exposing dates or crew', () => {
    expect(audit(cohort(10), START, END).windowDays).toBe(30);
    expect(audit(cohort(10), '2026-08-02', END).windowDays).toBe(60);
    expect(audit(cohort(10), '2026-07-03', END).windowDays).toBe(90);
    expect(() => audit(cohort(10), '2026-09-02', END)).toThrow('IMA_COHORT_WINDOW_NOT_APPROVED');
  });

  it('rejects any cross-tenant person and any out-of-range day before releasing aggregates', () => {
    expect(() => audit([...cohort(10), makeRow(200, START, { empresa_id: 7 })]))
      .toThrow('IMA_COHORT_CROSS_TENANT');
    expect(() => audit([...cohort(10), makeRow(200, '2026-10-01')]))
      .toThrow('IMA_COHORT_DAY_OUTSIDE_SCOPE');
    expect(() => audit(cohort(10), '2026-02-30', '2026-03-31'))
      .toThrow('IMA_COHORT_INVALID_DATE');
  });

  it('rejects even identical duplicated crew-day entries, rather than silently taking one', () => {
    expect(() => audit([...cohort(10), makeRow(100)]))
      .toThrow('IMA_COHORT_DUPLICATE_CREW_DAY');
    expect(() => audit([makeRow(0)])).toThrow('IMA_COHORT_INVALID_CREW');
    expect(() => auditImaCohortEvidence({
      expectedEmpresaId: 0, startDate: START, endDate: END, rows: cohort(10),
    })).toThrow('IMA_COHORT_TENANT_REQUIRED');
  });

  it('rejects input bulk overflow before reading or returning any aggregate', () => {
    const excessive = Array.from({ length: 15_001 }, (_, i) => makeRow(
      100 + Math.floor(i / 30),
      new Date(Date.UTC(2026, 8, 1 + i % 30)).toISOString().slice(0, 10),
    ));
    expect(() => audit(excessive)).toThrow('IMA_COHORT_ROW_LIMIT_EXCEEDED');
  });

  it('never asserts actual physiological recovery from hours off or a reported sleep value', () => {
    const rows = cohort(10).map((row) => ({ ...row,
      teve_jornada: false, jornada_data_source: 'AUSENTE' as const,
      operational_data_source: 'AUSENTE' as const,
    }));
    const r = audit(rows);
    expect(r.reconstructedDutyBoundaryPctApprox).toBe(0);
    expect(r.verifiedSleepEpisodePct).toBeNull();
    expect(r.physiologicalImaScore).toBeNull();
    expect(r.operationalFitness).toBe('NOT_ASSESSED');
  });
});
