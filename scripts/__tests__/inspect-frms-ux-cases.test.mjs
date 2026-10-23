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

test('diagnoses four legacy synthetic owners and four untouched target journeys without exposing raw rows', async()=>{
  const {diagnoseLegacyRepairPreflight,LEGACY_CASE_BASELINE}=await import('../staging/inspect-frms-ux-cases.mjs');
  const oldRows=LEGACY_CASE_BASELINE.map(x=>({
    id:x.id,matricula:x.owner,tipo_limite:x.kind,nivel:x.level,created_at:x.day+' 10:00:00',
    jornada_id:null,resolvido:0,valor_atual_min:620,valor_limite_min:540,
    mensagem:'QA SINTETICO: revisar contexto e registrar providencia',
  }));
  const journeys=expected.map(x=>({
    id:'qa-frms-ux-j-'+x.date+'-'+x.matricula,matricula:x.matricula,
    data:x.date,origem:'MANUAL',registrado_por:'QA_FRMS_UX',
    observacao:'CENARIO SINTETICO - SEM VALIDADE OPERACIONAL',
    duracao_jornada_minutos:540,
  }));
  const result=diagnoseLegacyRepairPreflight(oldRows,journeys,expected);
  assert.equal(result.verdict,'LEGACY_FIXTURE_PROVEN_READY_FOR_REVIEW');
  assert.equal(result.legacy_case_matches,4);
  assert.equal(result.target_journeys_ready,4);
  assert.equal(result.writes,0);
  assert.equal(JSON.stringify(result).includes('matricula'),false);
  assert.equal(JSON.stringify(result).includes('observacao'),false);
  assert.equal(diagnoseLegacyRepairPreflight(oldRows,journeys.slice(0,3),expected).verdict,'BLOCK_ON_UNEXPECTED_PREIMAGE');
  assert.equal(diagnoseLegacyRepairPreflight(oldRows.map((r,i)=>i===0?{...r,jornada_id:'already-linked'}:r),journeys,expected).cases[0].legacy_case,'LEGACY_CASE_STATE_DRIFT');
  assert.equal(diagnoseLegacyRepairPreflight(oldRows,journeys.map((r,i)=>i===0?{...r,origem:'REAL'}:r),expected).cases[0].target_journey,'TARGET_JOURNEY_SOURCE_DRIFT');
});

// A historical fixed-source status check is useful when the GitHub artifact
// has expired; it is explicitly NOT source revalidation or an apply grant.
test('fixed four-case snapshot only under exact guarded read-only staging run',async()=>{
  const {expectedReadonlyCaseSnapshot,REVIEWED_READONLY_CASE_SNAPSHOT}=await import(
    '../staging/inspect-frms-ux-cases.mjs');
  const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'Airtrust-Org/airtrust',
    GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),
    FRMS_QA_EXPECTED_MAIN_SHA:'a'.repeat(40),
    CONFIRM_FRMS_QA_CASES_INSPECT:'AIRTRUST_STAGING_FRMS_CASES_READONLY',
    FRMS_QA_FIXED_STATUS_ONLY:'FRMS_QA_REVIEWED_4CASE_STATUS_READONLY'};
  const observed=expectedReadonlyCaseSnapshot({env});
  assert.equal(observed,REVIEWED_READONLY_CASE_SNAPSHOT);
  assert.deepEqual(observed.map(x=>x.date),[
    '2026-10-12','2026-10-11','2026-10-10','2026-10-09']);
  assert.deepEqual(observed.map(x=>x.id),CASE_IDS);
  assert.equal(Object.isFrozen(observed[0]),true);
  for(const changed of [
    {GITHUB_ACTIONS:'false'}, {GITHUB_REPOSITORY:'other/repo'},
    {GITHUB_REF:'refs/heads/other'},{GITHUB_SHA:'bad'},
    {FRMS_QA_EXPECTED_MAIN_SHA:'b'.repeat(40)},
    {FRMS_QA_FIXED_STATUS_ONLY:'apply'},
    {CONFIRM_FRMS_QA_CASES_INSPECT:'wrong'},
    {SANITIZED_AGGREGATE_PATH:'/tmp/forged.json'},
    {SOURCE_AGGREGATE_SHA:'b'.repeat(40)},
  ])assert.throws(()=>expectedReadonlyCaseSnapshot({env:{...env,...changed}}),
    /FRMS_QA_STATUS_ONLY_GUARD_DENIED/);
});
test('snapshot-only readout cannot declare 4/4 unless current scoped join matches',async()=>{
  const {REVIEWED_READONLY_CASE_SNAPSHOT:want}=await import(
    '../staging/inspect-frms-ux-cases.mjs');
  const valid=evaluateQaCases([],want);
  assert.equal(valid.valid,0);
  assert.equal(valid.verdict,'GOVERNED_INCREMENTAL_REPAIR_REQUIRED');
  assert.equal(valid.writes,0);
  const code=readFileSync(new URL('../staging/inspect-frms-ux-cases.mjs',import.meta.url),'utf8');
  assert.match(code,/if\(!statusOnly && !reviewedSourceMode\)process\.exitCode=2/);
  assert.doesNotMatch(code,/--apply|--rollback|UPDATE frms_|DELETE FROM frms_/);
});

test('fresh aggregate may include 13 Oct without reassigning reviewed 9–12 Oct fixture IDs',async()=>{
  const {expectedReviewedFixtureCases,REVIEWED_READONLY_CASE_SNAPSHOT,
    expectedQaCases}=await import('../staging/inspect-frms-ux-cases.mjs');
  const current=days.map(d=>({...d,jornadas:'0'}));
  for(const date of ['2026-10-09','2026-10-10','2026-10-11',
    '2026-10-12','2026-10-13']) {
    const day=current.find(d=>d.day===date);
    day.jornadas=date==='2026-10-09'?'1-4':'5-9';
  }
  assert.deepEqual(expectedQaCases(current).map(x=>x.date),
    ['2026-10-13','2026-10-12','2026-10-11','2026-10-10']);
  assert.deepEqual(expectedReviewedFixtureCases(current),
    REVIEWED_READONLY_CASE_SNAPSHOT);
  assert.deepEqual(expectedReviewedFixtureCases(current).map(x=>x.date),
    ['2026-10-12','2026-10-11','2026-10-10','2026-10-09']);
  assert.equal(Object.isFrozen(expectedReviewedFixtureCases(current)[0]),true);
  const old=days.map(d=>({...d,jornadas:d.day==='2026-10-13'?'0':'5-9'}));
  const {buildReviewPlan}=await import('../staging/frms-qa-cases-repair-plan.mjs');
  const plan=buildReviewPlan(old);
  assert.equal(plan.sql_sha256,'38a81ed05821919d87b424ddfc7b731bfc8d7d759dadebbb6a21d11edb349ed3');
  assert.deepEqual(expectedReviewedFixtureCases(current).map(x=>x.date),
    expectedQaCases(old).map(x=>x.date));
});
test('historical fixture refuses new source that no longer supports any reviewed date',async()=>{
  const {expectedReviewedFixtureCases}=await import('../staging/inspect-frms-ux-cases.mjs');
  const old=days.map(d=>({...d,jornadas:'1-4'}));
  assert.equal(expectedReviewedFixtureCases(old).length,4);
  for(const day of ['2026-10-09','2026-10-10','2026-10-11','2026-10-12']){
    const drift=old.map(d=>d.day===day?{...d,jornadas:'0'}:d);
    assert.throws(()=>expectedReviewedFixtureCases(drift),/QA_REVIEWED_FIXTURE_DATE_INELIGIBLE/);
  }
  assert.throws(()=>expectedReviewedFixtureCases(old.slice(1)),/QA_REVIEWED_SOURCE_DAYS_INVALID/);
  assert.throws(()=>expectedReviewedFixtureCases([...old.slice(0,29),old[28]]),
    /QA_REVIEWED_SOURCE_DAYS_INVALID/);
});
test('fresh-source historical mode is separate, SHA-pinned, and never enables apply',()=>{
  const inspect=readFileSync(new URL('../staging/inspect-frms-ux-cases.mjs',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../../.github/workflows/staging-frms-ux-cases-preflight.yml',import.meta.url),'utf8');
  assert.match(inspect,/FRMS_QA_REVIEWED_SCOPE_FRESH_SOURCE_READONLY=/);
  assert.match(inspect,/FRMS_QA_REVIEWED_SOURCE_MODE_DENIED/);
  assert.match(inspect,/diagnostic.verdict!=='LEGACY_FIXTURE_PROVEN_READY_FOR_REVIEW'/);
  assert.match(workflow,/FRMS_QA_EXPECTED_MAIN_SHA:.*inputs.expected_main_sha/);
  assert.match(workflow,/FRMS_QA_CASE_SCOPE:.*inputs.case_scope/);
  assert.match(workflow,/--reviewed-current-source/);
  assert.match(workflow,/source_latest/);
  assert.doesNotMatch(workflow,/(?:wrangler d1 execute.*--file|FRMS_QA_MODE: apply|--apply)/);
});
