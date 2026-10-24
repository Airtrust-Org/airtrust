/**
 * Finite-scope, training-management attestation for courses completed under
 * an earlier SCORM edition (tenant 6, 16 October 2026).
 * Must only be evaluated AFTER the current active edition is proven incompatible.
 * Does not change CMI/grades or silently credit unrelated enrollments.
 */
export const HISTORICAL_EDITION_CREDIT_REASON = 'AIRTRUST_MANAGER_HISTORICAL_EDITION_CREDIT_20261016';
const COURSES = new Map<number, number>([
  [2106,68],[384,34],[201,28],[608,43],[2139,68],
  [610,43],[544,7],[624,43],[700,55],[2052,68],
]);
export interface HistoricalEditionCreditCheck {
  empresaId: number;
  matriculaId: number;
  cursoId: number;
  isAdmin: boolean;
  reason: unknown;
  status: unknown;
  progressoPct: unknown;
  qualificationId: unknown;
  isScorm: boolean;
  currentCourseActive: boolean;
  hasScormEvidence: boolean;
  lessonStatus: unknown;
  successStatus: unknown;
}
/** Recognizes the old edition administratively, NEVER a new-edition SCORM pass. */
export function isEligibleForHistoricEditionCredit(x: HistoricalEditionCreditCheck): boolean {
  if(x.empresaId!==6 || !x.isAdmin || !x.isScorm || !x.currentCourseActive) return false;
  if(COURSES.get(x.matriculaId)!==x.cursoId) return false;
  if(typeof x.reason!=='string' || !x.reason.trim().startsWith(HISTORICAL_EDITION_CREDIT_REASON+':'))return false;
  if(String(x.status).toUpperCase()!=='EM_ANDAMENTO' || x.progressoPct!==100) return false;
  if(x.qualificationId!==null || !x.hasScormEvidence) return false;
  if(['failed','reproved'].includes(String(x.lessonStatus??'').toLowerCase()) ||
    String(x.successStatus??'').toLowerCase()==='failed') return false;
  return true;
}
