import {describe,expect,it} from 'vitest';
import {
  qaPath,validateQaProfile,validateQaModuleSession,validateQaJointReadiness,
  validateQaAuthoredContentUrl,RC81_SOURCE_SHA256,
  validateQaCertificatePdf,validateQaCertificateArchiveStatus,
  validateQaAuthoredStageAttempt,
  validateQaAuthoredLessonCheckpoint,validateQaNativeLessonSession,
  assertQaReadOnlyNonDisclosure,validateQaTerminalReceipt,
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
    id:'unit-'+String(i+1),kind:i<8?'assessment' as const:'lesson' as const,
    ...(i>=8?{lessonId:'unit-'+String(i+1)}:{}),
    visualCue:'Original author content '+String(i+1),
    ...(i===8?{practice:{question:'Synthetic formative?',wrong:'No',correct:'Yes'}}:{}),
    ...(i<8?{official:{stageId:'unit-'+String(i+1),
      questions:Array.from({length:10},(_,j)=>({
        question:'Synthetic authored question '+(j+1)+'?',wrong:'No',correct:'Yes',
      }))}}:{}),
  }));
  return {
    doutrinamento:{...enrollment(1),units,
      courseId:55,sourceZipSha256:RC81_SOURCE_SHA256,
      contentSha256:'c'.repeat(64),
      requiredLessonIds:units.flatMap(u=>u.lessonId?[u.lessonId]:[]),
      qualificationPath:'/qa/qualification/'+offset,
      certificatePath:'/qa/certificate/'+offset},
    resume80:{...enrollment(2),expectedResumeUnitId:'unit-34',
      creditedNavigationIds:['unit-1','unit-2'],minPreviousPct:80},
    external:{...enrollment(3),
      snapshotPath:'/api/lms/native/scorm/matriculas/'+(offset+3)+'/qa-evidencias',
      frameSelectors:['#outer','#scorm-frame'],
      visualLastPageButton:'Last page',wrongAnswerButton:'Incorrect',
      correctAnswerButton:'Correct',submitButton:'Submit',finishButton:'Finish',
      learnerCompletionButton:'Confirmar conclusão',
      scormSnapshotPath:'/api/lms/scorm/state/'+(offset+3)},
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
    expect(validateQaProfile(input,'chromium',staging,apiOrigin,'6001',contentOrigin).fixture).toBe(input.projects.chromium);
    expect(validateQaProfile(input,'webkit',staging,apiOrigin,'6001',contentOrigin).fixture).toBe(input.projects.webkit);
  });
  it('never permits production as a base URL, even when expressly allowlisted',()=>{
    const p=fixture();p.baseUrl='https://airtrust.online';
    expect(()=>validateQaProfile(p,'chromium',p.baseUrl,apiOrigin,'6001',contentOrigin)).toThrow('PRODUCTION_FORBIDDEN');
  });
  it('requires HTTPS and explicit staging hostname and exact allowlist',()=>{
    const p=fixture();p.baseUrl='http://qa-lms.airtrust.example';
    expect(()=>validateQaProfile(p,'chromium',p.baseUrl,apiOrigin,'6001',contentOrigin)).toThrow('HTTPS_STAGING_ORIGIN');
    p.baseUrl='https://app.airtrust.example';
    expect(()=>validateQaProfile(p,'chromium',p.baseUrl,apiOrigin,'6001',contentOrigin)).toThrow('EXPLICIT_STAGING_HOST_REQUIRED');
    p.baseUrl=staging;
    expect(()=>validateQaProfile(p,'chromium','https://other-qa.example',apiOrigin,'6001',contentOrigin)).toThrow('STAGING_ORIGIN_ALLOWLIST');
  });
  it('requires exact tenant allowlisting separate from private profile',()=>{
    const p=fixture();
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'',contentOrigin))
      .toThrow('SYNTHETIC_TENANT_ALLOWLIST');
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6',contentOrigin))
      .toThrow('SYNTHETIC_TENANT_ALLOWLIST');
    expect(validateQaProfile(p,'chromium',staging,apiOrigin,'6001',contentOrigin).profile.empresaId)
      .toBe(6001);
  });
  it('requires an exact, separately approved staging Worker and a 40-digit source SHA',()=>{
    const p=fixture();p.apiBaseUrl='https://api.airtrust.online';
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',contentOrigin))
      .toThrow('HTTPS_STAGING_API_ORIGIN');
    p.apiBaseUrl=apiOrigin;
    expect(()=>validateQaProfile(p,'chromium',staging,'https://qa-wrong.example','6001',contentOrigin))
      .toThrow('STAGING_API_ORIGIN_ALLOWLIST');
    p.expectedSourceSha='invalid';
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',contentOrigin))
      .toThrow('PINNED_WORKER_SOURCE_SHA');
  });
  it('refuses nonsegregated HTML5 origin and missing second browser fixture',()=>{
    const p=fixture();p.contentOrigin=staging;
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',contentOrigin)).toThrow('ISOLATED_HTML5_CONTENT_ORIGIN');
    p.contentOrigin=contentOrigin;
    delete p.projects.webkit;
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',contentOrigin)).toThrow('BOTH_INDEPENDENT_BROWSER_PROJECTS');
  });
  it('pins authored content to the RC8.1 original and the B immutable staging release path',()=>{
    const d=fixture().projects.chromium.doutrinamento;
    const target=contentOrigin+'/player3/6001/55/'+edition+'/'+
      'c'.repeat(64)+'/index.html';
    expect(validateQaAuthoredContentUrl(target,contentOrigin,6001,d)).toBe(target);
    for(const wrong of [
      target+'?token=secret',
      contentOrigin+'/player3/6002/55/'+edition+'/'+'c'.repeat(64)+'/index.html',
      contentOrigin+'/player3/6001/56/'+edition+'/'+'c'.repeat(64)+'/index.html',
      contentOrigin+'/player3/6001/55/'+edition+'/'+'d'.repeat(64)+'/index.html',
      'https://qa-unapproved-assets.example/player3/6001/55/'+edition+'/'+'c'.repeat(64)+'/index.html',
      contentOrigin+'/unversioned/index.html',
    ]){
      expect(()=>validateQaAuthoredContentUrl(wrong,contentOrigin,6001,d))
        .toThrow('RC81_AUTHORED_LAUNCH_SOURCE_BOUND_PATH');
    }
    expect(()=>validateQaAuthoredContentUrl(target,contentOrigin,6001,
      {...d,sourceZipSha256:'0'.repeat(64)}))
      .toThrow('RC81_SOURCE_AND_IMMUTABLE_RELEASE');
    expect(()=>validateQaAuthoredContentUrl(target,contentOrigin,6001,
      {...d,contentSha256:'INVALID'}))
      .toThrow('RC81_SOURCE_AND_IMMUTABLE_RELEASE');
  });
  it('keeps eight authored exam stages distinct from reviewed lesson receipts',()=>{
    const p=fixture();
    const d=p.projects.chromium.doutrinamento;
    expect(d.units).toHaveLength(42);
    expect(d.units.filter(u=>u.kind==='assessment')).toHaveLength(8);
    expect(d.requiredLessonIds).toHaveLength(34);
    expect(validateQaProfile(p,'chromium',staging,apiOrigin,'6001',contentOrigin).fixture.doutrinamento.units)
      .toHaveLength(42);
    d.units[0].lessonId=d.units[8].lessonId;
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',contentOrigin))
      .toThrow('REVIEWED_CANONICAL_LESSON_CROSSWALK');
  });
  it('accepts 42 UI screens and 42 lesson receipts when each exam also records content',()=>{
    const p=fixture();
    const d=p.projects.chromium.doutrinamento;
    d.units.forEach(u=>{u.lessonId=u.id;});
    d.requiredLessonIds=d.units.map(u=>u.id);
    expect(validateQaProfile(p,'chromium',staging,apiOrigin,'6001',contentOrigin)
      .fixture.doutrinamento.requiredLessonIds).toHaveLength(42);
  });
  it('rejects lessons not present on any reviewed author screen',()=>{
    const p=fixture();
    p.projects.chromium.doutrinamento.requiredLessonIds.push('invented-lesson');
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',contentOrigin))
      .toThrow('REVIEWED_CANONICAL_LESSON_CROSSWALK');
  });
  it('requires all 42 authored units, exactly eight official module assessments and actual practice',()=>{
    const p=fixture();p.projects.chromium.doutrinamento.units.pop();
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',contentOrigin)).toThrow('DOU_RC81_42_UNITS');
    const p2=fixture();
    p2.projects.chromium.doutrinamento.units[0].official=undefined;
    expect(()=>validateQaProfile(p2,'chromium',staging,apiOrigin,'6001',contentOrigin)).toThrow('DOU_RC81_EIGHT_MODULAR_ASSESSMENTS');
    const p3=fixture();
    p3.projects.chromium.doutrinamento.units[8].practice=undefined;
    expect(()=>validateQaProfile(p3,'chromium',staging,apiOrigin,'6001',contentOrigin)).toThrow('FORMATIVE_GATE_REQUIRED');
  });
  it('refuses Native-only QA snapshots or invented SCORM CMI sources for an external SCO',()=>{
    const p=fixture();
    const e=p.projects.chromium.external;
    e.snapshotPath='/api/lms/native/matriculas/'+e.enrollmentId+'/etapas/qa-evidencias';
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',contentOrigin))
      .toThrow('EXTERNAL_SCORM_READONLY_SNAPSHOT_ROUTE');
    e.snapshotPath='/api/lms/native/scorm/matriculas/'+e.enrollmentId+'/qa-evidencias';
    e.scormSnapshotPath='/qa/mocked-success';
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',contentOrigin))
      .toThrow('EXTERNAL_SCORM_PERSISTED_CMI_ROUTE');
  });
  it('runs a content-independent technical QA profile without the original RC8.1 ZIP',()=>{
    const p=fixture();
    const technicalZipSha='d'.repeat(64);
    p.qaContentMode='SYNTHETIC_TECHNICAL';
    p.courseTitle='Player 3 — synthetic technical test only';
    for(const fixture of Object.values(p.projects)){
      const d=fixture.doutrinamento;
      d.sourceZipSha256=technicalZipSha;
      d.units=[d.units[0],d.units[1],d.units[8],d.units[9],d.units[10]];
      d.requiredLessonIds=d.units.flatMap(u=>u.lessonId?[u.lessonId]:[]);
    }
    const d=p.projects.chromium.doutrinamento;
    expect(d.units).toHaveLength(5);
    expect(validateQaProfile(p,'chromium',staging,apiOrigin,'6001',contentOrigin,
      technicalZipSha).fixture.doutrinamento.units).toHaveLength(5);
    expect(validateQaProfile(p,'webkit',staging,apiOrigin,'6001',contentOrigin,
      technicalZipSha).fixture.doutrinamento.units).toHaveLength(5);
    const target=contentOrigin+'/player3/6001/55/'+edition+'/'+'c'.repeat(64)+'/index.html';
    expect(validateQaAuthoredContentUrl(target,contentOrigin,6001,d,
      'SYNTHETIC_TECHNICAL',technicalZipSha)).toBe(target);
    // Profile ownership is not authorization to attest a synthetic source.
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',
      contentOrigin)).toThrow('SYNTHETIC_SOURCE_SEPARATE_ALLOWLIST');
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',
      contentOrigin,'e'.repeat(64))).toThrow('SYNTHETIC_SOURCE_SEPARATE_ALLOWLIST');
    expect(()=>validateQaAuthoredContentUrl(target,contentOrigin,6001,d))
      .toThrow('RC81_SOURCE_AND_IMMUTABLE_RELEASE');
    d.sourceZipSha256=RC81_SOURCE_SHA256;
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',
      contentOrigin,RC81_SOURCE_SHA256)).toThrow('SYNTHETIC_SOURCE_SEPARATE_ALLOWLIST');
    d.sourceZipSha256=technicalZipSha;
    d.units=d.units.slice(0,3);
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',
      contentOrigin,technicalZipSha)).toThrow('SYNTHETIC_TECHNICAL_UNIT_COUNT');
  });
  it('rejects silent promotion of a technical-only QA fixture to RC8.1 authored acceptance',()=>{
    const p=fixture();
    p.qaContentMode='SYNTHETIC_TECHNICAL';
    p.projects.chromium.doutrinamento.sourceZipSha256='d'.repeat(64);
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',
      contentOrigin)).toThrow('SYNTHETIC_SOURCE_SEPARATE_ALLOWLIST');
    // RC8.1 original acceptance still requires exact 42 units and eight exams.
    p.qaContentMode='AUTHORED_RC81';
    p.projects.chromium.doutrinamento.units.pop();
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',
      contentOrigin)).toThrow('RC81_SOURCE_AND_IMMUTABLE_RELEASE');
  });
  it('rejects mismatched or duplicate enrollment identities across Chromium and WebKit',()=>{
    const p=fixture();
    p.projects.webkit.external.enrollmentId=p.projects.chromium.external.enrollmentId;
    const duplicateId=p.projects.webkit.external.enrollmentId;
    p.projects.webkit.external.snapshotPath=
      '/api/lms/native/scorm/matriculas/'+duplicateId+'/qa-evidencias';
    p.projects.webkit.external.scormSnapshotPath=
      '/api/lms/scorm/state/'+duplicateId;
    expect(()=>validateQaProfile(p,'webkit',staging,apiOrigin,'6001',contentOrigin)).toThrow('DEDICATED_PER_BROWSER_ENROLLMENTS');
    const p2=fixture();
    p2.projects.chromium.resume80.editionSha256='wrong';
    expect(()=>validateQaProfile(p2,'chromium',staging,apiOrigin,'6001',contentOrigin)).toThrow('SYNTHETIC_ENROLLMENT_IDENTITIES');
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
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',contentOrigin))
      .toThrow('ISOLATED_HTML5_CONTENT_ORIGIN');
    p.contentOrigin='https://qa-content.airtrust.example';
    expect(validateQaProfile(p,'chromium',staging,apiOrigin,'6001',contentOrigin).profile.contentOrigin)
      .toBe('https://qa-content.airtrust.example');
  });
  it('rejects an independently unapproved content host despite an HTTPS QA-looking name',()=>{
    const p=fixture();
    p.contentOrigin='https://qa-unapproved-assets.example';
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',contentOrigin))
      .toThrow('ISOLATED_CONTENT_ORIGIN_ALLOWLIST');
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',''))
      .toThrow('ISOLATED_CONTENT_ORIGIN_ALLOWLIST');
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
    expect(()=>validateQaProfile(p,'chromium',staging,apiOrigin,'6001',contentOrigin)).toThrow('SOURCE_80_PERCENT_BASELINE');
    const p2=fixture();
    const quiz=p2.projects.chromium.doutrinamento.units[0].official!.questions[0];
    quiz.wrong=quiz.correct;
    expect(()=>validateQaProfile(p2,'chromium',staging,apiOrigin,'6001',contentOrigin)).toThrow('AUTHOR_UNIT_AND_EXAM_MAP');
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

describe('Front D — authentic certificate PDF bytes, never a five-byte stub',()=>{
  function pdf():Uint8Array {
    const body='%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'+
      '2 0 obj\n<< /Type /Pages /Count 0 >>\nendobj\n'+
      '3 0 obj\n<< /Length 900 >>\nstream\n'+'X'.repeat(900)+
      '\nendstream\nendobj\nxref\n0 4\n0000000000 65535 f\n'+
      'trailer\n<< /Root 1 0 R /Size 4 >>\nstartxref\n31\n%%EOF\n';
    return new TextEncoder().encode(body);
  }
  it('accepts a complete bounded PDF-shaped response with the correct MIME',()=>{
    expect(()=>validateQaCertificatePdf(pdf(),'application/pdf; charset=binary'))
      .not.toThrow();
  });
  it('rejects a successful HTTP response containing only fake PDF magic bytes',()=>{
    expect(()=>validateQaCertificatePdf(new TextEncoder().encode('%PDF-'),'application/pdf'))
      .toThrow('CERTIFICATE_PDF_SIZE');
  });
  it('rejects HTML/JSON impersonating a PDF and truncated documents',()=>{
    expect(()=>validateQaCertificatePdf(pdf(),'application/json'))
      .toThrow('CERTIFICATE_PDF_CONTENT_TYPE');
    const truncated=pdf().subarray(0,-10);
    expect(()=>validateQaCertificatePdf(truncated,'application/pdf'))
      .toThrow('CERTIFICATE_PDF_STRUCTURE');
    const fake=new TextEncoder().encode('NOTPDF'+ 'X'.repeat(1100)+
      'startxref\n1\n%%EOF\n');
    expect(()=>validateQaCertificatePdf(fake,'application/pdf'))
      .toThrow('CERTIFICATE_PDF_STRUCTURE');
  });
});

describe('Front D — protected read-only projections disclose no grading material',()=>{
  it('blocks hidden answers in a regraded module session regardless of public aggregate',()=>{
    const receipt=realModuleProjection();
    expect(()=>validateQaModuleSession({...receipt,
      unexpected:{private:{correctOptionId:'answer-1'}}},
      edition,1101,eightStages))
      .toThrow('WORKER_READONLY_PRIVATE_MATERIAL_LEAK');
    expect(()=>validateQaModuleSession({...receipt,
      unexpected:{attempts:[{questionId:'q1',optionId:'o1'}]}},
      edition,1101,eightStages))
      .toThrow('WORKER_READONLY_PRIVATE_MATERIAL_LEAK');
  });
  it('blocks private bank URLs or hashes in read-only readiness diagnostics',()=>{
    const course=fixture().projects.chromium.doutrinamento;
    const clean={
      matricula_id:course.enrollmentId,editionSha256:course.editionSha256,
      cycleId:course.cycleId,totalRequiredLessons:course.requiredLessonIds.length,
      verifiedLessons:0,officialStageCount:8,officialStagesPassed:0,
      reason:'CONTENT_NOT_FINISHED',readyForAtomicTerminalPreflight:false,
      completionSupported:false,completion_supported:false,
    };
    expect(()=>validateQaJointReadiness({...clean,
      extra:{answers_sha256:'f'.repeat(64)}},
      course,course.requiredLessonIds.length,8))
      .toThrow('WORKER_READONLY_PRIVATE_MATERIAL_LEAK');
    expect(()=>validateQaJointReadiness({...clean,
      extra:['player3-server-private-bank.json']},
      course,course.requiredLessonIds.length,8))
      .toThrow('WORKER_READONLY_PRIVATE_MATERIAL_LEAK');
  });
  it('rejects malformed or unbounded diagnostic bodies before grading claims',()=>{
    const cyclic:Record<string,unknown>={};
    cyclic.self=cyclic;
    expect(()=>assertQaReadOnlyNonDisclosure(cyclic))
      .toThrow('WORKER_READONLY_DATA_INVALID');
    expect(()=>assertQaReadOnlyNonDisclosure({debug:'x'.repeat(130*1024)}))
      .toThrow('WORKER_READONLY_DATA_BOUNDED');
    expect(()=>assertQaReadOnlyNonDisclosure({stageId:'mod1',passed:true,attempts:1}))
      .not.toThrow();
  });
});

describe('Front D — Front B terminal API is never evidence of a finished PDF',()=>{
  const acknowledged=()=>({
    success:true,data:{
      matricula_id:1001,status:'CONCLUIDO',
      qualification_outcome:'qualification_created',
      certificate_state:'REQUIRES_VERIFICATION',
    },
  });
  it('accepts an exact enrolled, committed qualification receipt only as advisory',()=>{
    expect(validateQaTerminalReceipt(acknowledged(),1001).data.certificate_state)
      .toBe('REQUIRES_VERIFICATION');
    expect(validateQaTerminalReceipt({
      ...acknowledged(),data:{...acknowledged().data,
        qualification_outcome:'qualification_reused'},
    },1001).data.qualification_outcome).toBe('qualification_reused');
  });
  it('rejects wrong enrollment, noncommitted status or a failed terminal response',()=>{
    for(const r of [
      {...acknowledged(),success:false},
      {...acknowledged(),data:{...acknowledged().data,matricula_id:1002}},
      {...acknowledged(),data:{...acknowledged().data,status:'EM_ANDAMENTO'}},
    ]){
      expect(()=>validateQaTerminalReceipt(r,1001))
        .toThrow('TERMINAL_RECEIPT_COMMITTED_ENROLLMENT');
    }
  });
  it('refuses invented or premature certificate success',()=>{
    for(const r of [
      {...acknowledged(),data:{...acknowledged().data,certificate_state:'ISSUED'}},
      {...acknowledged(),data:{...acknowledged().data,qualification_outcome:'not-required'}},
      {...acknowledged(),data:{...acknowledged().data,certificate_state:null}},
    ]){
      expect(()=>validateQaTerminalReceipt(r,1001))
        .toThrow('TERMINAL_CERTIFICATE_REQUIRES_REAL_VERIFICATION');
    }
  });
  it('refuses an API receipt leaking answer keys or private attempt hashes',()=>{
    expect(()=>validateQaTerminalReceipt({
      ...acknowledged(),private:{answers_sha256:'a'.repeat(64)},
    },1001)).toThrow('WORKER_READONLY_PRIVATE_MATERIAL_LEAK');
  });
});

describe('Front D — B authenticated post-commit certificate archive reader',()=>{
  const enrolled=()=>fixture().projects.chromium.doutrinamento;
  const doc=()=>({
    matricula_id:enrolled().enrollmentId,
    ciclo_id:enrolled().cycleId,matricula_status:'CONCLUIDO',
    historico_id:9091,certificate_state:'PDF_HEADER_VERIFIED',
    documento_id:9092,stream_path:'/api/pasta-virtual/stream/9092',
    stream_verified:false,
  });
  it('accepts the exact canonical history and PDF stream path, not R2 direct URLs',()=>{
    expect(validateQaCertificateArchiveStatus(doc(),enrolled(),9091,9092,
      '/api/pasta-virtual/stream/9092').stream_verified).toBe(false);
  });
  it('rejects a different tenant-enrollment, cycle, history or document',()=>{
    for(const bad of [
      {matricula_id:9999},{ciclo_id:9999},{historico_id:9000},
      {documento_id:9000},{matricula_status:'EM_ANDAMENTO'},
    ]){
      expect(()=>validateQaCertificateArchiveStatus({...doc(),...bad},
        enrolled(),9091,9092,'/api/pasta-virtual/stream/9092'))
        .toThrow('CERTIFICATE_ARCHIVE_CANONICAL_LINK');
    }
  });
  it('refuses header-only records as certificates, external R2 links, fake stream verified',()=>{
    for(const bad of [
      {certificate_state:'CERTIFICATE_NOT_ARCHIVED'},
      {certificate_state:'CERTIFICATE_PDF_INVALID'},
      {stream_path:'https://r2-evil.example/pdf/9092'},
      {stream_path:'/api/pasta-virtual/stream/9093'},
      {stream_verified:true},
    ]){
      expect(()=>validateQaCertificateArchiveStatus({...doc(),...bad},
        enrolled(),9091,9092,'/api/pasta-virtual/stream/9092'))
        .toThrow('CERTIFICATE_ARCHIVE_AUTHENTICATED_STREAM');
    }
    expect(()=>validateQaCertificateArchiveStatus(doc(),enrolled(),9091,9092,
      '/api/private-fabricated-certificate')).toThrow(
        'CERTIFICATE_ARCHIVE_AUTHENTICATED_STREAM');
  });
  it('does not accept exposed private grading metadata inside archive reader',()=>{
    expect(()=>validateQaCertificateArchiveStatus({...doc(),
      debug:{correctOptionId:'private'}},enrolled(),9091,9092,
      '/api/pasta-virtual/stream/9092'))
      .toThrow('WORKER_READONLY_PRIVATE_MATERIAL_LEAK');
  });
});

describe('Front D — real RC8.1 browser POST replay and grading boundary',()=>{
  const row=(n=1,eventId='p3-'+'a'.repeat(32))=>({
    eventId,attemptNumber:n,
    answers:Array.from({length:10},(_,i)=>({
      questionId:'q-'+(i+1),optionId:'o'+(i%4),
    })),
  });
  it('accepts fail→retake with distinct event IDs and consecutive attempt numbers',()=>{
    const first=validateQaAuthoredStageAttempt(row(),1,new Set());
    const seen=new Set([first.eventId]);
    const second=validateQaAuthoredStageAttempt(
      row(2,'p3-'+'b'.repeat(32)),2,seen);
    expect(second.attemptNumber).toBe(2);
  });
  it('rejects repeated eventId, wrong attempt counter and nonrandom IDs',()=>{
    expect(()=>validateQaAuthoredStageAttempt(row(),1,new Set([row().eventId])))
      .toThrow('RC81_ATTEMPT_EVENT_ID_UNIQUE');
    expect(()=>validateQaAuthoredStageAttempt(row(1),2,new Set()))
      .toThrow('RC81_OFFICIAL_ATTEMPT_NUMBER_AND_BODY');
    expect(()=>validateQaAuthoredStageAttempt(
      row(1,'event-1'),1,new Set())).toThrow('RC81_ATTEMPT_EVENT_ID_UNIQUE');
  });
  it('rejects client-forged score, tenant, pass, certificate or scope',()=>{
    for(const extra of [
      {score_pct:100},{stage_passed:true},{empresa_id:6},
      {certificate_id:55},{matriculaId:99},{cycleId:800},
    ]) {
      expect(()=>validateQaAuthoredStageAttempt({...row(),...extra},1,new Set()))
        .toThrow('RC81_OFFICIAL_ATTEMPT_NUMBER_AND_BODY');
    }
  });
  it('rejects duplicate question IDs, missing questions and private graded choices',()=>{
    for(const bad of [
      {...row(),answers:row().answers.slice(0,9)},
      {...row(),answers:[...row().answers.slice(0,9),row().answers[0]]},
      {...row(),answers:row().answers.map((x,i)=>
        i===0?{...x,correct:true}:x)},
      {...row(),answers:row().answers.map((x,i)=>
        i===0?{...x,optionId:'private-key'}:x)},
      {...row(),answers:row().answers.map((x,i)=>
        i===0?{...x,optionId:'o10'}:x)},
    ]) {
      expect(()=>validateQaAuthoredStageAttempt(bad,1,new Set()))
        .toThrow('RC81_PUBLIC_CHOICES_ONLY_NO_CLIENT_GRADE');
    }
  });
});

describe('Front D — RC8.1 original lesson D1 evidence, not 42/42 visual illusion',()=>{
  const e={enrollmentId:600,cycleId:500,editionSha256:edition,
    launchPath:'/qa/launch/600',snapshotPath:'/qa/snapshot/600'};
  const ids=['lesson-a','lesson-b'];
  const recorded={
    matricula_id:600,ciclo_id:500,edition_sha256:edition,
    mode:'LEARN',next_sequence:3,seen_lesson_ids:ids,
    total_lessons:2,last_visited_unit_id:'lesson-b',
  };
  it('pins unique checkpoint IDs and strictly increasing sequence to reviewed lesson IDs',()=>{
    const a=validateQaAuthoredLessonCheckpoint({
      eventId:'p3v-'+'a'.repeat(32),sequence:1,unitId:'lesson-a',
    },'lesson-a',1,new Set());
    const b=validateQaAuthoredLessonCheckpoint({
      eventId:'p3v-'+'b'.repeat(32),sequence:2,unitId:'lesson-b',
    },'lesson-b',2,new Set([a.eventId]));
    expect(b.sequence).toBe(2);
    expect(validateQaNativeLessonSession(recorded,e,ids).next_sequence).toBe(3);
  });
  it('rejects invented completion, scores, tenant and cross-cycle evidence in lesson POST',()=>{
    const base={eventId:'p3v-'+'a'.repeat(32),sequence:1,unitId:'lesson-a'};
    for(const payload of [
      {...base,score_pct:100},{...base,complete:true},{...base,empresa_id:9},
      {...base,unitId:'lesson-b'},{...base,sequence:3},
    ]){
      expect(()=>validateQaAuthoredLessonCheckpoint(payload,'lesson-a',1,new Set()))
        .toThrow('RC81_LESSON_CHECKPOINT_CANONICAL_ID_SEQUENCE');
    }
    expect(()=>validateQaAuthoredLessonCheckpoint(base,'lesson-a',1,
      new Set([base.eventId]))).toThrow('RC81_LESSON_CHECKPOINT_EVENT_UNIQUE');
    expect(()=>validateQaAuthoredLessonCheckpoint({...base,eventId:'v-guess'},
      'lesson-a',1,new Set())).toThrow('RC81_LESSON_CHECKPOINT_EVENT_UNIQUE');
    // Regression: the old QA-only `v-` prefix cannot be sent by the Player 3.
    expect(()=>validateQaAuthoredLessonCheckpoint(
      {...base,eventId:'v-'+'c'.repeat(32)},'lesson-a',1,new Set()))
      .toThrow('RC81_LESSON_CHECKPOINT_EVENT_UNIQUE');
  });
  it('rejects phantom lessons, mismatched edition, mode and invalid canonical resume state',()=>{
    for(const bad of [
      {matricula_id:999},{ciclo_id:999},{edition_sha256:'b'.repeat(64)},
      {mode:'REVIEW'},{seen_lesson_ids:['lesson-a','phantom']},
      {seen_lesson_ids:['lesson-a','lesson-a']},{next_sequence:2},
      {last_visited_unit_id:'phantom'}, {total_lessons:42},
    ]){
      expect(()=>validateQaNativeLessonSession({...recorded,...bad},e,ids))
        .toThrow('RC81_NATIVE_LESSON_LEDGER_SCOPE');
    }
  });
});
