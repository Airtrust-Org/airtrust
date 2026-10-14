import {describe,expect,it} from 'vitest';
import {qaPath,validateQaProfile,type QaProfile,type QaProjectFixture} from './fixture-contract';

const staging='https://qa-lms.airtrust.example';
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
      scormSnapshotPath:'/qa/scorm-state/'+offset},
  };
}
function fixture():QaProfile {
  return {baseUrl:staging,contentOrigin,empresaId:6001,
    courseTitle:'Doutrinamento em Segurança e Qualidade RC8.1 (synthetic)',
    projects:{chromium:project(1000),webkit:project(2000)}};
}
describe('Front D QA contract — no network, no real students',()=>{
  it('admits exact-tenant, isolated content and six independent synthetic enrollments',()=>{
    const input=fixture();
    expect(validateQaProfile(input,'chromium',staging).fixture).toBe(input.projects.chromium);
    expect(validateQaProfile(input,'webkit',staging).fixture).toBe(input.projects.webkit);
  });
  it('never permits production as a base URL, even when expressly allowlisted',()=>{
    const p=fixture();p.baseUrl='https://airtrust.online';
    expect(()=>validateQaProfile(p,'chromium',p.baseUrl)).toThrow('PRODUCTION_FORBIDDEN');
  });
  it('requires HTTPS and explicit staging hostname and exact allowlist',()=>{
    const p=fixture();p.baseUrl='http://qa-lms.airtrust.example';
    expect(()=>validateQaProfile(p,'chromium',p.baseUrl)).toThrow('HTTPS_STAGING_ORIGIN');
    p.baseUrl='https://app.airtrust.example';
    expect(()=>validateQaProfile(p,'chromium',p.baseUrl)).toThrow('EXPLICIT_STAGING_HOST_REQUIRED');
    p.baseUrl=staging;
    expect(()=>validateQaProfile(p,'chromium','https://other-qa.example')).toThrow('STAGING_ORIGIN_ALLOWLIST');
  });
  it('refuses nonsegregated HTML5 origin and missing second browser fixture',()=>{
    const p=fixture();p.contentOrigin=staging;
    expect(()=>validateQaProfile(p,'chromium',staging)).toThrow('ISOLATED_HTML5_CONTENT_ORIGIN');
    p.contentOrigin=contentOrigin;
    delete p.projects.webkit;
    expect(()=>validateQaProfile(p,'chromium',staging)).toThrow('BOTH_INDEPENDENT_BROWSER_PROJECTS');
  });
  it('requires all 42 authored units, exactly eight official module assessments and actual practice',()=>{
    const p=fixture();p.projects.chromium.doutrinamento.units.pop();
    expect(()=>validateQaProfile(p,'chromium',staging)).toThrow('DOU_RC81_42_UNITS');
    const p2=fixture();
    p2.projects.chromium.doutrinamento.units[0].official=undefined;
    expect(()=>validateQaProfile(p2,'chromium',staging)).toThrow('DOU_RC81_EIGHT_MODULAR_ASSESSMENTS');
    const p3=fixture();
    p3.projects.chromium.doutrinamento.units[1].practice=undefined;
    expect(()=>validateQaProfile(p3,'chromium',staging)).toThrow('FORMATIVE_GATE_REQUIRED');
  });
  it('rejects mismatched or duplicate enrollment identities across Chromium and WebKit',()=>{
    const p=fixture();
    p.projects.webkit.external.enrollmentId=p.projects.chromium.external.enrollmentId;
    expect(()=>validateQaProfile(p,'webkit',staging)).toThrow('DEDICATED_PER_BROWSER_ENROLLMENTS');
    const p2=fixture();
    p2.projects.chromium.resume80.editionSha256='wrong';
    expect(()=>validateQaProfile(p2,'chromium',staging)).toThrow('SYNTHETIC_ENROLLMENT_IDENTITIES');
  });
  it('rejects forged credential-in-URL, traversal, protocol-relative and cross-origin requests',()=>{
    expect(()=>qaPath(staging,'https://other-qa.example/a')).toThrow('RELATIVE_API_OR_LAUNCH_PATH');
    expect(()=>qaPath(staging,'//other-qa.example/a')).toThrow('RELATIVE_API_OR_LAUNCH_PATH');
    expect(()=>qaPath(staging,'/qa/%2e%2e/other')).toThrow('UNSAFE_RELATIVE_PATH');
    expect(()=>qaPath(staging,'/qa/../other')).toThrow('UNSAFE_RELATIVE_PATH');
    expect(qaPath(staging,'/qa/snapshot/1001')).toBe(staging+'/qa/snapshot/1001');
  });
  it('preserves historical 80% range and disallows suspicious answer fixtures',()=>{
    const p=fixture();p.projects.chromium.resume80.minPreviousPct=100;
    expect(()=>validateQaProfile(p,'chromium',staging)).toThrow('SOURCE_80_PERCENT_BASELINE');
    const p2=fixture();
    const quiz=p2.projects.chromium.doutrinamento.units[0].official!.questions[0];
    quiz.wrong=quiz.correct;
    expect(()=>validateQaProfile(p2,'chromium',staging)).toThrow('AUTHOR_UNIT_AND_EXAM_MAP');
  });
});
