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

/**
 * A *decrypted in trusted custody* decision produced by the Front C
 * reconciler; never accept this object from HTTP/browser/user JSON.
 * The encrypted T0/T1 files and individual decision remain outside GitHub.
 */
export type FrontCReconciledHandoff=Readonly<{
  provenance:Readonly<{
    authorized_tenant_id:number;
    source_contract:'player3-active-enrollments-readonly.sql';
    t0_sha256:string;t1_sha256:string;
    t0_extracted_utc:string;t1_extracted_utc:string;
  }>;
  decision:Readonly<{
    decision_key:string;empresa_id:number;matricula_id:number;
    funcionario_id:number;curso_id:number;ciclo_id:number|null;
    ciclo_numero:number|null;source_version_tag:string|null;
    disposition:string;previous_reported_pct:number|null;
    current_reported_pct:number|null;historical_pct_to_preserve:number;
    prior_row_sha256:string|null;latest_row_sha256:string|null;
    source_updated_at:string|null;scorm_last_commit_at:string|null;
    catalog_package_is_cycle_verified:false;
    requires_source_edition_verification:true;
    requires_independent_admin_review:true;
    target_edition_sha256:null;resume_unit_id:null;
    may_apply_automatically:false;modifies_enrollment:false;
    grants_exam_pass:false;grants_completion:false;
    grants_qualification:false;grants_certificate:false;
  }>;
}>;

export type ResumeCreditReview = Readonly<{
  actor_user_id:number;
  approver_user_id:number;
  /** Asserted by independently checked backend RBAC, not by client JSON. */
  training_manager_authorized:boolean;
  second_reviewer_authorized:boolean;
  approved_at:string;
  source_snapshot_sha256:string;
  /** Must match the decision from the private Front C sealed reconciliation. */
  front_c_decision_key:string;
  /** Independently source-archive-verified for this cycle; never catalog-current alone. */
  verified_source_archive_sha256:string;
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
  front_c_decision_key:string;
  front_c_t0_sha256:string;
  front_c_latest_row_sha256:string;
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
  /** Server-verified private result of the Front C encrypted T0/T1 workflow. */
  reconciliation:FrontCReconciledHandoff;
  review:ResumeCreditReview;
}):ResumeCreditIntent{
  const {enrollment,sourceEdition,destination,persistedSuspendData,
    reconciliation,review}=params;
  if(!review || review.training_manager_authorized!==true ||
      review.second_reviewer_authorized!==true ||
      !validInt(review.actor_user_id) ||
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
  // Front C owns the actual encrypted reconciliation. Front B does not
  // reimplement the diff and cannot infer the original edition from the
  // catalog's current hash. This guards the *handoff*, not the signature,
  // RBAC or the final D1 writer (all must revalidate separately).
  const p=reconciliation?.provenance;
  const d=reconciliation?.decision;
  const eligible=new Set([
    'UNCHANGED_REVIEW','PROGRESS_ADVANCED_REVIEW',
    'EVIDENCE_UPDATED_REVIEW','PERCENT_REGRESSION_REVIEW',
  ]);
  if(!p||!d||p.authorized_tenant_id!==6||
     p.source_contract!=='player3-active-enrollments-readonly.sql'||
     !sha.test(p.t0_sha256)||!sha.test(p.t1_sha256)||
     !Number.isFinite(Date.parse(p.t0_extracted_utc))||
     !Number.isFinite(Date.parse(p.t1_extracted_utc))||
     Date.parse(p.t1_extracted_utc)<Date.parse(p.t0_extracted_utc)||
     Date.parse(review.approved_at)<Date.parse(p.t1_extracted_utc)||
     review.source_snapshot_sha256!==p.t1_sha256||
     review.front_c_decision_key!==d.decision_key||
     review.verified_source_archive_sha256!==sourceEdition.source_edition_sha256||
     !sha.test(review.verified_source_archive_sha256)||
     !sha.test(d.decision_key)||!sha.test(d.prior_row_sha256??'')||
     !sha.test(d.latest_row_sha256??'')||
     !eligible.has(d.disposition)||
     d.empresa_id!==enrollment.empresa_id||
     d.matricula_id!==enrollment.matricula_id||
     d.funcionario_id!==enrollment.funcionario_id||
     d.curso_id!==enrollment.curso_id||
     d.ciclo_id!==enrollment.ciclo_id||
     d.ciclo_numero!==enrollment.ciclo_numero||
     d.source_version_tag!==enrollment.curso_version_tag||
     d.source_updated_at!==enrollment.matricula_updated_at||
     d.scorm_last_commit_at!==enrollment.scorm_last_commit_at||
     typeof enrollment.matricula_progresso_pct!=='number'||
     d.current_reported_pct!==enrollment.matricula_progresso_pct||
     typeof d.previous_reported_pct!=='number'||
     !Number.isFinite(d.previous_reported_pct)||
     d.previous_reported_pct<0||d.previous_reported_pct>100||
     !Number.isFinite(d.historical_pct_to_preserve)||
     d.historical_pct_to_preserve!==Math.max(
       d.previous_reported_pct,d.current_reported_pct as number)||
     d.historical_pct_to_preserve<enrollment.matricula_progresso_pct||
     d.historical_pct_to_preserve>100||
     d.catalog_package_is_cycle_verified!==false||
     d.requires_source_edition_verification!==true||
     d.requires_independent_admin_review!==true||
     d.target_edition_sha256!==null||d.resume_unit_id!==null||
     d.may_apply_automatically!==false||
     d.modifies_enrollment!==false||
     d.grants_exam_pass!==false||d.grants_completion!==false||
     d.grants_qualification!==false||d.grants_certificate!==false){
    deny('FRONT_C_RECONCILIATION_NOT_VERIFIED');
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
    resume_unit_id:review.approved_resume_unit_id,
    source_snapshot_sha256:review.source_snapshot_sha256,
    front_c_decision_key:d.decision_key,
    front_c_t0_sha256:p.t0_sha256,
    front_c_latest_row_sha256:d.latest_row_sha256 as string,
    source_updated_at:review.expected_matricula_updated_at,
    source_scorm_commit_at:enrollment.scorm_last_commit_at,
    actor_user_id:review.actor_user_id,approver_user_id:review.approver_user_id,
    approved_at:review.approved_at,justification:review.justification.trim(),
    advances_navigation_only:true,grants_assessment_pass:false,
    grants_completion:false,grants_certificate:false,
  };
}
