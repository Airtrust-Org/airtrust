/**
 * FRMS V3 — Privacy-preserving, read-only evidence inventory for the IMA
 * feasibility study. No tenant query or persistence belongs in this module.
 * Caller is responsible for authorized tenant-scoped retrieval, deduplication,
 * day scope and confidentiality before passing rows here.
 *
 * A daily sleep duration does NOT establish a time-stamped sleep/wake timeline
 * suitable for a biomathematical model, even when the daily value is marked REAL.
 */
export type ImaDailySource = 'REAL' | 'ESTIMADO' | 'AUSENTE';
export type ImaCheckinSource = 'RECEBIDO' | 'PENDENTE' | 'AUSENTE' | 'NAO_APLICAVEL';
/** Explicit provenance of BOTH boundaries; computed bedtimes never become observed sleep. */
export type ImaSleepWindowProvenance = 'CREW_REPORTED' | 'DERIVED' | 'ESTIMATED' | 'UNKNOWN';

export interface ImaDailyDataEvidence {
  sleepDataSource: ImaDailySource;
  wakeDataSource: ImaDailySource;
  dutyDataSource: 'REAL' | 'MANUAL' | 'ESTIMADO' | 'AUSENTE' | 'INCONSISTENTE';
  checkinStatus: ImaCheckinSource;
  /** Do not use zeros as evidence of no sleep or no fatigue. */
  sleepHours24h: number | null;
  kssScore: number | null;
  /** Human-reported start/end of an actual sleep episode, if they exist. */
  observedSleepStartAt: string | null;
  observedSleepEndAt: string | null;
  /** A reported bed/wake window is not proof of uninterrupted sleep or a full wake timeline. */
  sleepEpisodeProvenance?: ImaSleepWindowProvenance;
  /** Does NOT mean PVT-60s is clinically validated. */
  readinessBaselineReady: boolean | null;
}

export interface ImaDataReadinessAudit {
  sampleSize: number;
  knownDutyRows: number;
  realSleepDurationRows: number;
  wakeEvidenceRows: number;
  knownKssRows: number;
  datedSleepEpisodeRows: number;
  unprovenSleepWindowRows: number;
  readyPvtBaselineRows: number;
  pendingCheckinRows: number;
  sourceGapRows: number;
  estimatedSourceRows: number;
  /** null on empty sample rather than falsely claiming 100% coverage. */
  sleepDurationCoveragePct: number | null;
  datedSleepEpisodeCoveragePct: number | null;
  assessment: 'NO_SAMPLE' | 'INSUFFICIENT_SLEEP_TIMELINE' | 'HISTORICAL_DATA_AUDIT_NEEDED';
  /** Not a fatigue score and not a green clearance state. */
  blockerCodes: string[];
}

function coverage(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : null;
}

function hasValidEpisode(start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(start) || !/(Z|[+-]\d{2}:\d{2})$/i.test(end)) return false;
  const a = Date.parse(start);
  const b = Date.parse(end);
  // This check is only data hygiene, not a physiologic test or proof of continuity.
  return Number.isFinite(a) && Number.isFinite(b) && b > a && b - a <= 24 * 3_600_000;
}

/** Verifies data hygiene + explicit crew origin; NOT objective physiological validation. */
export function hasCrewReportedSleepWindow(row: ImaDailyDataEvidence): boolean {
  return row.sleepDataSource === 'REAL' &&
    typeof row.sleepHours24h === 'number' &&
    Number.isFinite(row.sleepHours24h) &&
    row.sleepHours24h > 0 && row.sleepHours24h <= 24 &&
    row.sleepEpisodeProvenance === 'CREW_REPORTED' &&
    hasValidEpisode(row.observedSleepStartAt, row.observedSleepEndAt);
}

export function auditImaDailyEvidence(rows: readonly ImaDailyDataEvidence[]): ImaDataReadinessAudit {
  const sampleSize = rows.length;
  let knownDutyRows = 0;
  let realSleepDurationRows = 0;
  let wakeEvidenceRows = 0;
  let knownKssRows = 0;
  let datedSleepEpisodeRows = 0;
  let unprovenSleepWindowRows = 0;
  let readyPvtBaselineRows = 0;
  let pendingCheckinRows = 0;
  let sourceGapRows = 0;
  let estimatedSourceRows = 0;

  for (const row of rows) {
    const dutyKnown = row.dutyDataSource === 'REAL' || row.dutyDataSource === 'MANUAL';
    const sleepKnown = row.sleepDataSource === 'REAL' &&
      typeof row.sleepHours24h === 'number' &&
      Number.isFinite(row.sleepHours24h) &&
      row.sleepHours24h > 0 && row.sleepHours24h <= 24;
    const wakeKnown = row.wakeDataSource === 'REAL';
    if (dutyKnown) knownDutyRows++;
    if (sleepKnown) realSleepDurationRows++;
    if (wakeKnown) wakeEvidenceRows++;
    if (Number.isInteger(row.kssScore) && (row.kssScore ?? 0) >= 1 && (row.kssScore ?? 0) <= 9) knownKssRows++;
    if (hasCrewReportedSleepWindow(row)) datedSleepEpisodeRows++;
    if ((row.observedSleepStartAt || row.observedSleepEndAt) && !hasCrewReportedSleepWindow(row)) unprovenSleepWindowRows++;
    if (row.readinessBaselineReady === true) readyPvtBaselineRows++;
    if (row.checkinStatus === 'PENDENTE') pendingCheckinRows++;
    if (!dutyKnown || !sleepKnown || !wakeKnown || row.checkinStatus === 'AUSENTE') sourceGapRows++;
    if (row.dutyDataSource === 'ESTIMADO' ||
        row.sleepDataSource === 'ESTIMADO' || row.wakeDataSource === 'ESTIMADO' ||
        row.sleepEpisodeProvenance === 'DERIVED' || row.sleepEpisodeProvenance === 'ESTIMATED') estimatedSourceRows++;
  }

  const blockerCodes: string[] = [];
  let assessment: ImaDataReadinessAudit['assessment'] = 'HISTORICAL_DATA_AUDIT_NEEDED';
  if (sampleSize === 0) {
    assessment = 'NO_SAMPLE';
    blockerCodes.push('SEM_AMOSTRA_HISTORICA');
  } else if (datedSleepEpisodeRows < sampleSize) {
    assessment = 'INSUFFICIENT_SLEEP_TIMELINE';
    blockerCodes.push('SONO_DIARIO_NAO_COMPROVA_CRONOLOGIA_DE_SONO_VIGILIA');
  }
  if (sampleSize > 0 && sourceGapRows > 0) blockerCodes.push('FONTES_INCOMPLETAS');
  if (unprovenSleepWindowRows > 0) blockerCodes.push('HORARIO_DE_SONO_DERIVADO_OU_SEM_ORIGEM_CONFIRMADA');
  if (sampleSize > 0 && readyPvtBaselineRows < sampleSize) blockerCodes.push('BASELINE_PVT_NAO_UNIVERSAL');

  return {
    sampleSize,
    knownDutyRows,
    realSleepDurationRows,
    wakeEvidenceRows,
    knownKssRows,
    datedSleepEpisodeRows,
    unprovenSleepWindowRows,
    readyPvtBaselineRows,
    pendingCheckinRows,
    sourceGapRows,
    estimatedSourceRows,
    sleepDurationCoveragePct: coverage(realSleepDurationRows, sampleSize),
    datedSleepEpisodeCoveragePct: coverage(datedSleepEpisodeRows, sampleSize),
    assessment,
    blockerCodes,
  };
}
