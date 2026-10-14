/**
 * Player 3 — governed administrative resume credit INTENT, not a D1 write.
 *
 * Issued only after independent operator approval of a fresh, edition-pinned
 * snapshot. This does NOT mark any lesson learned, exam passed, qualification
 * created or certificate issued. D1 writer must atomically re-verify scope,
 * active cycle, source watermark, RBAC approval, snapshot hash and uniqueness.
 */
import {
  proposeLegacyScormResume,
  type LegacySourceEdition,
} from './continuity-from-scorm';
import type { LegacyEnrollment, DestinationEdition } from './continuity';

export type ResumeCreditReview = Readonly<{
  actor_user_id:number;
  approver_user_id:number;
  approved_at:string;
  source_snapshot_sha256:string;
  expected_matricula_updated_at:string;
  expected_scorm_commit_at:string|null;
  expected_ciclo_id:number;
  approved_resume_unit_id:string;
  justification:string;
}>;
export type ResumeCreditIntent=Readonly<{
  kind:'AIRTRUST_PLAYER3_ADMIN_RESUME_CREDIT_V1';
  empresa_id:number;
  matricula_id:number;
  curso_id:number;
  funcionario_id:number;
  ciclo_id:number;
  original_progress_pct:number;
  original_edition_sha256:string;
  new_edition_sha256:string;
  resume_unit_id:string;
  source_snapshot_sha256:string;
  source_updated_at:string;
  source_scorm_commit_at:string|null;
  actor_user_id:number;
  approver_user_id:number;
  approved_at:string;
  justification:string;
  /** Neither presence nor status is certified by an administrative bookmark. */
  advances_navigation_only:true;
  grants_assessment_pass:false;
  grants_completion:false;
  grants_certificate:false;
}>;
const sha=/^[a-f0-9]{64}$/;
const unit=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const validInt=(n:number)=>Number.isSafeInteger(n)&&n>0;
const deny=(code:string):never=>{throw new Error('PLAYER3_RESUME_CREDIT_'+code);};

/** Pure intent. No permissions can be checked here: the Worker must enforce
 * tenant/RBAC/actor ownership before persisting anything.
 */
export function createAdminResumeCreditIntent(params:{
  enrollment:LegacyEnrollment;
  sourceEdition:LegacySourceEdition;
  destination:DestinationEdition;
  persistedSuspendData:string|null;
  review:ResumeCreditReview;
}):ResumeCreditIntent{
  const {enrollment,sourceEdition,destination,persistedSuspendData,review}=params;
  if(!review || !validInt(review.actor_user_id) ||
      !validInt(review.approver_user_id) ||
      review.actor_user_id===review.approver_user_id ||
      !validInt(review.expected_ciclo_id) ||
      !sha.test(review.source_snapshot_sha256) ||
      !unit.test(review.approved_resume_unit_id) ||
      typeof review.justification!=='string' ||
      review.justification.trim().length<20 ||
      review.justification.length>1000 ||
      typeof review.approved_at!=='string' ||
      Number.isNaN(Date.parse(review.approved_at)) ||
      !review.approved_at.endsWith('Z') ||
      typeof review.expected_matricula_updated_at!=='string' ||
      review.expected_matricula_updated_at !== enrollment.matricula_updated_at ||
      review.expected_scorm_commit_at !== enrollment.scorm_last_commit_at ||
      review.expected_ciclo_id !== enrollment.ciclo_id) {
    deny('REVIEW_CONTEXT_INVALID');
  }
  const suggested=proposeLegacyScormResume({
    enrollment,sourceEdition,destination,persistedSuspendData,
  });
  if(!suggested.proposed_resume_unit_id ||
      suggested.proposed_resume_unit_id!==review.approved_resume_unit_id ||
      suggested.continuity.disposition==='SOURCE_CONFLICT' ||
      suggested.continuity.disposition==='NO_PROGRESS' ||
      suggested.continuity.source_progress_pct===100 ||
      !validInt(suggested.continuity.ciclo_id ?? 0)) {
    deny('NOT_ELIGIBLE_FOR_BOOKMARK_CREDIT');
  }
  return {
    kind:'AIRTRUST_PLAYER3_ADMIN_RESUME_CREDIT_V1',
    empresa_id:enrollment.empresa_id,matricula_id:enrollment.matricula_id,
    curso_id:enrollment.curso_id,funcionario_id:enrollment.funcionario_id,
    ciclo_id:enrollment.ciclo_id as number,
    original_progress_pct:suggested.continuity.source_progress_pct,
    original_edition_sha256:sourceEdition.source_edition_sha256,
    new_edition_sha256:destination.edition_sha256,
    resume_unit_id:suggested.proposed_resume_unit_id,
    source_snapshot_sha256:review.source_snapshot_sha256,
    source_updated_at:review.expected_matricula_updated_at,
    source_scorm_commit_at:enrollment.scorm_last_commit_at,
    actor_user_id:review.actor_user_id,approver_user_id:review.approver_user_id,
    approved_at:review.approved_at,justification:review.justification.trim(),
    advances_navigation_only:true,grants_assessment_pass:false,
    grants_completion:false,grants_certificate:false,
  };
}
