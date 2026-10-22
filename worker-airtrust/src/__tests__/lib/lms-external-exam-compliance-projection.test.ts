import { describe, expect, it } from 'vitest';
import { projectExternalExamCompliance, type TrainingComplianceInput } from '../../lib/lms-exams/training-compliance-projection';

const sha=(char:string)=>char.repeat(64);
const scope={empresaId:6,funcionarioId:8,matriculaId:12,cicloId:3,courseEditionSha256:sha('a')};
const study={scope,validatedByWorker:true as const,completedAt:'2026-10-20'};
const exam={scope,validatedByWorker:true as const,examSha256:sha('b'),policySha256:sha('c'),result:'PASSED' as const,completedAt:'2026-10-22'};
const base:TrainingComplianceInput={
  scope,today:'2026-10-22',study:null,exam:null,
  enrolledCycleCompleted:false,qualificationForThisCycle:null,
  previousQualification:null,operationalDeadline:'2026-10-30',
};
describe('external exam — qualification clock distinct from study',()=>{
  it('first time: study complete unlocks exam, NEVER compliance',()=>{
    expect(projectExternalExamCompliance({...base,study})).toMatchObject({
      learning:'EXAM_PENDING',examEligible:true,
      compliance:'NOT_QUALIFIED',validUntil:null,
      qualificationIssuanceEligible:false,
    });
  });
  it('passed exam does not invent an issued qualification',()=>{
    expect(projectExternalExamCompliance({...base,study,exam})).toMatchObject({
      learning:'AWAITING_OFFICIAL_ISSUANCE',compliance:'NOT_QUALIFIED',
      qualificationIssuanceEligible:true,
    });
  });
  it('completed enrollment with actual issued record qualifies',()=>{
    expect(projectExternalExamCompliance({
      ...base,study,exam,enrolledCycleCompleted:true,
      qualificationForThisCycle:{issuedAt:'2026-10-22',expiresAt:'2027-10-22',isActive:true},
    })).toMatchObject({
      learning:'ENROLLMENT_COMPLETED',compliance:'VALID',validUntil:'2027-10-22',
    });
  });
  it('renewal pending preserves prior qualification only to its original expiration',()=>{
    const previous={issuedAt:'2025-10-23',expiresAt:'2026-10-25',isActive:true};
    expect(projectExternalExamCompliance({...base,study,previousQualification:previous}))
      .toMatchObject({compliance:'VALID',validUntil:'2026-10-25',learning:'EXAM_PENDING'});
    expect(projectExternalExamCompliance({...base,study,today:'2026-10-26',
      previousQualification:previous})).toMatchObject({
        compliance:'EXPIRED',validUntil:null,learning:'EXAM_PENDING',
      });
  });
  it('reproval does not revoke an existing valid qualification or pass the exam',()=>{
    const failed={...exam,result:'FAILED' as const};
    expect(projectExternalExamCompliance({...base,study,exam:failed,
      previousQualification:{issuedAt:'2025-01-01',expiresAt:'2027-01-01',isActive:true}}))
      .toMatchObject({learning:'EXAM_FAILED',compliance:'VALID',
        qualificationIssuanceEligible:false});
  });
  it('rejects cross-tenant and different edition exam attempts',()=>{
    expect(projectExternalExamCompliance({...base,study,exam:{...exam,scope:{...scope,empresaId:7}}}))
      .toMatchObject({learning:'EXAM_PENDING',qualificationIssuanceEligible:false});
    expect(projectExternalExamCompliance({...base,study,exam:{...exam,scope:{...scope,courseEditionSha256:sha('d')}}}))
      .toMatchObject({learning:'EXAM_PENDING'});
  });
  it('pre-study exam or missing Worker study receipt is not accepted',()=>{
    expect(projectExternalExamCompliance({...base,exam}))
      .toMatchObject({learning:'STUDY_IN_PROGRESS',examEligible:false});
    expect(projectExternalExamCompliance({...base,study,exam:{...exam,completedAt:'2026-10-19'}}))
      .toMatchObject({learning:'EXAM_PENDING'});
  });
  it('training deadline is independent from qualification expiry',()=>{
    expect(projectExternalExamCompliance({...base,study,today:'2026-11-01'}))
      .toMatchObject({trainingDeadline:'OVERDUE',compliance:'NOT_QUALIFIED'});
    expect(projectExternalExamCompliance({...base,study,
      previousQualification:{issuedAt:'2024-01-01',expiresAt:null,isActive:true},
      today:'2026-11-01'}))
      .toMatchObject({trainingDeadline:'OVERDUE',compliance:'VALID',validUntil:null});
  });
  it('completed enrollment without passed exam exposes inconsistent evidence',()=>{
    const view=projectExternalExamCompliance({...base,study,enrolledCycleCompleted:true});
    expect(view.warnings).toContain('ENROLLMENT_COMPLETION_REQUIRES_VERIFIED_EXTERNAL_EXAM');
  });
  it('invalid scope and reporting day are rejected',()=>{
    expect(()=>projectExternalExamCompliance({...base,today:'2026-02-31'}))
      .toThrow('TRAINING_COMPLIANCE_SCOPE_OR_DATE_INVALID');
    expect(()=>projectExternalExamCompliance({...base,scope:{...scope,empresaId:0}}))
      .toThrow('TRAINING_COMPLIANCE_SCOPE_OR_DATE_INVALID');
  });
});
