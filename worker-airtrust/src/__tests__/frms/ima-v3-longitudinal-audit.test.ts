import { describe, expect, it } from 'vitest';
import {
  auditImaLongitudinalEvidence,
  type ImaLongitudinalEvidenceRow,
} from '../../lib/frms/ima-v3-longitudinal-audit';
import type { ImaDailyDataEvidence } from '../../lib/frms/ima-v3-evidence-audit';

const DAY_MS = 86_400_000;
const BASE_DAY = Date.parse('2026-09-26T12:00:00Z');
const dateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const fullDay = (dayIndex: number): ImaDailyDataEvidence => {
  const date = BASE_DAY + dayIndex * DAY_MS;
  return {
    sleepDataSource: 'REAL',
    wakeDataSource: 'REAL',
    dutyDataSource: 'REAL',
    checkinStatus: 'RECEBIDO',
    sleepHours24h: 8,
    kssScore: 3,
    observedSleepStartAt: `${dateOnly(date - DAY_MS)}T22:00:00-03:00`,
    observedSleepEndAt: `${dateOnly(date)}T06:00:00-03:00`,
    sleepEpisodeProvenance: 'CREW_REPORTED',
    readinessBaselineReady: true,
  };
};

const record = (subject: string, index: number): ImaLongitudinalEvidenceRow => ({
  subjectKey: subject,
  operationalDate: dateOnly(BASE_DAY + index * DAY_MS),
  evidence: fullDay(index),
});
const series = (subject: string, ...indices: number[]) => indices.map((index) => record(subject, index));

describe('FRMS V3 longitudinal IMA data feasibility — read-only and no identifiers in output', () => {
  it('marks empty cohorts unknown rather than calibrated or safe', () => {
    const value = auditImaLongitudinalEvidence([]);
    expect(value).toMatchObject({
      inputRows: 0,
      distinctSubjects: 0,
      distinctSubjectDays: 0,
      sevenDayConsecutiveDateWindows: 0,
      sevenDayCrewReportedWindowCandidates: 0,
      state: 'NO_SAMPLE',
      operationalModelReady: false,
    });
    expect(value.dailyCoverage.sleepDurationCoveragePct).toBeNull();
    expect(value.blockers).toContain('CRONOLOGIA_COMPLETA_DE_VIGILIA_NAO_COMPROVADA');
  });

  it('counts seven reported days across calendar months but NEVER asserts 168h wake/sleep', () => {
    const value = auditImaLongitudinalEvidence(series('transient-pseudonym-A', 0, 1, 2, 3, 4, 5, 6));
    expect(value).toMatchObject({
      inputRows: 7,
      distinctSubjects: 1,
      distinctSubjectDays: 7,
      sevenDayConsecutiveDateWindows: 1,
      sevenDayCrewReportedWindowCandidates: 1,
      subjectsWithCandidateWindows: 1,
      operationalModelReady: false,
      state: 'SLEEP_WAKE_CHRONOLOGY_NOT_VERIFIED',
    });
    expect(value.dailyCoverage.datedSleepEpisodeCoveragePct).toBe(100);
    expect(JSON.stringify(value)).not.toContain('transient-pseudonym-A');
    expect(Object.keys(value)).not.toContain('subjectKey');
  });

  it('counts overlapping seven-day research windows for eight days without producing a score', () => {
    const value = auditImaLongitudinalEvidence(series('one', 0, 1, 2, 3, 4, 5, 6, 7));
    expect(value.sevenDayConsecutiveDateWindows).toBe(2);
    expect(value.sevenDayCrewReportedWindowCandidates).toBe(2);
    expect(value.subjectsWithCandidateWindows).toBe(1);
    expect(value.operationalModelReady).toBe(false);
  });

  it('quarantines duplicate subject-day pairs even when the two rows look identical', () => {
    const records = series('crew', 0, 1, 2, 3, 4, 5, 6);
    records.push(record('crew', 3));
    const value = auditImaLongitudinalEvidence(records);
    expect(value).toMatchObject({
      inputRows: 8,
      distinctSubjectDays: 7,
      conflictingDuplicateRows: 1,
      sevenDayConsecutiveDateWindows: 1,
      sevenDayCrewReportedWindowCandidates: 0,
      state: 'DUPLICATE_DAYS_REQUIRE_RECONCILIATION',
      operationalModelReady: false,
    });
    expect(value.dailyCoverage.sampleSize).toBe(6);
    expect(value.blockers).toContain('DIAS_DUPLICADOS_EXCLUIDOS');
  });

  it('does not confuse seven isolated check-ins with seven consecutive days', () => {
    const value = auditImaLongitudinalEvidence(series('crew', 0, 1, 2, 4, 5, 6, 7));
    expect(value.sevenDayConsecutiveDateWindows).toBe(0);
    expect(value.sevenDayCrewReportedWindowCandidates).toBe(0);
    expect(value.state).toBe('INSUFFICIENT_REPORTED_WINDOWS');
  });

  it('rejects estimated, inferred or provenance-free bedtimes from candidate windows', () => {
    const rows = series('crew', 0, 1, 2, 3, 4, 5, 6);
    rows[3] = {
      ...rows[3],
      evidence: { ...rows[3].evidence, sleepEpisodeProvenance: 'DERIVED' },
    };
    const value = auditImaLongitudinalEvidence(rows);
    expect(value.sevenDayConsecutiveDateWindows).toBe(1);
    expect(value.sevenDayCrewReportedWindowCandidates).toBe(0);
    expect(value.dailyCoverage.unprovenSleepWindowRows).toBe(1);
    expect(value.dailyCoverage.estimatedSourceRows).toBe(1);
  });

  it('does not count a copied episode from another day or overlapping nights', () => {
    const wrongDay = series('crew', 0, 1, 2, 3, 4, 5, 6);
    wrongDay[4] = {
      ...wrongDay[4],
      evidence: { ...wrongDay[4].evidence, ...{
        observedSleepStartAt: wrongDay[3].evidence.observedSleepStartAt,
        observedSleepEndAt: wrongDay[3].evidence.observedSleepEndAt,
      } },
    };
    expect(auditImaLongitudinalEvidence(wrongDay).sevenDayCrewReportedWindowCandidates).toBe(0);

    const overlaps = series('crew', 0, 1, 2, 3, 4, 5, 6);
    const d = dateOnly(BASE_DAY + 3 * DAY_MS);
    overlaps[3] = {
      ...overlaps[3],
      evidence: {
        ...overlaps[3].evidence,
        observedSleepStartAt: `${dateOnly(BASE_DAY + 2 * DAY_MS)}T20:00:00-03:00`,
        observedSleepEndAt: `${d}T23:00:00-03:00`,
      },
    };
    // Above spans 27 hours: rejected by the daily data hygiene rule.
    expect(auditImaLongitudinalEvidence(overlaps).sevenDayCrewReportedWindowCandidates).toBe(0);
  });

  it('rejects invalid calendar dates and missing transient keys without echoing identifiers', () => {
    expect(() => auditImaLongitudinalEvidence([{
      ...record('crew', 0), operationalDate: '2026-02-30',
    }])).toThrow('IMA_INVALID_OPERATIONAL_DATE');
    expect(() => auditImaLongitudinalEvidence([{
      ...record('crew', 0), subjectKey: '',
    }])).toThrow('IMA_SUBJECT_PSEUDONYM_REQUIRED');
  });
});
