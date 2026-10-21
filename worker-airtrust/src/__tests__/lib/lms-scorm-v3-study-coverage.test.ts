import {describe,it,expect} from 'vitest';
import {scoreV3Blueprint,scoreV3ReportedStudyCoverage}
  from '../../services/lms-scorm-v3-study-coverage';
const s='a'.repeat(64),edition='AIRTRUST-SCORE-F5-EXTERNAL-20261021-V3-test';
const model={schema:'AIRTRUST_UNIFIED_SCORE_SCORM12_V1',courseId:'course-1',
  edition,slides:[{id:'s01',kind:'cover'},{id:'s02',kind:'scenario'},
    {id:'s03',kind:'lesson'},{id:'s04',kind:'scenario'},
    {id:'s05',kind:'study-end'}]};
const manifest={courseId:'course-1',packageVersion:edition,scormVersion:'1.2',
  content:{requiredSlides:['s01','s02','s03','s04','s05']},
  assessment:{mode:'EXTERNAL',scoringBySCORM:false,requiredInteractions:[]},
  completion:{passStatusFromSCORM:false,workerApprovalRequired:true}};
const plan=scoreV3Blueprint(model,manifest,s);
const evidence={courseId:model.courseId,edition,sha256:s,
  tenantVerified:true,enrollmentVerified:true,cycleVerified:true,
  packageVerified:true,persistedCommitVerified:true,
  suspendData:JSON.stringify({v:1,p:edition,c:4,d:[0,1,2,3,4],
    f:[1,3],study:true})};
describe('Score V3 coverage stays distinct from exam eligibility',()=>{
 it('derives mandatory fixations from actual course slide kinds, not empty manifest',()=>{
   expect(plan.fixations).toEqual(['s02','s04']);
   expect(plan.interactionsInManifest).toBe(false);
 });
 it('all reported still requires independent server observation for exam',()=>{
   expect(scoreV3ReportedStudyCoverage(plan,evidence)).toMatchObject({
    status:'COVERAGE_REPORTED',examEligible:false,
    grantsCompletion:false,grantsCertificate:false});
 });
 it('an unanswered formative scenario blocks study evidence',()=>{
   const c={v:1,p:edition,c:4,d:[0,1,2,3,4],f:[1],study:true};
   expect(scoreV3ReportedStudyCoverage(plan,{...evidence,
      suspendData:JSON.stringify(c)})).toMatchObject({
      status:'INCOMPLETE',missingFixations:['s04']});
 });
 it('a missing slide or end marker blocks readiness',()=>{
   const c={v:1,p:edition,c:4,d:[0,1,3,4],f:[1,3],study:false};
   expect(scoreV3ReportedStudyCoverage(plan,{...evidence,
    suspendData:JSON.stringify(c)})).toMatchObject({
      status:'INCOMPLETE',missingSlides:['s03'],studyEndReported:false});
 });
 it('never accepts a different tenant, edition, package or uncommitted response',()=>{
   for(const name of ['tenantVerified','enrollmentVerified','cycleVerified',
    'packageVerified','persistedCommitVerified'] as const){
    expect(scoreV3ReportedStudyCoverage(plan,{...evidence,[name]:false}).status)
      .toBe('REJECTED');
   }
   expect(scoreV3ReportedStudyCoverage(plan,{...evidence,
    sha256:'b'.repeat(64)}).status).toBe('REJECTED');
 });
 it('rejects malformed/fabricated CMI index collections and mismatched manifest',()=>{
   expect(scoreV3ReportedStudyCoverage(plan,{...evidence,
     suspendData:JSON.stringify({v:1,p:edition,d:[0,1,1,3,4],f:[1,3],
       study:true})}).status).toBe('REJECTED');
   expect(scoreV3ReportedStudyCoverage(plan,{...evidence,
     suspendData:'broken'}).status).toBe('REJECTED');
   expect(()=>scoreV3Blueprint(model,{...manifest,
    content:{requiredSlides:['s01']}},s)).toThrow('SLIDE_MANIFEST_MISMATCH');
   expect(()=>scoreV3Blueprint(model,{...manifest,
    assessment:{...manifest.assessment,requiredInteractions:['s02']}},s))
    .toThrow('INTERACTION_MANIFEST_MISMATCH');
 });
});
