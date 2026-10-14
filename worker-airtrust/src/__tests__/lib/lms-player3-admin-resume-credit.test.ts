import {describe,expect,it} from 'vitest';
import {createAdminResumeCreditIntent} from '../../lib/lms-player3/admin-resume-credit';
import type {LegacyEnrollment,DestinationEdition} from '../../lib/lms-player3/continuity';
import type {LegacySourceEdition} from '../../lib/lms-player3/continuity-from-scorm';

const sha='a'.repeat(64);
const enrollment:LegacyEnrollment={
  empresa_id:6,matricula_id:911,curso_id:57,funcionario_id:77,
  matricula_status:'EM_ANDAMENTO',matricula_progresso_pct:80,
  matricula_updated_at:'2026-10-14 13:00:00',
  ciclo_id:333,ciclo_numero:1,ciclo_status:'EM_ANDAMENTO',
  ciclo_progresso_pct:80,ciclo_atual:1,ciclo_updated_at:'2026-10-14 13:00:00',
  curso_version_tag:'RC8',scorm_versao:'1.2',ultimo_slide:2,ultima_pagina:2,
  scorm_id:801,scorm_lesson_status:'incomplete',
  scorm_completion_status:null,scorm_success_status:null,
  scorm_score_raw:100,scorm_last_commit_at:'2026-10-14 12:59:00',
  scorm_suspend_data_sha256:sha,scorm_cmi_json_sha256:sha,
};
const sourceEdition:LegacySourceEdition={
  empresa_id:6,curso_id:57,source_edition_sha256:sha,
  course_version_tag:'RC8',source_package_version:'V0.1.3-RC8.1',
  ordered_source_unit_ids:['intro','u1','u2'],
};
const destination:DestinationEdition={
  empresa_id:6,curso_id:57,source_version_tag:'RC8',
  edition_sha256:'b'.repeat(64),
  target_unit_ids:['intro','u1','u2'],
  certified_source_unit_ids:['intro','u1','u2'],
  units_by_source_id:{intro:'intro',u1:'u1',u2:'u2'},
};
const persistedSuspendData=JSON.stringify({
  v:3,p:sourceEdition.source_package_version,a:2,d:[0,1],
  claimPassed:true,score:100,
});
const review={
  actor_user_id:89,approver_user_id:90,
  training_manager_authorized:true,second_reviewer_authorized:true,
  approved_at:'2026-10-14T14:00:00Z',
  source_snapshot_sha256:'c'.repeat(64),
  expected_matricula_updated_at:enrollment.matricula_updated_at as string,
  expected_scorm_commit_at:enrollment.scorm_last_commit_at,
  expected_ciclo_id:333,approved_resume_unit_id:'u2',
  justification:'Crédito administrativo para retomada documentada pelo LMS anterior.',
};
const create=(part:Record<string,unknown>={})=>createAdminResumeCreditIntent({
  enrollment,sourceEdition,destination,persistedSuspendData,review,...part,
});

describe('Player 3 governed administrative resume intent',()=>{
  it('restores position while never fabricating passes/certificates',()=>{
    const out=create();
    expect(out).toMatchObject({
      kind:'AIRTRUST_PLAYER3_ADMIN_RESUME_CREDIT_V1',
      matricula_id:911,empresa_id:6,ciclo_id:333,
      original_progress_pct:80,resume_unit_id:'u2',
      advances_navigation_only:true,grants_assessment_pass:false,
      grants_completion:false,grants_certificate:false,
    });
  });
  it('does not accept a different approver, a missing second actor, or vague reasons',()=>{
    expect(()=>create({review:{...review,approver_user_id:89}}))
      .toThrow('REVIEW_CONTEXT_INVALID');
    expect(()=>create({review:{...review,justification:'ok'}}))
      .toThrow('REVIEW_CONTEXT_INVALID');
  });
  it('rejects an approval that has not passed server RBAC review',()=>{
    expect(()=>create({review:{...review,training_manager_authorized:false}}))
      .toThrow('REVIEW_CONTEXT_INVALID');
    expect(()=>create({review:{...review,second_reviewer_authorized:false}}))
      .toThrow('REVIEW_CONTEXT_INVALID');
  });
  it('blocks stale snapshot watermarks and renewed cycles',()=>{
    expect(()=>create({review:{...review,expected_matricula_updated_at:'2026-10-13'}}))
      .toThrow('REVIEW_CONTEXT_INVALID');
    expect(()=>create({enrollment:{...enrollment,ciclo_id:334}}))
      .toThrow('REVIEW_CONTEXT_INVALID');
    expect(()=>create({review:{...review,expected_scorm_commit_at:'old'}}))
      .toThrow('REVIEW_CONTEXT_INVALID');
  });
  it('rejects tampered target module and unknown source package',()=>{
    expect(()=>create({review:{...review,approved_resume_unit_id:'intro'}}))
      .toThrow('NOT_ELIGIBLE_FOR_BOOKMARK_CREDIT');
    expect(()=>create({persistedSuspendData:JSON.stringify({
      v:3,p:'different',a:2,d:[0,1],
    })})).toThrow('NOT_ELIGIBLE_FOR_BOOKMARK_CREDIT');
  });
  it('rejects conflicted source and unreviewed cross-tenant mapping',()=>{
    expect(()=>create({enrollment:{...enrollment,ciclo_progresso_pct:30}}))
      .toThrow('NOT_ELIGIBLE_FOR_BOOKMARK_CREDIT');
    expect(()=>create({destination:{...destination,empresa_id:7}})).toThrow();
  });
  it('does not treat progress at 100 as a reason to certify administratively',()=>{
    const advanced={...enrollment,matricula_progresso_pct:100,ciclo_progresso_pct:100};
    expect(()=>create({enrollment:advanced})).toThrow('NOT_ELIGIBLE_FOR_BOOKMARK_CREDIT');
  });
});