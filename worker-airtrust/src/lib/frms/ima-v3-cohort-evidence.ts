/**
 * FRMS V3 — research-only cohort quality inventory, NO BIOMATHEMATICAL SCORE.
 *
 * The calling route must enforce auth, FRMS team RBAC, authorized tenant scope
 * and a bounded date range BEFORE loading any snapshots. This function enforces
 * those invariants again without doing any database I/O.
 *
 * Privacy: the input may carry individual identifiers, but all published
 * metrics are coarsened and only emitted for >= 10 distinct crew members.
 * Suppression blocks low-count cohort disclosure. Do not add any subgroups,
 * per-person details or flexible filters without a new privacy review.
 */
import type { FrmsOperationalSnapshotItem } from './operational-snapshot';

export type ImaCohortSourceRow = Pick<
  FrmsOperationalSnapshotItem,
  | 'empresa_id' | 'funcionario_id' | 'data_operacional'
  | 'checkin_status' | 'horas_sono' | 'sleep_data_source'
  | 'wake_data_source' | 'kss_score' | 'teve_jornada'
  | 'jornada_data_source' | 'operational_data_source'
>;

export interface ImaCohortEvidenceInput {
  expectedEmpresaId: number;
  /** Pre-approved cohort window with no custom grouping (30, 60 or 90 days). */
  startDate: string;
  endDate: string;
  rows: readonly ImaCohortSourceRow[];
  /** True for low-cost checkin/journey query without boundary-level source lineage. */
  boundaryProvenanceUnavailable?: boolean;
}

export interface ImaCohortEvidenceReport {
  state: 'PRIVACY_SUPPRESSED' | 'AGGREGATED_RESEARCH_COVERAGE';
  windowDays: 30 | 60 | 90;
  minCrewForRelease: 10;
  denominatorDefinition: 'CHECKIN_OR_JOURNEY_DAYS_NOT_FULL_ROSTER';
  /** Quantities are rounded; null if the sample fails the privacy threshold. */
  approximateCrew: number | null;
  approximateCrewDays: number | null;
  checkinReceivedPctApprox: number | null;
  realSleepDurationPctApprox: number | null;
  realWakeReportPctApprox: number | null;
  /** Deprecated legacy label: provenance unavailable, so validity cannot be asserted. */
  validKssPctApprox: null;
  /** Valid 1–9 numeric KSS stored in D1. May be derived/defaulted. */
  storedKssValuePctApprox: number | null;
  /** Cannot be inferred from legacy kss_score: no field-level origin persisted. */
  verifiedCrewReportedKssPctApprox: null;
  reconstructedDutyBoundaryPctApprox: number | null;
  sourceIncompletePctApprox: number | null;
  /** The legacy snapshot cannot prove two observed sleep-episode boundaries. */
  verifiedSleepEpisodePct: null;
  /** No individual PVT baseline evidence in this read model. */
  validatedPvtBaselinePct: null;
  physiologicalImaScore: null;
  operationalFitness: 'NOT_ASSESSED';
  methodologyStatus: 'NOT_VALIDATED';
  blockers: string[];
}

const DAY_MS = 86_400_000;
const MAX_ROWS = 15_000;
const MIN_CREW = 10;

function ordinal(value: string): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('IMA_COHORT_INVALID_DATE');
  }
  const [year, month, day] = value.split('-').map(Number);
  const ms = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
    throw new Error('IMA_COHORT_INVALID_DATE');
  }
  return ms / DAY_MS;
}

function approxCount(count: number, quantum: number): number {
  return Math.round(count / quantum) * quantum;
}

function approxPct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round(10 * numerator / denominator) * 10 : 0;
}

/**
 * Produces aggregate *data readiness*, not fatigue trends, labels or dispatch
 * decisions. Sleep duration and wake time are self-report, not a validated
 * continuous sleep/wake timeline. Off days are not inferred as recovery.
 */
export function auditImaCohortEvidence(input: ImaCohortEvidenceInput): ImaCohortEvidenceReport {
  if (!Number.isSafeInteger(input.expectedEmpresaId) || input.expectedEmpresaId <= 0) {
    throw new Error('IMA_COHORT_TENANT_REQUIRED');
  }
  const start = ordinal(input.startDate);
  const end = ordinal(input.endDate);
  const span = end - start + 1;
  if (span !== 30 && span !== 60 && span !== 90) {
    throw new Error('IMA_COHORT_WINDOW_NOT_APPROVED');
  }
  if (input.rows.length > MAX_ROWS) throw new Error('IMA_COHORT_ROW_LIMIT_EXCEEDED');

  const crew = new Set<number>();
  const subjectDays = new Set<string>();
  let received = 0;
  let realSleep = 0;
  let realWake = 0;
  let kss = 0;
  let reconstructedBoundary = 0;
  let incompleteSource = 0;

  for (const row of input.rows) {
    if (row.empresa_id !== input.expectedEmpresaId) throw new Error('IMA_COHORT_CROSS_TENANT');
    if (!Number.isSafeInteger(row.funcionario_id) || row.funcionario_id <= 0) {
      throw new Error('IMA_COHORT_INVALID_CREW');
    }
    const day = ordinal(row.data_operacional);
    if (day < start || day > end) throw new Error('IMA_COHORT_DAY_OUTSIDE_SCOPE');

    // A duplicate crew/day (even identical) must be reconciled at the source.
    const key = row.funcionario_id + ':' + day;
    if (subjectDays.has(key)) throw new Error('IMA_COHORT_DUPLICATE_CREW_DAY');
    subjectDays.add(key);
    crew.add(row.funcionario_id);

    const hasCheckin = row.checkin_status === 'RECEBIDO';
    const hasSleep = hasCheckin && row.sleep_data_source === 'REAL' &&
      typeof row.horas_sono === 'number' && Number.isFinite(row.horas_sono) &&
      row.horas_sono > 0 && row.horas_sono <= 24;
    const hasWake = hasCheckin && row.wake_data_source === 'REAL';
    const hasKss = hasCheckin && Number.isInteger(row.kss_score) &&
      row.kss_score! >= 1 && row.kss_score! <= 9;
    const hasReconstructed = row.teve_jornada && row.jornada_data_source === 'REAL' &&
      (row.operational_data_source === 'CONTROLE_VOOS' ||
       row.operational_data_source === 'SIGVOOS');
    if (hasCheckin) received++;
    if (hasSleep) realSleep++;
    if (hasWake) realWake++;
    if (hasKss) kss++;
    if (hasReconstructed) reconstructedBoundary++;
    if (!hasSleep || !hasWake || !hasKss ||
        row.jornada_data_source === 'INCONSISTENTE' ||
        row.jornada_data_source === 'ESTIMADO' ||
        (row.teve_jornada && row.jornada_data_source === 'AUSENTE')) incompleteSource++;
  }

  const suppressed = crew.size < MIN_CREW;
  const denominator = subjectDays.size;
  const blockers = [
    'SONO_AUTODECLARADO_NAO_COMPROVA_CRONOLOGIA_24H',
    'SEM_ORIGEM_VERIFICADA_DAS_DUAS_BORDAS_DO_SONO',
    'PVT_INDIVIDUAL_NAO_VALIDADO_PELO_SNAPSHOT',
    'CALIBRACAO_PROSPECTIVA_PENDENTE',
    'KSS_PERSISTIDO_PODE_SER_DERIVADO_OU_DEFAULT_5',
  ];
  if (suppressed) blockers.push('PRIVACIDADE_COORTE_INSUFICIENTE');
  if (input.boundaryProvenanceUnavailable) blockers.push('PROVENIENCIA_LIMITES_JORNADA_NAO_DISPONIVEL');
  else if (incompleteSource > 0) blockers.push('FONTES_DE_DADOS_INCOMPLETAS');
  return {
    state: suppressed ? 'PRIVACY_SUPPRESSED' : 'AGGREGATED_RESEARCH_COVERAGE',
    windowDays: span as 30 | 60 | 90,
    minCrewForRelease: MIN_CREW,
    denominatorDefinition: 'CHECKIN_OR_JOURNEY_DAYS_NOT_FULL_ROSTER',
    approximateCrew: suppressed ? null : approxCount(crew.size, 5),
    approximateCrewDays: suppressed ? null : approxCount(denominator, 10),
    checkinReceivedPctApprox: suppressed ? null : approxPct(received, denominator),
    realSleepDurationPctApprox: suppressed ? null : approxPct(realSleep, denominator),
    realWakeReportPctApprox: suppressed ? null : approxPct(realWake, denominator),
    validKssPctApprox: null,
    storedKssValuePctApprox: suppressed ? null : approxPct(kss, denominator),
    verifiedCrewReportedKssPctApprox: null,
    reconstructedDutyBoundaryPctApprox: suppressed || input.boundaryProvenanceUnavailable
      ? null : approxPct(reconstructedBoundary, denominator),
    sourceIncompletePctApprox: suppressed ? null : approxPct(incompleteSource, denominator),
    verifiedSleepEpisodePct: null,
    validatedPvtBaselinePct: null,
    physiologicalImaScore: null,
    operationalFitness: 'NOT_ASSESSED',
    methodologyStatus: 'NOT_VALIDATED',
    blockers,
  };
}
