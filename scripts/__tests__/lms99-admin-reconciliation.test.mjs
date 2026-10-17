import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plan, administrativeObservations, authorizedEnrollmentIds, isOnlyReviewedException } from '../production/lms99-admin-reconciliation.mjs';
test('includes only 100% raw not completed and stable idempotent hash',()=>{
 const cohort=[{id:4,enrollments:[{id:1,status:'EM_ANDAMENTO',progresso_bruto:100},{id:2,status:'CONCLUIDO',progresso_bruto:100},{id:3,status:'CANCELADO',progresso_bruto:100},{id:4,status:'REPROVADO',progresso_bruto:100}]}];
 const r=plan(cohort);
 assert.deepEqual(r.rows,[{id:1,cid:4,status:'EM_ANDAMENTO',p:100}]);
 assert.equal(r.hash,plan(cohort).hash);
 assert.deepEqual(r.excluded,{cancelled:1,reproved:1,other:0});
});
test('rejects exact 99 raw rather than converting ambiguous cases',()=>{
 assert.throws(()=>plan([{id:4,enrollments:[{id:1,status:'EM_ANDAMENTO',progresso_bruto:99}]}]),/AMBIGUOUS_PROGRESS/);
});
test('rejects duplicate enrollment IDs',()=>{
 assert.throws(()=>plan([{id:4,enrollments:[{id:1,status:'EM_ANDAMENTO',progresso_bruto:100},{id:1,status:'EM_ANDAMENTO',progresso_bruto:100}]}]),/IDENTITY_INVALID/);
});

test('relative-path CLI actually enters fail-closed main, rather than silently exiting 0',()=>{
  const entry = relative(process.cwd(),fileURLToPath(new URL('../production/lms99-admin-reconciliation.mjs',import.meta.url)));
  const run=spawnSync(process.execPath,[entry],{
    cwd:process.cwd(),encoding:'utf8',timeout:5000,
    env:{...process.env,GITHUB_ACTIONS:'false',GITHUB_REF:'refs/heads/local-test'},
  });
  assert.equal(run.status,1,`entrypoint should fail closed: ${run.stderr}`);
  assert.match(run.stderr,/LMS99_GITHUB_MAIN_REQUIRED/);
});

test('preserves existing LMS notes when appending audited administrative reason',()=>{
  const before='Treinamento realizado em viagem operacional';
  const after=administrativeObservations(before);
  assert.ok(after.startsWith(before+'\n\n'));
  assert.match(after,/Regularizacao administrativa/);
  assert.equal(administrativeObservations(null).startsWith('Regularizacao administrativa'),true);
});

test('explicit list has exactly 16 distinct IDs and rejects missing IDs',()=>{
 const original=process.env.LMS99_TARGET_ENROLLMENT_IDS;
 try {
  process.env.LMS99_TARGET_ENROLLMENT_IDS=Array.from({length:16},(_,i)=>String(i+100)).join(',');
  const ids=authorizedEnrollmentIds();
  assert.equal(ids.size,16);
  const all=Array.from(ids).map(id=>({id,status:'EM_ANDAMENTO',progresso_bruto:100}));
  const cohort=plan([{id:43,enrollments:all}],ids);
  assert.equal(cohort.rows.length,16);

  const missing=plan([{id:43,enrollments:all.slice(1)}],ids);
  assert.equal(missing.pendingReview.length,1);
  assert.deepEqual(missing.pendingReview[0],{ordinal:1,curso_id:null,status:'NOT_FOUND',progresso_bruto:null});
  const changed=plan([{id:43,enrollments:all.map((row,i)=>i===0?{...row,status:'NAO_INICIADO'}:row)}],ids);
  assert.equal(changed.rows.length,15);
  assert.deepEqual(changed.pendingReview[0],{ordinal:1,curso_id:43,status:'NAO_INICIADO',progresso_bruto:100});
  const already=plan([{id:43,enrollments:all.map((row,i)=>i===0?{...row,status:'CONCLUIDO'}:row)}],ids);
  assert.equal(already.rows.length,15);
  assert.equal(already.alreadyCompleted.length,1);
  assert.equal(already.pendingReview.length,0);
  assert.notEqual(already.hash,cohort.hash);
  const authorized99=plan([{id:43,enrollments:all.map((row,i)=>i===0?{...row,progresso_bruto:99}:row)}],ids);
  assert.equal(authorized99.rows.length,16);
  assert.equal(authorized99.pendingReview.length,0);
  process.env.LMS99_TARGET_ENROLLMENT_IDS='100,100';
  assert.throws(()=>authorizedEnrollmentIds(),/AUTHORIZED_INPUT|AUTHORIZED_DUPLICATES/);
 } finally {if(original===undefined) delete process.env.LMS99_TARGET_ENROLLMENT_IDS;else process.env.LMS99_TARGET_ENROLLMENT_IDS=original;}
});

test('authorized cancellations and failed attempts become review-only rather than completions',()=>{
  const ids=new Set(Array.from({length:16},(_,i)=>i+1));
  const all=Array.from(ids).map(id=>({id,status:'EM_ANDAMENTO',progresso_bruto:100}));
  const cancelled=plan([{id:68,enrollments:all.map((r,i)=>i===2?{...r,status:'CANCELADO'}:r)}],ids);
  assert.equal(cancelled.pendingReview.length,1);
  assert.equal(cancelled.pendingReview[0].ordinal,3);
  assert.equal(cancelled.rows.length,15);
  assert.notDeepEqual(cancelled.rows,plan([{id:68,enrollments:all}],ids).rows);
});

test('only the already-reviewed matrícula 614 (ordinal 3, course 43, raw 4) may remain untouched',()=>{
  const ids=new Set([1232,2106,614,384,201,608,679,2139,610,544,594,624,700,2052,1383,863]);
  const enrollments=[...ids].map(id=>({id,status:'EM_ANDAMENTO',progresso_bruto:100}));
  const completed=2106,exception=614;
  const group=enrollments.map(r=>r.id===completed?{...r,status:'CONCLUIDO'}:
    r.id===exception?{...r,progresso_bruto:4}:r);
  const result=plan([{id:43,enrollments:group}],ids);
  assert.equal(result.rows.length,14);
  assert.equal(result.alreadyCompleted.length,1);
  assert.equal(result.pendingReview.length,1);
  assert.deepEqual(result.pendingReview,[{ordinal:3,curso_id:43,status:'EM_ANDAMENTO',progresso_bruto:4}]);
  assert.equal(isOnlyReviewedException(result),true);
  const altered=plan([{id:43,enrollments:group.map(r=>r.id===614?{...r,progresso_bruto:5}:r)}],ids);
  assert.equal(isOnlyReviewedException(altered),false);
  const invalid=plan([{id:44,enrollments:group}],ids);
  assert.equal(isOnlyReviewedException(invalid),false);
});
