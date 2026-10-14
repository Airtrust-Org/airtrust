import {describe,expect,it} from 'vitest';
import {draftApprovedResumptionCredit,ResumeCreditError} from '../../lib/lms-player3/resume-credit';
import type {ContinuityPlan,DestinationEdition} from '../../lib/lms-player3/continuity';

const plan:ContinuityPlan={
 empresa_id:6,matricula_id:911,funcionario_id:21,curso_id:57,ciclo_id:32,
 source_progress_pct:80,legacy_cycle_progress_pct:80,last_slide:35,
 target_edition_sha256:'b'.repeat(64),target_resume_unit_id:null,
 disposition:'ADMIN_EQUIVALENCE_REVIEW',preserves_legacy_progress:true,
 grants_completed:false,grants_certification:false,
 reason:'PERCENTAGE_NOT_UNIT_EVIDENCE',source_updated_at:'2026-10-14',
};
const edition:DestinationEdition={
 empresa_id:6,curso_id:57,source_version_tag:'RC8',
 edition_sha256:'b'.repeat(64),
 certified_source_unit_ids:['a','b','c'],
 target_unit_ids:['a','b','c'],units_by_source_id:{a:'a',b:'b',c:'c'},
};
const approval={
 approverUserId:101,isAuthorizedTrainingManager:true,
 secondApproverUserId:102,secondApproverAuthorized:true,
 snapshotSha256:'a'.repeat(64),
 reason:'Progresso legado conferido e equivalente ao módulo b.',
 reviewReference:'AT-20261014-001',
};
describe('Player3 administrative resume-only credits',()=>{
 it('preserves original 80% and binds same tenant, cycle, edition, decision',()=>{
  expect(draftApprovedResumptionCredit(plan,edition,'b',approval)).toMatchObject({
   schema:'AIRTRUST_PLAYER3_RESUME_CREDIT_V1',
   tenantId:6,enrollmentId:911,employeeId:21,courseId:57,cycleId:32,
   sourceProgressPct:80,targetResumeUnitId:'b',
   status:'REVIEW_APPROVED_NOT_APPLIED',writesPerformed:false,
   grantsCompletion:false,grantsQualification:false,grantsCertificate:false,
   grantsAssessmentPass:false,meaning:'POSITION_ONLY_NOT_EXAM_OR_COMPLETION',
  });
 });
 it('rejects cross-tenant and wrong course or edition',()=>{
  for(const other of [
   {...edition,empresa_id:7},{...edition,curso_id:58},
   {...edition,edition_sha256:'c'.repeat(64)},
  ])expect(()=>draftApprovedResumptionCredit(plan,other,'b',approval))
   .toThrow(ResumeCreditError);
 });
 it('refuses auto-approved exact crosswalk or completed plan',()=>{
  expect(()=>draftApprovedResumptionCredit({...plan,disposition:'EXACT_RESTORE'},
   edition,'b',approval)).toThrow(ResumeCreditError);
  expect(()=>draftApprovedResumptionCredit({...plan,grants_completed:true},
   edition,'b',approval)).toThrow(ResumeCreditError);
 });
 it('requires TWO distinct server-authorized reviewers and review rationale',()=>{
  for(const bad of [
   {...approval,isAuthorizedTrainingManager:false},
   {...approval,secondApproverAuthorized:false},
   {...approval,secondApproverUserId:101},
   {...approval,snapshotSha256:'invalid'},
   {...approval,reason:'OK'},
  ])expect(()=>draftApprovedResumptionCredit(plan,edition,'b',bad))
    .toThrow(ResumeCreditError);
 });
 it('never grants an unavailable target position',()=>{
  expect(()=>draftApprovedResumptionCredit(plan,edition,'bogus',approval))
   .toThrow(ResumeCreditError);
 });
});
