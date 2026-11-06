/**
 * Finite-scope, training-management attestation for courses completed under
 * an earlier SCORM edition (tenant 6, 16 October 2026).
 * Must only be evaluated AFTER the current active edition is proven incompatible.
 * Does not change CMI/grades or silently credit unrelated enrollments.
 */
export const HISTORICAL_EDITION_CREDIT_REASON = 'AIRTRUST_MANAGER_HISTORICAL_EDITION_CREDIT_20261016';
export const ADMIN_99_EDITION_CREDIT_REASON = 'AIRTRUST_ADMIN_EDITION_CREDIT_20261026';
const ADMIN_99_COURSES = new Map<number, number>([[201,28],[544,7],[608,43],[610,43],[624,43]]);
/**
 * 2026-11-03: the owner of the training program attested in chat that these three
 * enrollments stayed at 99-100% because of platform errors (package edition swapped
 * under the learner, status never reported) and must not be redone. Finite list,
 * its own provenance reason; it is not valid for any other enrollment.
 */
export const ADMIN_EDITION_CREDIT_20261103_REASON = 'AIRTRUST_ADMIN_EDITION_CREDIT_20261103';
const ADMIN_EDITION_CREDIT_20261103 = new Map<number, number>([[857,3],[1219,7],[2378,71]]);
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
  const attested20261103 = ADMIN_EDITION_CREDIT_20261103.get(x.matriculaId)===x.cursoId;
  if(COURSES.get(x.matriculaId)!==x.cursoId && !attested20261103) return false;
  if(typeof x.reason!=='string')return false;
  const reasonAccepted = attested20261103
    ? isAuthorizedAdminEditionCredit20261103(x)
    : x.reason.trim().startsWith(HISTORICAL_EDITION_CREDIT_REASON+':') || isAuthorizedAdmin99EditionCredit(x);
  if(!reasonAccepted)return false;
  if(String(x.status).toUpperCase()!=='EM_ANDAMENTO' || x.progressoPct!==100) return false;
  if(x.qualificationId!==null || !x.hasScormEvidence) return false;
  if(['failed','reproved'].includes(String(x.lessonStatus??'').toLowerCase()) ||
    String(x.successStatus??'').toLowerCase()==='failed') return false;
  return true;
}

/** Separate, explicitly authorized 99% reconciliation; never represents a new-edition pass. */
export function isAuthorizedAdmin99EditionCredit(x: HistoricalEditionCreditCheck): boolean {
  return x.empresaId === 6 && x.isAdmin && ADMIN_99_COURSES.get(x.matriculaId) === x.cursoId &&
    typeof x.reason === 'string' && x.reason.trim().startsWith(ADMIN_99_EDITION_CREDIT_REASON + ':');
}

/** Separate 2026-11-03 attestation for the three enrollments listed above; never a new-edition pass. */
export function isAuthorizedAdminEditionCredit20261103(x: HistoricalEditionCreditCheck): boolean {
  return x.empresaId === 6 && x.isAdmin && ADMIN_EDITION_CREDIT_20261103.get(x.matriculaId) === x.cursoId &&
    typeof x.reason === 'string' && x.reason.trim().startsWith(ADMIN_EDITION_CREDIT_20261103_REASON + ':');
}
