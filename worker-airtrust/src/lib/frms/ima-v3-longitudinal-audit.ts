/**
 * FRMS V3 IMA — longitudinal DATA FEASIBILITY only.
 *
 * This pure function neither fetches nor persists tenant data. The caller must
 * authenticate, scope by empresa_id, pseudonymize identifiers in memory, and
 * deduplicate source records before export. It returns aggregate counts only,
 * never identifiers, dates, events or physiological scores.
 *
 * A reported sleep window (bedtime -> wake) is not proof of uninterrupted sleep.
 * Seven consecutive reported windows do NOT establish a continuous, validated
 * 168 h sleep/wake chronology. Consequently NO model readiness, aptitude or
 * numeric IMA can be issued by this function.
 */
import {
  auditImaDailyEvidence,
  hasCrewReportedSleepWindow,
  type ImaDailyDataEvidence,
  type ImaDataReadinessAudit,
} from './ima-v3-evidence-audit';

export interface ImaLongitudinalEvidenceRow {
  /** Transient pseudonymous key; never emitted. Never use a name or registration. */
  subjectKey: string;
  /** Tenant ID from the trusted backend context; compared before aggregation. */
  empresaId: number;
  /** Local operational day YYYY-MM-DD, with source timezone resolved upstream. */
  operationalDate: string;
  evidence: ImaDailyDataEvidence;
}

export interface ImaLongitudinalAudit {
  inputRows: number;
  distinctSubjects: number;
  distinctSubjectDays: number;
  conflictingDuplicateRows: number;
  sevenDayConsecutiveDateWindows: number;
  sevenDayCrewReportedWindowCandidates: number;
  subjectsWithCandidateWindows: number;
  /** Intentionally always false: a dated sleep window cannot certify wake intervals. */
  operationalModelReady: false;
  state: 'NO_SAMPLE' | 'DUPLICATE_DAYS_REQUIRE_RECONCILIATION' |
    'INSUFFICIENT_REPORTED_WINDOWS' | 'SLEEP_WAKE_CHRONOLOGY_NOT_VERIFIED';
  blockers: string[];
  dailyCoverage: ImaDataReadinessAudit;
}

const DAY_MS = 86_400_000;

/** Calendar dates are converted to UTC day ordinals only for consecutive-day comparisons. */
function dayOrdinal(value: string): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('IMA_INVALID_OPERATIONAL_DATE');
  }
  const [year, month, day] = value.split('-').map(Number);
  const ms = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
    throw new Error('IMA_INVALID_OPERATIONAL_DATE');
  }
  return ms / DAY_MS;
}

/**
 * Enumerates consecutive seven-calendar-day sets per transient subject key.
 * Seven days is a research coverage window, NOT an RBAC limit or a score cutoff.
 * Duplicate subject/date pairs are quarantined rather than picking the “best”
 * check-in or silently double counting a day.
 */
export function auditImaLongitudinalEvidence(
  expectedEmpresaId: number,
  rows: readonly ImaLongitudinalEvidenceRow[],
): ImaLongitudinalAudit {
  if (!Number.isSafeInteger(expectedEmpresaId) || expectedEmpresaId <= 0) {
    throw new Error('IMA_AUTHORIZED_TENANT_REQUIRED');
  }
  const bySubject = new Map<string, Map<number, ImaDailyDataEvidence | null>>();
  let conflictingDuplicateRows = 0;

  for (const row of rows) {
    if (!Number.isSafeInteger(row.empresaId) || row.empresaId !== expectedEmpresaId) {
      throw new Error('IMA_TENANT_SCOPE_MISMATCH');
    }
    if (typeof row.subjectKey !== 'string' || !row.subjectKey.trim()) {
      throw new Error('IMA_SUBJECT_PSEUDONYM_REQUIRED');
    }
    const ordinal = dayOrdinal(row.operationalDate);
    let subjectDays = bySubject.get(row.subjectKey);
    if (!subjectDays) {
      subjectDays = new Map();
      bySubject.set(row.subjectKey, subjectDays);
    }
    if (subjectDays.has(ordinal)) {
      // Quarantine every collided date, including identical repeated rows.
      conflictingDuplicateRows += 1;
      subjectDays.set(ordinal, null);
    } else {
      subjectDays.set(ordinal, row.evidence);
    }
  }

  let sevenDayConsecutiveDateWindows = 0;
  let sevenDayCrewReportedWindowCandidates = 0;
  let subjectsWithCandidateWindows = 0;
  const uniqueEvidence: ImaDailyDataEvidence[] = [];
  let distinctSubjectDays = 0;

  for (const days of bySubject.values()) {
    distinctSubjectDays += days.size;
    const ordinals = [...days.keys()].sort((a, b) => a - b);
    let hasCandidate = false;
    for (const evidence of days.values()) {
      if (evidence !== null) uniqueEvidence.push(evidence);
    }
    for (let i = 6; i < ordinals.length; i++) {
      // Day ordinals increment by one even over month/year boundaries.
      if (ordinals[i] - ordinals[i - 6] !== 6) continue;
      sevenDayConsecutiveDateWindows++;
      let previousWakeInstant = Number.NEGATIVE_INFINITY;
      const allReported = ordinals.slice(i - 6, i + 1).every((ordinal) => {
        const evidence = days.get(ordinal);
        if (evidence == null || !hasCrewReportedSleepWindow(evidence) ||
            evidence.wakeDataSource !== 'REAL') return false;
        // An episode copied to multiple dates cannot count as repeated sleep.
        // These date labels must be in the same local zone as the check-in.
        const operationalDay = new Date(ordinal * DAY_MS).toISOString().slice(0, 10);
        if (evidence.observedSleepEndAt?.slice(0, 10) !== operationalDay) return false;
        const start = Date.parse(evidence.observedSleepStartAt!);
        const end = Date.parse(evidence.observedSleepEndAt!);
        if (start < previousWakeInstant) return false; // overlapping nights
        previousWakeInstant = end;
        return true;
      });
      if (allReported) {
        sevenDayCrewReportedWindowCandidates++;
        hasCandidate = true;
      }
    }
    if (hasCandidate) subjectsWithCandidateWindows++;
  }

  const blockers: string[] = ['CRONOLOGIA_COMPLETA_DE_VIGILIA_NAO_COMPROVADA'];
  let state: ImaLongitudinalAudit['state'] = 'SLEEP_WAKE_CHRONOLOGY_NOT_VERIFIED';
  if (rows.length === 0) {
    state = 'NO_SAMPLE';
    blockers.push('SEM_AMOSTRA');
  } else if (conflictingDuplicateRows > 0) {
    state = 'DUPLICATE_DAYS_REQUIRE_RECONCILIATION';
    blockers.push('DIAS_DUPLICADOS_EXCLUIDOS');
  } else if (sevenDayCrewReportedWindowCandidates === 0) {
    state = 'INSUFFICIENT_REPORTED_WINDOWS';
    blockers.push('SEM_SETE_DIAS_CONSECUTIVOS_DE_JANELAS_RELATADAS');
  }

  return {
    inputRows: rows.length,
    distinctSubjects: bySubject.size,
    distinctSubjectDays,
    conflictingDuplicateRows,
    sevenDayConsecutiveDateWindows,
    sevenDayCrewReportedWindowCandidates,
    subjectsWithCandidateWindows,
    operationalModelReady: false,
    state,
    blockers,
    dailyCoverage: auditImaDailyEvidence(uniqueEvidence),
  };
}
