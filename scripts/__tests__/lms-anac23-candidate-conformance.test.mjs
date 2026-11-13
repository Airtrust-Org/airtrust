import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ANAC23_CANDIDATES,validatePinnedCandidateList,summarizeConformance}
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
