import {describe,expect,it} from 'vitest';
import {
  qaPath,validateQaProfile,validateQaModuleSession,validateQaJointReadiness,
  type QaModuleSession,type QaProfile,type QaProjectFixture,
} from './fixture-contract';

const staging='https://qa-lms.airtrust.example';
const apiOrigin='https://qa-api.airtrust.example';
const edition='a'.repeat(64);
const contentOrigin='https://qa-content.airtrust.example';
function project(offset:number):QaProjectFixture {
  const enrollment=(n:number)=>({
    enrollmentId:offset+n,cycleId:offset+n+100,editionSha256:edition,
    launchPath:'/qa/launch/'+(offset+n),snapshotPath:'/qa/snapshot/'+(offset+n),
  });
  const units=Array.from({length:42},(_,i)=>({
    id:'unit-'+String(i+1),visualCue:'Original author content '+String(i+1),
    ...(i===1?{practice:{question:'Synthetic formative?',wrong:'No',correct:'Yes'}}:{}),
    ...(i<8?{official:{stageId:'mod-'+(i+1),questions:[
      {question:'Synthetic assessment?',wrong:'No',correct:'Yes'},
    ]}}:{}),
  }));
  return {
    doutrinamento:{...enrollment(1),units,
      qualificationPath:'/qa/qualification/'+offset,
      certificatePath:'/qa/certificate/'+offset},
    resume80:{...enrollment(2),expectedResumeUnitId:'unit-34',
      creditedNavigationIds:['unit-1','unit-2'],minPreviousPct:80},
    external:{...enrollment(3),frameSelectors:['#outer','#scorm-frame'],
      visualLastPageButton:'Last page',wrongAnswerButton:'Incorrect',
      correctAnswerButton:'Correct',submitButton:'Submit',finishButton:'Finish',
      learnerCompletionButton:'Confirmar conclusão',
      scormSnapshotPath:'/qa/scorm-state/'+offset},
  };
}
function fixture():QaProfile {
  return {baseUrl:staging,apiBaseUrl:apiOrigin,contentOrigin,
    expectedSourceSha:'b'.repeat(40),empresaId:6001,
    courseTitle:'Doutrinamento em Segurança e Qualidade RC8.1 (synthetic)',
    projects:{chromium:project(1000),webkit:project(2000)}};
}
describe('Front D QA contract — no network, no real students',()=>{
  it('admits exact-tenant, isolated content and six independent synthetic enrollments',()=>{
    const input=fixture();
    expect(validateQaProfile(input,'chromium',staging,apiOrigin,'6001').fixture).toBe(input.projects.chromium);
    expect(validateQaProfile(input,'webkit',staging,apiOrigin,'6001').fixture).toBe(input.projects.webkit);
  });
  it('never permits production as a base URL, even when expressly allowlisted',()=>{
    const p=fixture();p.baseUrl='https://airtrust.online';
    expect(()=>validateQaProfile(p,'chromium',p.baseUrl,apiOrigin,'6001')).toThrow('PRODUCTION_FORBIDDEN');
  });
  it('requires HTTPS and explicit staging hostname and exact allowlist',()=>{
    const p=fixture();p.baseUrl='http://qa-lms.airtrust.example';
    expect(()=>validateQaProfile(p,'chromium',p.baseUrl,apiOrigin,'6001')).toThrow('HTTPS_STAGING_ORIGIN');
    p.baseUrl='https://app.airtrust.example';
    expect(()=>validateQaProfile(p,'chromium',p.baseUrl,apiOrigin,'6001')).toThrow('EXPLICIT_STAGING_HOST_REQUIRED');
    p.baseUrl=staging;
    expect(()=>validateQaProfile(p,'chromium','https://other-qa.example',apiOrigin,'6001')).toThrow('STAGING_ORIGIN_ALLOWLIST');
  });
  it('requires exact tenant allowlisting separate from private profile',()=>{
    const p=fixture();
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,''))
      .toThrow('SYNTHETIC_TENANT_ALLOWLIST');
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6'))
      .toThrow('SYNTHETIC_TENANT_ALLOWLIST');
    expect(validateQaProfile(p,'chromium',staging,apiOrigin,'6001').profile.empresaId)
      .toBe(6001);
  });
  it('requires an exact, separately approved staging Worker and a 40-digit source SHA',()=>{
    const p=fixture();p.apiBaseUrl='https://api.airtrust.online';
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001'))
      .toThrow('HTTPS_STAGING_API_ORIGIN');
    p.apiBaseUrl=apiOrigin;
    expect(()=>validateQaProfile(p,'chromium',staging,'https://qa-wrong.example','6001'))
      .toThrow('STAGING_API_ORIGIN_ALLOWLIST');
    p.expectedSourceSha='invalid';
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001'))
      .toThrow('PINNED_WORKER_SOURCE_SHA');
  });
  it('refuses nonsegregated HTML5 origin and missing second browser fixture',()=>{
    const p=fixture();p.contentOrigin=staging;
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001')).toThrow('ISOLATED_HTML5_CONTENT_ORIGIN');
    p.contentOrigin=contentOrigin;
    delete p.projects.webkit;
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001')).toThrow('BOTH_INDEPENDENT_BROWSER_PROJECTS');
  });
  it('requires all 42 authored units, exactly eight official module assessments and actual practice',()=>{
    const p=fixture();p.projects.chromium.doutrinamento.units.pop();
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001')).toThrow('DOU_RC81_42_UNITS');
    const p2=fixture();
    p2.projects.chromium.doutrinamento.units[0].official=undefined;
    expect(()=>validateQaProfile(p2,'chromium',staging,apiOrigin,'6001')).toThrow('DOU_RC81_EIGHT_MODULAR_ASSESSMENTS');
    const p3=fixture();
    p3.projects.chromium.doutrinamento.units[1].practice=undefined;
    expect(()=>validateQaProfile(p3,'chromium',staging,apiOrigin,'6001')).toThrow('FORMATIVE_GATE_REQUIRED');
  });
  it('rejects mismatched or duplicate enrollment identities across Chromium and WebKit',()=>{
    const p=fixture();
    p.projects.webkit.external.enrollmentId=p.projects.chromium.external.enrollmentId;
    expect(()=>validateQaProfile(p,'webkit',staging,apiOrigin,'6001')).toThrow('DEDICATED_PER_BROWSER_ENROLLMENTS');
    const p2=fixture();
    p2.projects.chromium.resume80.editionSha256='wrong';
    expect(()=>validateQaProfile(p2,'chromium',staging,apiOrigin,'6001')).toThrow('SYNTHETIC_ENROLLMENT_IDENTITIES');
  });
  it('rejects forged credential-in-URL, traversal, protocol-relative and cross-origin requests',()=>{
    expect(()=>qaPath(staging,'https://other-qa.example/a')).toThrow('RELATIVE_API_OR_LAUNCH_PATH');
    expect(()=>qaPath(staging,'//other-qa.example/a')).toThrow('RELATIVE_API_OR_LAUNCH_PATH');
    expect(()=>qaPath(staging,'/qa/%2e%2e/other')).toThrow('UNSAFE_RELATIVE_PATH');
    expect(()=>qaPath(staging,'/qa/../other')).toThrow('UNSAFE_RELATIVE_PATH');
    expect(qaPath(staging,'/qa/snapshot/1001')).toBe(staging+'/qa/snapshot/1001');
  });
  it('blocks staging fixtures from silently pointing authored media to production',()=>{
    const p=fixture();
    p.contentOrigin='https://cdn.airtrust.online';
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001'))
      .toThrow('ISOLATED_HTML5_CONTENT_ORIGIN');
    p.contentOrigin='https://qa-content.airtrust.example';
    expect(validateQaProfile(p,'chromium',staging,apiOrigin,'6001').profile.contentOrigin)
      .toBe('https://qa-content.airtrust.example');
  });
  it('rejects token-bearing or fragment URLs while permitting benign query filters',()=>{
    expect(()=>qaPath(staging,'/qa/start?access_token=something'))
      .toThrow('NO_CREDENTIALS_IN_URL');
    expect(()=>qaPath(staging,'/qa/start?jwt=something'))
      .toThrow('NO_CREDENTIALS_IN_URL');
    expect(()=>qaPath(staging,'/qa/start#unsafe'))
      .toThrow('NO_CREDENTIALS_IN_URL');
    expect(qaPath(staging,'/qa/start?enrollment=123'))
      .toBe(staging+'/qa/start?enrollment=123');
  });
  it('preserves historical 80% range and disallows suspicious answer fixtures',()=>{
    const p=fixture();p.projects.chromium.resume80.minPreviousPct=100;
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001')).toThrow('SOURCE_80_PERCENT_BASELINE');
    const p2=fixture();
    const quiz=p2.projects.chromium.doutrinamento.units[0].official!.questions[0];
    quiz.wrong=quiz.correct;
    expect(()=>validateQaProfile(p2,'chromium',staging,apiOrigin,'6001')).toThrow('AUTHOR_UNIT_AND_EXAM_MAP');
  });
});


function realModuleProjection(): QaModuleSession {
  return {
    editionSha256:edition,cycleId:1101,
    completionSupported:false,allOfficialStagesPassed:false,
    stages:Array.from({length:8},(_,i)=>({
      stageId:'mod-'+(i+1),attempts:0,lastScorePct:null,
      passed:false,nextAttemptNumber:1,
    })),
  };
}
const eightStages=Array.from({length:8},(_,i)=>'mod-'+(i+1));
describe('Front D — Worker authoritative stage session (read-only)',()=>{
  it('accepts pristine, actual per-stage failure and recovered pass without fake completion',()=>{
    const original=realModuleProjection();
    expect(validateQaModuleSession(original,edition,1101,eightStages).stages)
      .toHaveLength(8);
    original.stages[0]={stageId:'mod-1',attempts:1,lastScorePct:25,
      passed:false,nextAttemptNumber:2};
    expect(validateQaModuleSession(original,edition,1101,eightStages)
      .allOfficialStagesPassed).toBe(false);
    original.stages[0]={stageId:'mod-1',attempts:2,lastScorePct:100,
      passed:true,nextAttemptNumber:3};
    expect(validateQaModuleSession(original,edition,1101,eightStages)
      .stages[0].passed).toBe(true);
    original.stages.forEach((s,i)=>{if(i>0)original.stages[i]={
      ...s,attempts:1,lastScorePct:100,passed:true,nextAttemptNumber:2,
    };});
    original.allOfficialStagesPassed=true;
    expect(validateQaModuleSession(original,edition,1101,eightStages)
      .allOfficialStagesPassed).toBe(true);
  });
  it('rejects stale edition or cross-cycle stage receipts',()=>{
    const s=realModuleProjection();
    expect(()=>validateQaModuleSession(s,'c'.repeat(64),1101,eightStages))
      .toThrow('MODULE_SESSION_PINNED_EDITION_CYCLE');
    expect(()=>validateQaModuleSession(s,edition,9999,eightStages))
      .toThrow('MODULE_SESSION_PINNED_EDITION_CYCLE');
  });
  it('rejects omitted, duplicate or invented stage IDs',()=>{
    const s=realModuleProjection();s.stages.pop();
    expect(()=>validateQaModuleSession(s,edition,1101,eightStages))
      .toThrow('MODULE_SESSION_STAGE_COUNT');
    const v=realModuleProjection();v.stages[1].stageId='mod-1';
    expect(()=>validateQaModuleSession(v,edition,1101,eightStages))
      .toThrow('MODULE_SESSION_STAGE_ID');
    const x=realModuleProjection();x.stages[1].stageId='other';
    expect(()=>validateQaModuleSession(x,edition,1101,eightStages))
      .toThrow('MODULE_SESSION_POLICY_STAGE_MISMATCH');
  });
  it('rejects fabricated grade, pass without attempt or impossible replay sequencing',()=>{
    const s=realModuleProjection();
    s.stages[0].passed=true;
    expect(()=>validateQaModuleSession(s,edition,1101,eightStages))
      .toThrow('MODULE_SESSION_ATTEMPT_INTEGRITY');
    s.stages[0].passed=false;s.stages[0].attempts=1;s.stages[0].lastScorePct=101;
    expect(()=>validateQaModuleSession(s,edition,1101,eightStages))
      .toThrow('MODULE_SESSION_ATTEMPT_INTEGRITY');
    s.stages[0].lastScorePct=70;s.stages[0].nextAttemptNumber=1;
    expect(()=>validateQaModuleSession(s,edition,1101,eightStages))
      .toThrow('MODULE_SESSION_ATTEMPT_INTEGRITY');
  });
  it('never confuses a capability hint with final course certification',()=>{
    const s=realModuleProjection();
    s.stages=s.stages.map(stage=>({...stage,attempts:1,lastScorePct:100,
      passed:true,nextAttemptNumber:2}));
    s.allOfficialStagesPassed=true;
    // Later Worker releases may advertise terminal availability, but the
    // harness still requires a separate authenticated final status + PDF.
    s.completionSupported=true;
    expect(validateQaModuleSession(s,edition,1101,eightStages)
      .completionSupported).toBe(true);
    (s as unknown as {completionSupported:unknown}).completionSupported='true';
    expect(()=>validateQaModuleSession(s,edition,1101,eightStages))
      .toThrow('MODULE_SESSION_NO_PREMATURE_COMPLETION');
  });
});


describe('Front D — joined content and official-stage readiness (read-only)',()=>{
  const enrollment=()=>fixture().projects.chromium.doutrinamento;
  const ready=()=>({
    matricula_id:1001, editionSha256:edition,cycleId:1101,
    totalRequiredLessons:42,verifiedLessons:42,
    officialStageCount:8,officialStagesPassed:8,
    readyForAtomicTerminalPreflight:true,
    reason:'READY_FOR_TERMINAL_PREFLIGHT' as const,
    completionSupported:false,completion_supported:false,
  });
  it('accepts real 42/42 plus 8/8 readiness without claiming completion',()=>{
    const r=ready();
    expect(validateQaJointReadiness(r,enrollment(),42,8).readyForAtomicTerminalPreflight)
      .toBe(true);
    expect(validateQaJointReadiness(r,enrollment(),42,8).completion_supported)
      .toBe(false);
  });
  it('permits genuine incomplete content even with eight passed stages',()=>{
    const r={...ready(),verifiedLessons:41,reason:'CONTENT_NOT_FINISHED' as const,
      readyForAtomicTerminalPreflight:false};
    expect(validateQaJointReadiness(r,enrollment(),42,8).verifiedLessons).toBe(41);
  });
  it('permits all content but a failed official module without fake terminal',()=>{
    const r={...ready(),officialStagesPassed:7,
      reason:'OFFICIAL_STAGES_NOT_PASSED' as const,
      readyForAtomicTerminalPreflight:false};
    expect(validateQaJointReadiness(r,enrollment(),42,8).officialStagesPassed).toBe(7);
  });
  it('rejects stale edition, mismatched cycle and cross-enrollment projection',()=>{
    for(const [field,value] of [
      ['editionSha256','b'.repeat(64)],['cycleId',999],['matricula_id',900],
    ] as const) {
      expect(()=>validateQaJointReadiness({...ready(),[field]:value},
        enrollment(),42,8)).toThrow('JOINT_READINESS_PINNED_ENROLLMENT_EDITION_CYCLE');
    }
  });
  it('refuses mismatched 41/42 and seven-stage manifests or overstated evidence',()=>{
    const e=enrollment();
    for(const r of [
      {...ready(),totalRequiredLessons:41},
      {...ready(),officialStageCount:7},
      {...ready(),verifiedLessons:43},
      {...ready(),officialStagesPassed:9},
    ]) {
      expect(()=>validateQaJointReadiness(r,e,42,8))
        .toThrow('JOINT_READINESS_CONTENT_STAGE_COUNTS');
    }
  });
  it('refuses ready claims with missing evidence or inconsistent reason',()=>{
    for(const r of [
      {...ready(),verifiedLessons:41},
      {...ready(),officialStagesPassed:7},
      {...ready(),reason:'CONTENT_NOT_FINISHED'},
      {...ready(),readyForAtomicTerminalPreflight:false},
    ]) {
      expect(()=>validateQaJointReadiness(r,enrollment(),42,8))
        .toThrow('JOINT_READINESS_REASON_AND_EVIDENCE');
    }
  });
  it('refuses even a ready diagnostic that claims a certificate or completion capability',()=>{
    for(const r of [
      {...ready(),completionSupported:true},
      {...ready(),completion_supported:true},
      {...ready(),completion_supported:undefined},
    ]) {
      expect(()=>validateQaJointReadiness(r,enrollment(),42,8))
        .toThrow('JOINT_READINESS_NEVER_CERTIFIES');
    }
  });
});
