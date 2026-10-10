import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plan } from '../production/lms99-admin-reconciliation.mjs';
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
