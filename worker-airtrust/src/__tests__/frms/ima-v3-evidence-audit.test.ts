import { describe, expect, it } from 'vitest';
import {
  auditImaDailyEvidence,
  type ImaDailyDataEvidence,
} from '../../lib/frms/ima-v3-evidence-audit';

const sample: ImaDailyDataEvidence = {
  sleepDataSource: 'REAL',
  wakeDataSource: 'REAL',
  dutyDataSource: 'REAL',
  checkinStatus: 'RECEBIDO',
  sleepHours24h: 8,
  kssScore: 3,
  observedSleepStartAt: null,
  observedSleepEndAt: null,
  sleepEpisodeProvenance: 'UNKNOWN',
  readinessBaselineReady: true,
};

describe('FRMS V3 IMA data feasibility audit', () => {
  it('does not turn no data into perfect coverage or an operational assessment', () => {
    expect(auditImaDailyEvidence([])).toMatchObject({
      sampleSize: 0,
      sleepDurationCoveragePct: null,
      datedSleepEpisodeCoveragePct: null,
      assessment: 'NO_SAMPLE',
      blockerCodes: ['SEM_AMOSTRA_HISTORICA'],
    });
  });

  it('distinguishes reported sleep duration from observed sleep timing', () => {
    expect(auditImaDailyEvidence([sample])).toMatchObject({
      sampleSize: 1,
      realSleepDurationRows: 1,
      sleepDurationCoveragePct: 100,
      datedSleepEpisodeRows: 0,
      datedSleepEpisodeCoveragePct: 0,
      assessment: 'INSUFFICIENT_SLEEP_TIMELINE',
      blockerCodes: [
        'SONO_DIARIO_NAO_COMPROVA_CRONOLOGIA_DE_SONO_VIGILIA',
        'KSS_PERSISTIDO_SEM_ORIGEM_CONFIRMADA',
      ],
    });
  });

  it('does not treat 0 hours, estimated records or an unanswered check-in as observed safety', () => {
    const result = auditImaDailyEvidence([
      sample,
      {
        ...sample,
        sleepHours24h: 0,
        sleepDataSource: 'ESTIMADO',
        dutyDataSource: 'ESTIMADO',
        wakeDataSource: 'AUSENTE',
        checkinStatus: 'PENDENTE',
        kssScore: null,
        readinessBaselineReady: null,
      },
    ]);
    expect(result).toMatchObject({
      sampleSize: 2,
      realSleepDurationRows: 1,
      knownKssRows: 1,
      pendingCheckinRows: 1,
      sourceGapRows: 1,
      estimatedSourceRows: 1,
      sleepDurationCoveragePct: 50,
      datedSleepEpisodeCoveragePct: 0,
    });
    expect(result.blockerCodes).toContain('FONTES_INCOMPLETAS');
    expect(result.blockerCodes).toContain('BASELINE_PVT_NAO_UNIVERSAL');
  });

  it('does not certify a default or derived KSS just because it is within 1–9', () => {
    const audit = auditImaDailyEvidence([
      { ...sample, kssScore: 5 },
      { ...sample, kssScore: 5, kssProvenance: 'DEFAULTED' },
      { ...sample, kssScore: 4, kssProvenance: 'DERIVED' },
      { ...sample, kssScore: 7, kssProvenance: 'CREW_REPORTED' },
    ]);
    expect(audit.knownKssRows).toBe(4);
    expect(audit.confirmedCrewReportedKssRows).toBe(1);
    expect(audit.kssValueWithoutCrewProvenanceRows).toBe(3);
    expect(audit.blockerCodes).toContain('KSS_PERSISTIDO_SEM_ORIGEM_CONFIRMADA');
  });

  it('ignores a filled KSS on a pending check-in even if reported is claimed', () => {
    const audit = auditImaDailyEvidence([
      { ...sample, checkinStatus: 'PENDENTE', kssProvenance: 'CREW_REPORTED' },
    ]);
    expect(audit.knownKssRows).toBe(0);
    expect(audit.confirmedCrewReportedKssRows).toBe(0);
    expect(audit.pendingCheckinRows).toBe(1);
  });

  it('accepts an explicitly timestamped sleep episode only as data hygiene, NOT a validated fatigue model', () => {
    const result = auditImaDailyEvidence([
      {
        ...sample,
        observedSleepStartAt: '2026-10-14T22:00:00-03:00',
        observedSleepEndAt: '2026-10-15T06:00:00-03:00',
        sleepEpisodeProvenance: 'CREW_REPORTED',
      },
    ]);
    expect(result).toMatchObject({
      sampleSize: 1,
      datedSleepEpisodeRows: 1,
      datedSleepEpisodeCoveragePct: 100,
      assessment: 'HISTORICAL_DATA_AUDIT_NEEDED',
    });
  });

  it('rejects computed bedtime as verified sleep even if it forms a neat eight-hour interval', () => {
    const result = auditImaDailyEvidence([
      {
        ...sample,
        observedSleepStartAt: '2026-10-14T22:00:00-03:00',
        observedSleepEndAt: '2026-10-15T06:00:00-03:00',
        sleepEpisodeProvenance: 'DERIVED',
      },
    ]);
    expect(result.datedSleepEpisodeRows).toBe(0);
    expect(result.unprovenSleepWindowRows).toBe(1);
    expect(result.estimatedSourceRows).toBe(1);
    expect(result.blockerCodes).toContain('HORARIO_DE_SONO_DERIVADO_OU_SEM_ORIGEM_CONFIRMADA');
  });

  it('rejects unmarked check-in timestamps rather than assuming crew provenance', () => {
    const result = auditImaDailyEvidence([
      {
        ...sample,
        observedSleepStartAt: '2026-10-14T22:00:00-03:00',
        observedSleepEndAt: '2026-10-15T06:00:00-03:00',
      },
    ]);
    expect(result.datedSleepEpisodeCoveragePct).toBe(0);
    expect(result.assessment).toBe('INSUFFICIENT_SLEEP_TIMELINE');
  });

  it('rejects impossible or offset-ambiguous timing without exposing row-level personal data', () => {
    const badRows = [
      {
        ...sample,
        observedSleepStartAt: '2026-10-14T22:00:00',
        observedSleepEndAt: '2026-10-15T06:00:00',
      },
      {
        ...sample,
        observedSleepStartAt: '2026-10-15T06:00:00Z',
        observedSleepEndAt: '2026-10-14T22:00:00Z',
      },
    ];
    const result = auditImaDailyEvidence(badRows);
    expect(result.datedSleepEpisodeRows).toBe(0);
    expect(Object.keys(result)).not.toContain('funcionario_id');
    expect(Object.keys(result)).not.toContain('empresa_id');
    expect(result.assessment).toBe('INSUFFICIENT_SLEEP_TIMELINE');
  });
});
