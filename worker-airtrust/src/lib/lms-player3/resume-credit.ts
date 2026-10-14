/**
 * Player3: auditable resumption credit for historical learning already done.
 * Pure review record ONLY; this is not a D1 writer or certifying exam.
 * Inputs must originate from a server-authenticated admin decision, matched
 * against the latest sealed legacy snapshot and immutable target edition.
 */
import {type ContinuityPlan,type DestinationEdition} from './continuity';

const hash=/^[0-9a-f]{64}$/;
const positive=(id:unknown):id is number=>
  typeof id==='number' && Number.isSafeInteger(id)&&id>0;

export type VerifiedTrainingApproval = Readonly<{
  approverUserId:number;
  /** Asserted by authenticated server RBAC, never trusted from request JSON. */
  isAuthorizedTrainingManager:boolean;
  secondApproverUserId:number;
  secondApproverAuthorized:boolean;
  snapshotSha256:string;
  reason:string;
  reviewReference:string;
}>;

export type ResumeCredit = Readonly<{
  schema:'AIRTRUST_PLAYER3_RESUME_CREDIT_V1';
  tenantId:number;enrollmentId:number;employeeId:number;courseId:number;cycleId:number;
  sourceProgressPct:number;
  snapshotSha256:string;
  targetEditionSha256:string;
  targetResumeUnitId:string;
  approvedByUserId:number;secondApproverUserId:number;
  reviewReference:string;reason:string;
  meaning:'POSITION_ONLY_NOT_EXAM_OR_COMPLETION';
  writesPerformed:false;grantsCompletion:false;grantsQualification:false;
  grantsCertificate:false;grantsAssessmentPass:false;
  status:'REVIEW_APPROVED_NOT_APPLIED';
}>;

export class ResumeCreditError extends Error {
  constructor(public readonly code:string){super(code);this.name='ResumeCreditError';}
}
const reject=(code:string):never=>{throw new ResumeCreditError(code);};

export function draftApprovedResumptionCredit(
  plan:ContinuityPlan,
  edition:DestinationEdition,
  resumeUnitId:string,
  decision:VerifiedTrainingApproval,
):ResumeCredit {
  if(!plan || plan.disposition!=='ADMIN_EQUIVALENCE_REVIEW' ||
    !plan.preserves_legacy_progress || plan.grants_completed || plan.grants_certification ||
    !positive(plan.empresa_id) || !positive(plan.matricula_id) ||
    !positive(plan.funcionario_id) || !positive(plan.curso_id) ||
    !positive(plan.ciclo_id) || plan.source_progress_pct<=0 ||
    plan.source_progress_pct>100 || plan.target_resume_unit_id!==null) {
    reject('SOURCE_NOT_ELIGIBLE');
  }
  if(!edition || edition.empresa_id!==plan.empresa_id ||
    edition.curso_id!==plan.curso_id ||
    edition.edition_sha256!==plan.target_edition_sha256 ||
    !hash.test(edition.edition_sha256) ||
    !edition.target_unit_ids.includes(resumeUnitId)) {
    reject('TARGET_EDITION_OR_UNIT_MISMATCH');
  }
  if(!decision?.isAuthorizedTrainingManager || !decision.secondApproverAuthorized ||
    !positive(decision.approverUserId) ||
    !positive(decision.secondApproverUserId) ||
    decision.approverUserId===decision.secondApproverUserId ||
    !hash.test(decision.snapshotSha256) ||
    typeof decision.reason!=='string' ||
    decision.reason.trim().length<20 || decision.reason.length>1000 ||
    typeof decision.reviewReference!=='string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{5,120}$/.test(decision.reviewReference)) {
    reject('REVIEW_APPROVAL_INVALID');
  }
  return {
    schema:'AIRTRUST_PLAYER3_RESUME_CREDIT_V1',
    tenantId:plan.empresa_id,enrollmentId:plan.matricula_id,
    employeeId:plan.funcionario_id,courseId:plan.curso_id,
    cycleId:plan.ciclo_id as number,sourceProgressPct:plan.source_progress_pct,
    snapshotSha256:decision.snapshotSha256,
    targetEditionSha256:edition.edition_sha256,
    targetResumeUnitId:resumeUnitId,
    approvedByUserId:decision.approverUserId,
    secondApproverUserId:decision.secondApproverUserId,
    reviewReference:decision.reviewReference,reason:decision.reason.trim(),
    meaning:'POSITION_ONLY_NOT_EXAM_OR_COMPLETION',
    writesPerformed:false,grantsCompletion:false,
    grantsQualification:false,grantsCertificate:false,grantsAssessmentPass:false,
    status:'REVIEW_APPROVED_NOT_APPLIED',
  };
}
