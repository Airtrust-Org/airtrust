// source_reference: issue #1426, synthetic FRMS QA 999013 and PR #1550.
// operational_decision: verify only read-only preflight invariants; no operational approval.
// dry_run_required: pure Node tests with inert mock rows and no remote database access.
// rollback_plan_required: not applicable; this test never persists data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {expectedQaCases,evaluateQaCases,CASE_IDS} from '../staging/inspect-frms-ux-cases.mjs';
import {readFileSync} from 'node:fs';

const days=Array.from({length:30},(_,i)=>({
  day:new Date(Date.parse('2026-09-14T00:00:00Z')+i*86400000).toISOString().slice(0,10),
  jornadas:'5-9',
}));
const expected=expectedQaCases(days);
const rows=expected.map(w=>({
  id:w.id,matricula:w.matricula,tipo_limite:w.kind,jornada_id:'qa-frms-ux-j-'+w.date+'-'+w.matricula,
  link_id:'qa-frms-ux-j-'+w.date+'-'+w.matricula,jornada_date:w.date,origem:'SIGVOOS',
  registrado_por:'QA_FRMS_UX',observacao:'CENARIO SINTETICO - FONTE SIMULADA SEM VALIDADE OPERACIONAL',
  duracao_jornada_minutos:690,valor_atual_min:690,resolvido:0,
}));

test('derives four synthetic cases from source day bands without PII',()=>{
  assert.deepEqual(expected.map(x=>x.id),CASE_IDS);
  assert.deepEqual(expected.map(x=>x.date),['2026-10-13','2026-10-12','2026-10-11','2026-10-10']);
});
test('four scoped and linked cases permit read-only acceptance',()=>{
  const result=evaluateQaCases(rows,expected);
  assert.equal(result.verdict,'READONLY_ACCEPTANCE_READY');
  assert.equal(result.valid,4);
  assert.equal(result.writes,0);
});
test('reject missing journeys, old source and stale FDP, without writing',()=>{
  assert.equal(evaluateQaCases(rows.slice(0,3),expected).verdict,'GOVERNED_INCREMENTAL_REPAIR_REQUIRED');
  assert.equal(evaluateQaCases(rows.map((r,i)=>i===0?{...r,origem:'MANUAL'}:r),expected).cases[0].status,'SIMULATED_SOURCE_INVALID');
  assert.equal(evaluateQaCases(rows.map((r,i)=>i===1?{...r,jornada_id:null}:r),expected).cases[1].status,'JOURNEY_LINK_MISMATCH');
  assert.equal(evaluateQaCases(rows.map((r,i)=>i===1?{...r,valor_atual_min:1}:r),expected).cases[1].status,'FDP_STALE');
});
test('only fixed QA table, tenant and SELECT statements are used',()=>{
  const src=readFileSync(new URL('../staging/inspect-frms-ux-cases.mjs',import.meta.url),'utf8');
  assert.match(src,/INNER JOIN funcionarios f/);
  assert.match(src,/f\.empresa_id=\$\{TENANT_ID\}/);
  assert.match(src,/FRMS_QA_STAGING_DB_ID_MISMATCH/);
  assert.match(src,/READONLY_QUERY_REJECTED/);
  assert.doesNotMatch(src,/--apply|--rollback|--file|DELETE FROM frms_|UPDATE frms_/);
});
