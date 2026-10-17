// source_reference: #1426, governed FRMS QA synthetic fixture inspection.
// operational_decision: test bounded CAS statements only, no operational approval.
// dry_run_required: Node unit tests; no network and no D1 connection.
// rollback_plan_required: encrypted preimage + per-row inverse CAS before any approved apply.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewPlan, assertReviewPlan, EXPECTED_IDS } from '../staging/frms-qa-cases-repair-plan.mjs';
const days=Array.from({length:30},(_,i)=>({
  day:new Date(Date.parse('2026-09-14T00:00:00Z')+i*86400000).toISOString().slice(0,10),
  jornadas:'5-9',
}));
test('eight exact-target operations, four alerts and four journeys only',()=>{
  const p=buildReviewPlan(days);
  assert.equal(assertReviewPlan(p),true);
  assert.equal(p.operations.length,8);
  assert.deepEqual(p.operations.filter(x=>x.table==='frms_alerta').map(x=>x.id),EXPECTED_IDS);
  assert.equal(p.writes,0);
  assert.equal(p.apply_authorized,false);
  assert.match(p.sql_sha256,/^[a-f0-9]{64}$/);
});
test('line-level CAS refuses wrong owner, date, source, missing journey or previous treatment',()=>{
  const p=buildReviewPlan(days);
  for(const op of p.operations){
    assert.match(op.sql,/deleted_at IS NULL/);
    assert.match(op.sql,/UPDATE frms_(alerta|jornada) SET/);
    assert.doesNotMatch(op.sql,/\b(?:DELETE|INSERT|DROP|ALTER|REPLACE)\b/i);
    if(op.table==='frms_alerta'){
      assert.match(op.sql,/jornada_id IS NULL AND resolvido=0/);
      assert.match(op.sql,/COALESCE\(TRIM\(notas_resolucao\),' '\)=''|COALESCE\(TRIM\(notas_resolucao\),'\)=''|COALESCE\(TRIM\(notas_resolucao\),''\)=''/);
      assert.match(op.sql,/AND .*IS NOT NULL AND .* > 0/s);
      assert.match(op.sql,/tripulante_id=.*FROM funcionarios/s);
    }else{
      assert.match(op.sql,/origem='MANUAL'/);
      assert.match(op.sql,/registrado_por='QA_FRMS_UX'/);
      assert.match(op.sql,/origem='SIGVOOS'/);
    }
  }
});
test('plan is deterministic and rejects wrong cohort',()=>{
  const x=buildReviewPlan(days), y=buildReviewPlan(days);
  assert.equal(x.sql_sha256,y.sql_sha256);
  assert.throws(()=>buildReviewPlan(days.slice(1)),/QA_30D_SOURCE_REQUIRED/);
  assert.throws(()=>assertReviewPlan({...x,operations:x.operations.slice(1)}),/REPAIR_PLAN_SCOPE_REJECTED/);
});
