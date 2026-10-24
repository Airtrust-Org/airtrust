// source_reference: bounded 30-day FRMS synthetic QA fixture staging governance, issue #1426.
// operational_decision: negative SQL strings in this test are inert; no remote D1 connection.
// dry_run_required: pure node test with no write.
// rollback_plan_required: not applicable; test has no persistence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const qaSource=readFileSync(new URL('../staging/seed-frms-ux-30d.mjs',import.meta.url),'utf8');
import {
  validateSource, approximation, buildSeedSql, buildRollbackSql, TENANT_ID,
  TENANT_CODE, DB_ID, DB_NAME, CONFIRM, QA_REVISION_ID, buildTenantScopedBaselineSql, extractFixtureInsertColumns,
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
test('four QA cases have matching synthetic canonical journeys, not unlinked manual or shadow rows',()=>{
  const sql=buildSeedSql(validateSource(payload,SHA));
  assert.match(sql,/CASE WHEN CAST\(substr\(f\.matricula,-2\) AS INTEGER\)<=2 THEN 'SIGVOOS' ELSE 'MANUAL' END/);
  for(let n=1;n<=4;n++){
    assert.match(sql,new RegExp("qa-frms-ux-case-"+n));
  }
  assert.match(sql,/SELECT 'qa-frms-ux-case-1',f\.id,j\.id/);
  assert.match(sql,/JOIN frms_jornada j ON j\.empresa_id=f\.empresa_id AND j\.tripulante_id=f\.id/);
  assert.match(sql,/j\.deleted_at IS NULL AND UPPER\(j\.origem\)='SIGVOOS'/);
  assert.doesNotMatch(sql,/qa-frms-ux-case-1',f\.id,NULL/);
  assert.match(sql,/j\.duracao_jornada_minutos,540/);
});

test('QA baseline is tenant-scoped, exact 128 reviewed keys, and never global',()=>{
  const source=buildTenantScopedBaselineSql();
  assert.equal(source.length,2);
  assert.match(source[0],/INSERT INTO frms_config_revisions/);
  assert.match(source[0],/999013, 'HELICOPTER_OFFSHORE'/);
  assert.doesNotMatch(source[0],/frms-helicopter-offshore-baseline-v1', NULL, 'HELICOPTER_OFFSHORE'/);
  const ids=[...source[1].matchAll(/'qa-frms-ux-999013-helicopter-offshore-v1-([A-Z][A-Z0-9_]*)'/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,128);
  const sql=buildSeedSql(days);
  assert.match(sql,/qa-frms-ux-999013-helicopter-offshore-v1/);
  assert.equal(QA_REVISION_ID,'qa-frms-ux-999013-helicopter-offshore-v1');
  assert.throws(()=>buildSeedSql(days,'frms-legacy-global-v2'),/QA_TENANT_SCOPED_REVISION_REQUIRED/);
  assert.throws(()=>buildTenantScopedBaselineSql('DELETE FROM frms_config_parameters'),/BASELINE_SOURCE_STATEMENTS_CHANGED/);
  assert.throws(()=>buildTenantScopedBaselineSql("INSERT INTO frms_config_revisions (id) VALUES ('x'); INSERT INTO frms_config_parameters (id) VALUES ('y');"), /BASELINE_SOURCE_STATEMENTS_CHANGED/);
});
test('all QA seed table columns are discoverable for read-only live staging preflight',()=>{
  const byTable=extractFixtureInsertColumns(buildSeedSql(days));
  assert.equal(byTable.size,11);
  assert.ok(byTable.get('frms_config_revisions').includes('empresa_id'));
  assert.ok(byTable.get('frms_config_parameters').includes('parameter_key'));
  assert.ok(byTable.get('frms_jornada').includes('hora_termino'));
  assert.ok(byTable.get('frms_fadiga_checkin').includes('config_revision_id'));
  assert.throws(()=>extractFixtureInsertColumns('INSERT INTO usuarios (id) VALUES (1)'), /QA_UNEXPECTED_TABLE_INSERT/);
  assert.throws(()=>extractFixtureInsertColumns('INSERT INTO empresas (id) VALUES (1)'), /QA_INSERT_TABLE_CONTRACT_CHANGED/);
});
test('uses canonical read-only PRAGMA inspection instead of remote UNION table-valued PRAGMAs',()=>{
  assert.match(qaSource,/PRAGMA table_info\(/);
  assert.doesNotMatch(qaSource,/FROM pragma_table_info\(/);
  assert.match(qaSource,/STAGING_FRMS_QA_SCHEMA_COLUMNS_MISSING/);
  assert.match(qaSource,/READONLY_PREFLIGHT_REJECTED/);
});

test('rollback is limited to fixture identifiers and does not mutate other tenants',()=>{
  const sql=buildRollbackSql();
  assert.match(sql,/empresa_id=999013/);
  assert.match(sql,/QA-FRMS-UX/);
  assert.match(sql,/qa_frms_ux_30d/);
  assert.match(sql,/DELETE FROM frms_config_parameters WHERE revision_id/);
  assert.match(sql,/DELETE FROM frms_config_revisions WHERE id/);
  assert.doesNotMatch(sql,/\bempresa_id\s*=\s*6\b/);
});
test('workflow requires reviewed main, artifact provenance, staging environment and backup before writes',()=>{
  const wf=readFileSync(new URL('../../.github/workflows/staging-frms-ux-30d-synthetic.yml',import.meta.url),'utf8');
  assert.match(wf,/refs\/heads\/main/);
  assert.match(wf,/LIVE_MAIN/);
  assert.match(wf,/SOURCE_RUN/);
  assert.match(wf,/actions\/download-artifact@v7/);
  assert.match(wf,/environment: staging/);
  // The same D1 is used by staging releases, schema changes, and SCORM QA.
  // Independent concurrency groups would allow races despite valid per-job guards.
  const sharedLock=/group: airtrust-staging-mutations-and-scorm-qa/;
  assert.match(wf,sharedLock);
  for(const file of ['deploy-staging.yml','staging-d1-schema-change.yml','staging-lms-scorm-qa.yml']){
    const other=readFileSync(new URL('../../.github/workflows/'+file,import.meta.url),'utf8');
    assert.match(other,sharedLock);
  }
  assert.match(wf,/d1 time-travel info/);
  assert.match(wf,/D1_RECOVERY_BOOKMARK_MISSING/);
  assert.match(wf,/STAGING_DATABASE_UUID_MISMATCH/);
  assert.match(wf,/D1_MIGRATION_API_TOKEN/);
  assert.match(wf,/mode == 'inspect'/);
  assert.match(wf,/--inspect/);
  assert.match(wf,/STAGING_QA_POSTCONDITIONS_FAILED/);
  assert.doesNotMatch(wf,/secrets\.CLOUDFLARE_API_TOKEN\b/);
});
