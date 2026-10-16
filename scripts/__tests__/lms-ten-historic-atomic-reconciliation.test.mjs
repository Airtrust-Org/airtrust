import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {plan,authorizedEnrollmentIds,administrativeObservations} from
 '../production/lms-ten-historic-atomic-reconciliation.mjs';
const targets=[[2106,68],[384,34],[201,28],[608,43],[2139,68],
 [610,43],[544,7],[624,43],[700,55],[2052,68]];
test('scope is the exact ten manager-attested tenant6 enrollments',()=>{
 const old=process.env.LMS_HIST_ATOMIC_TARGET_ENROLLMENT_IDS;
 try{
  process.env.LMS_HIST_ATOMIC_TARGET_ENROLLMENT_IDS=targets.map(x=>x[0]).join(',');
  const ids=authorizedEnrollmentIds();
  assert.equal(ids.size,10);
  const p=plan(targets.map(([id,course])=>({id:course,
   enrollments:[{id,status:'EM_ANDAMENTO',progresso_bruto:100}]})),ids);
  assert.equal(p.rows.length,10);assert.equal(p.pendingReview.length,0);
  assert.match(p.hash,/^[0-9a-f]{64}$/);
  process.env.LMS_HIST_ATOMIC_TARGET_ENROLLMENT_IDS='2106,2106';
  assert.throws(()=>authorizedEnrollmentIds(),/AUTHORIZED_INPUT|AUTHORIZED_DUPLICATES/);
 }finally{
  if(old===undefined)delete process.env.LMS_HIST_ATOMIC_TARGET_ENROLLMENT_IDS;
  else process.env.LMS_HIST_ATOMIC_TARGET_ENROLLMENT_IDS=old;
 }
});
test('course mismatch and missing candidates never silently pass',()=>{
 const ids=new Set(targets.map(x=>x[0]));
 const rows=targets.map(([id,course])=>({id:course,enrollments:[{id,status:'EM_ANDAMENTO',progresso_bruto:100}]}));
 const mismatch=rows.map((r,i)=>i===0?{id:100,enrollments:r.enrollments}:r);
 assert.equal(plan(mismatch,ids).pendingReview.length,1);
 assert.equal(plan(rows.slice(0,9),ids).pendingReview.length,1);
 const scoreDrift=rows.map((r,i)=>i===0?{...r,enrollments:[{...r.enrollments[0],progresso_bruto:4}]}:r);
 assert.equal(plan(scoreDrift,ids).rows.length,9);
});
test('history is explicitly attributed to manager, not new SCORM edition',()=>{
 const note=administrativeObservations('existing notes');
 assert.match(note,/AIRTRUST_MANAGER_HISTORICAL_EDITION_CREDIT_20261016:/);
 assert.match(note,/existing notes/);
 assert.ok(note.startsWith('AIRTRUST_MANAGER_HISTORICAL_EDITION_CREDIT_20261016:'),'manager marker must be first');
});
test('workflow pins SHA and safeguards 10 qualification-linked writes',()=>{
 const wf=readFileSync(new URL('../../.github/workflows/production-lms-ten-historic-atomic-qualification.yml',import.meta.url),'utf8');
 for(const s of ['verify-release-gates.mjs','reviewed_dry_run_run_id','time-travel info',
  'environment: production','.results.qualification_linked==10'])assert.ok(wf.includes(s),s);
});
