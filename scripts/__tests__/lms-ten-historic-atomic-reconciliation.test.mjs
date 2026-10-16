import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {plan,authorizedEnrollmentIds,administrativeObservations,isVerifiedCompletedCredit} from
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


test('one already completed credit resumes only when qualification is linked',()=>{
 const ids=new Set(targets.map(x=>x[0]));
 const rows=targets.map(([id,course])=>({id:course,enrollments:[{
   id,status:id===700?'CONCLUIDO':'EM_ANDAMENTO',progresso_bruto:100
 }]}));
 const p=plan(rows,ids);
 assert.equal(p.rows.length,9);assert.equal(p.alreadyCompleted.length,1);
 assert.equal(p.pendingReview.length,0);assert.match(p.hash,/^[a-f0-9]{64}$/);
 const base={id:700,empresa_id:6,curso_id:55,status:'CONCLUIDO',progresso_bruto:100,
   data_conclusao:'2026-10-16',qualificacao_historico_id:12345};
 assert.equal(isVerifiedCompletedCredit(base),true);
 for(const change of [
   {qualificacao_historico_id:null},
   {status:'EM_ANDAMENTO'},
   {empresa_id:7},
   {curso_id:68},
   {data_conclusao:null},
   {progresso_bruto:99},
 ])assert.equal(isVerifiedCompletedCredit({...base,...change}),false);
});
test('workflow validates ten total linked qualifications, not ten repeat PATCH operations',()=>{
 const wf=readFileSync(new URL('../../.github/workflows/production-lms-ten-historic-atomic-qualification.yml',import.meta.url),'utf8');
 const script=readFileSync(new URL('../production/lms-ten-historic-atomic-reconciliation.mjs',import.meta.url),'utf8');
 assert.match(wf,/\.candidates\+\.already_completed/);
 assert.match(wf,/\.writes==\.candidates/);
 assert.match(wf,/\.results\.qualification_linked==10/);
 assert.match(script,/COMPLETED_WITHOUT_LINKED_QUALIFICATION/);
 assert.match(script,/PATCH_UNCERTAIN_NO_SAFE_RETRY/);
 assert.match(script,/HTTP_UNCERTAIN_VERIFIED_CANONICAL/);
 assert.doesNotMatch(script,/method:'PATCH'[\s\S]{0,200}retry/);
});
