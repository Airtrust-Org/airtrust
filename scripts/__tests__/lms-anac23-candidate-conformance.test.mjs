import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ANAC23_CANDIDATES,ANAC23_CONFORMANCE_TIMEOUT_MS,authJson,validatePinnedCandidateList,summarizeConformance}
  from '../production/lms-anac23-candidate-conformance.mjs';

function rows() {return ANAC23_CANDIDATES.map(v=>({
 packageId:v.id,packageSha256:v.shaPrefix+'0'.repeat(48),status:'VALIDATED',
 r2Prefix:`lms/scorm/6/23/_candidates/${v.id}/`,
 launchFile:'index.html',empresaId:6,cursoId:23,
}));}
test('exactly three SHA-pinned tenant6 course23 inactive candidates',()=>{
 assert.deepEqual(validatePinnedCandidateList(rows()).map(r=>r.id),
 ANAC23_CANDIDATES.map(c=>c.id));
});
test('reject mismatched SHA, tenant, wrong candidate status and R2 paths',()=>{
 for(const mutation of [
 row=>{row.status='ACTIVE'},
 row=>{row.packageSha256='0'.repeat(64)},
 row=>{row.empresaId=7},
 row=>{row.cursoId=24},
 row=>{row.r2Prefix='lms/scorm/6/24/_candidates/'+row.packageId+'/'},
 row=>{row.launchFile='../index.html'},
 ]) {
 const sample=rows(); mutation(sample[0]);
 assert.throws(()=>validatePinnedCandidateList(sample));
 }
 assert.throws(()=>validatePinnedCandidateList(rows().slice(0,2)));
});
test('runtime conformance cannot claim PASS with wrong candidate SHA',()=>{
 const cand=validatePinnedCandidateList(rows())[0];
 assert.throws(()=>summarizeConformance({runtime:{
 status:'PASS',candidateSha256:'0'.repeat(64)}},cand));
 const summary=summarizeConformance({publishable:false,runtime:{
 status:'PASS',candidateSha256:cand.sha,initializeObserved:true,
 commitObserved:true,finishObserved:true,errors:[]}},cand);
 assert.equal(summary.status,'PASS');
 assert.equal(summary.publishable,false);
 assert.equal(summary.finished,true);
});

test('guard both fully gated live release and actual executing checkout',async()=>{
 const fs=await import('node:fs');
 const workflow=fs.readFileSync('.github/workflows/production-lms-anac23-candidate-conformance.yml','utf8');
 assert.match(workflow,/RELEASE_SHA: \$\{\{ inputs.expected_production_sha \}\}/);
 assert.match(workflow,/RELEASE_SHA="\$GITHUB_SHA" node scripts\/ci\/verify-release-gates\.mjs/);
 assert.match(workflow,/git merge-base --is-ancestor "\$EXPECTED" HEAD/);
});
test('candidate-only POST explicitly exceeds shared 25-second auth timeout',async()=>{
 assert.ok(ANAC23_CONFORMANCE_TIMEOUT_MS > 30_000);
 const originalFetch=globalThis.fetch;
 const originalTimeout=AbortSignal.timeout;
 const captured=[];
 AbortSignal.timeout=(ms)=>{
   captured.push(ms);
   return new AbortController().signal;
 };
 globalThis.fetch=async()=>({
   status:200,text:async()=>JSON.stringify({success:true,data:{}})
   ,headers:{forEach(){}},
 });
 try{
   const response=await authJson('https://api.airtrust.online','test',
     '/api/lms/cursos/23/scorm-package-versions/863d66ce-d06a-411e-bca9-a6be5b98a08c/conformance',
     'POST',undefined,ANAC23_CONFORMANCE_TIMEOUT_MS);
   assert.equal(response.status,200);
   assert.deepEqual(captured,[ANAC23_CONFORMANCE_TIMEOUT_MS]);
 }finally{
   globalThis.fetch=originalFetch;
   AbortSignal.timeout=originalTimeout;
 }
});

test('safe Browser Rendering diagnostics survive production QA without leaking exception text',()=>{
 const candidate=validatePinnedCandidateList(rows())[0];
 const summary=summarizeConformance({publishable:false,runtime:{
   status:'ERROR',candidateSha256:candidate.sha,initializeObserved:false,
   commitObserved:false,finishObserved:false,errors:['SCORM_BROWSER_INFRASTRUCTURE_ERROR'],
   failureStage:'BROWSER_LAUNCH',failureCategory:'BROWSER_SERVICE',
   failureCode:'PROTOCOL_ERROR',exception:'Authorization Bearer secret'
 }},candidate);
 assert.deepEqual([summary.failureStage,summary.failureCategory,summary.failureCode],
   ['BROWSER_LAUNCH','BROWSER_SERVICE','PROTOCOL_ERROR']);
 assert.equal(JSON.stringify(summary).includes('secret'),false);
 const unexpected=summarizeConformance({runtime:{
   status:'ERROR',candidateSha256:candidate.sha,errors:[],
   failureStage:'https://internal.example/path?token=secret',
   failureCategory:'Authorization secret',failureCode:'PRIVATE_ERROR'
 }},candidate);
 assert.deepEqual([unexpected.failureStage,unexpected.failureCategory,unexpected.failureCode],
   [null,null,null]);
 assert.equal(JSON.stringify(unexpected).includes('secret'),false);
});
