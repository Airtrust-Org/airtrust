// source_reference: bounded 30-day FRMS synthetic QA fixture staging governance, issue #1426.
// operational_decision: negative SQL strings in this test are inert; no remote D1 connection.
// dry_run_required: pure node test with no write.
// rollback_plan_required: not applicable; test has no persistence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateSource, approximation, buildSeedSql, buildRollbackSql, TENANT_ID,
  TENANT_CODE, DB_ID, DB_NAME, CONFIRM, chooseGovernedRevision,
} from '../staging/seed-frms-ux-30d.mjs';
const SHA='a'.repeat(40);
const days=Array.from({length:30},(_,i)=>({
  day:new Date(Date.parse('2026-09-14T00:00:00Z')+i*86400000).toISOString().slice(0,10),
  jornadas:i%3===0?'10-19':'5-9',
  checkins:i%3===0?'5-9':'1-4',
  casos:i%5===0?'1-4':'0',
  voos:i%4===0?'5-9':'1-4',
}));
const payload={
  source:'PRODUCTION_AGGREGATES_NOT_INDIVIDUAL_RECORDS',
  company:'Costa do Sol',from:'2026-09-14',to:'2026-10-13',
  suppressedSmallCells:true,writes:0,reviewedSourceSha:SHA,days,
};
test('rejects any raw identities, wrong reviewed SHA, malformed dates and exact counts',()=>{
  assert.equal(validateSource(payload,SHA).length,30);
  assert.throws(()=>validateSource({...payload,reviewedSourceSha:'b'.repeat(40)},SHA),/SOURCE_CONTRACT_MISMATCH/);
  assert.throws(()=>validateSource({...payload,days:[{...days[0],jornadas:3},...days.slice(1)]},SHA),/SOURCE_BAND_INVALID/);
  assert.throws(()=>validateSource({...payload,days:[{...days[0],name:'PERSON'},...days.slice(1)]},SHA),/SOURCE_DAY_FIELDS_INVALID/);
  assert.throws(()=>validateSource({...payload,days:days.slice(0,29)},SHA),/SOURCE_DAY_COUNT_INVALID/);
});
test('creates only fictional crew under reserved staging tenant with governed profile',()=>{
  const sql=buildSeedSql(validateSource(payload,SHA));
  assert.equal(TENANT_ID,999013);
  assert.equal(TENANT_CODE,'qa_frms_ux_30d');
  assert.equal(DB_NAME,'airtrust-db-staging-baseline-20260701');
  assert.equal(DB_ID,'bf9963f4-eb12-439b-a830-20bbf577ac22');
  assert.equal(CONFIRM,'AIRTRUST_STAGING_FRMS_UX_30D');
  assert.match(sql,/HELICOPTER_OFFSHORE/);
  assert.match(sql,/QA Tripulante 01/);
  assert.match(sql,/QA Tripulante 14/);
  assert.match(sql,/2026-10-13/);
  assert.match(sql,/frms_fadiga_checkin/);
  assert.match(sql,/frms_jornada/);
  assert.match(sql,/frms_alerta/);
  assert.match(sql,/frms_escala_quinzenal/);
  assert.match(sql,/QA SINTETICO/);
  assert.doesNotMatch(sql,/filipedaumas|@gmail|costadosol|@airtrust\.online/i);
  assert.doesNotMatch(sql,/\b(UPDATE funcionarios|UPDATE empresas|DELETE FROM|INSERT OR REPLACE)\b/i);
  assert.equal(approximation('1-4'),2);
  assert.throws(()=>approximation('3'),/BAND_INVALID/);
});
test('governed revision is global, effective for entire 30d window and unambiguous',()=>{
  const rev={id:'frms-revision-global-qa',empresa_id:null,profile_code:'HELICOPTER_OFFSHORE',
    status:'ACTIVE',revision_number:2,effective_from:'2026-09-01',effective_to:null};
  assert.equal(chooseGovernedRevision([rev],169),rev.id);
  assert.match(buildSeedSql(days,rev.id),/frms-revision-global-qa/);
  assert.throws(()=>chooseGovernedRevision([rev],67),/REVISION_INCOMPLETE/);
  assert.throws(()=>chooseGovernedRevision([{...rev,empresa_id:999006}],169),/REVISION_30D_MISSING/);
  assert.throws(()=>chooseGovernedRevision([{...rev,effective_from:'2026-10-01'}],169),/REVISION_30D_MISSING/);
  assert.throws(()=>chooseGovernedRevision([{...rev,effective_to:'2026-10-12'}],169),/REVISION_30D_MISSING/);
  assert.throws(()=>chooseGovernedRevision([rev,{...rev,id:'competing-rev'}],169),/REVISION_AMBIGUOUS/);
  assert.equal(chooseGovernedRevision([{...rev,status:'SUPERSEDED'}],169),rev.id);
});
test('rollback is limited to fixture identifiers and does not mutate other tenants',()=>{
  const sql=buildRollbackSql();
  assert.match(sql,/empresa_id=999013/);
  assert.match(sql,/QA-FRMS-UX/);
  assert.match(sql,/qa_frms_ux_30d/);
  assert.doesNotMatch(sql,/\bempresa_id\s*=\s*6\b/);
});
test('workflow requires reviewed main, artifact provenance, staging environment and backup before writes',()=>{
  const wf=readFileSync(new URL('../../.github/workflows/staging-frms-ux-30d-synthetic.yml',import.meta.url),'utf8');
  assert.match(wf,/refs\/heads\/main/);
  assert.match(wf,/LIVE_MAIN/);
  assert.match(wf,/SOURCE_RUN/);
  assert.match(wf,/actions\/download-artifact@v7/);
  assert.match(wf,/environment: staging/);
  assert.match(wf,/d1 time-travel info/);
  assert.match(wf,/D1_RECOVERY_BOOKMARK_MISSING/);
  assert.match(wf,/STAGING_DATABASE_UUID_MISMATCH/);
  assert.match(wf,/D1_MIGRATION_API_TOKEN/);
  assert.match(wf,/mode == 'inspect'/);
  assert.match(wf,/--inspect/);
  assert.match(wf,/STAGING_QA_POSTCONDITIONS_FAILED/);
  assert.doesNotMatch(wf,/secrets\.CLOUDFLARE_API_TOKEN\b/);
});
