import { test } from 'node:test';
import assert from 'node:assert/strict';
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
