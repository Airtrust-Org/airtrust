/**
 * source_reference: scripts/staging/player3-qa-readonly-inventory.mjs
 *   and Schema V2 staging ledger 0561/0562.
 * operational_decision: prove the read-only inventory refuses any SQL DML
 *   and never treats a staging count as proof of six browser journeys.
 * dry_run_required: pure node:test with fabricated aggregate counts; the
 *   modifying SQL fragments below are NEGATIVE test strings, never executed.
 * rollback_plan_required: this test never connects to D1 or writes state;
 *   therefore there are no remote mutations to reverse.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {assertReadOnlyQuery,validateStagingConfig,summarize,SQL,
  STAGING_D1,STAGING_UUID} from '../staging/player3-qa-readonly-inventory.mjs';

const seeded={
 qa_tenants:1,qa_active_employees:10,qa_learner_users:5,
 qa_courses:0,qa_markers:0,qa_published_editions:0,qa_approved_policies:0,
 qa_pinned_enrollments:0,qa_all_active_enrollments:6,
 applied_0561:1,applied_0562:1,
};
const result=(row=seeded,meta={changed_db:false,rows_written:0})=>
 [{success:true,meta,results:[row]}];

test('inventory SELECT must be static, QA-scoped and contain no modifying statement',()=>{
  assert.equal(assertReadOnlyQuery(),true);
  assert.match(SQL,/qa_examiner_training/);
  assert.match(SQL,/lms_native_matricula_edicoes/);
  for(const sql of [
    "SELECT 1; DROP TABLE empresas;",
    "SELECT 1; UPDATE usuarios SET active=0;",
    "DELETE FROM empresas",
    "PRAGMA foreign_keys=OFF",
    "SELECT 1; SELECT 2;",
  ])assert.throws(()=>assertReadOnlyQuery(sql),/READONLY_QUERY_GUARD/);
});
test('target is exact live staging D1 binding and rejects other environment/bucket',()=>{
  const toml=readFileSync(resolve('worker-airtrust/wrangler.toml'),'utf8');
  assert.doesNotThrow(()=>validateStagingConfig(toml));
  assert.throws(()=>validateStagingConfig(toml.replace(STAGING_UUID,'0'.repeat(36))),
    /BINDING_NOT_PINNED/);
  assert.throws(()=>validateStagingConfig(toml.replace(STAGING_D1,'airtrust-db-production')),
    /BINDING_NOT_PINNED/);
});
test('report actual known absence without pretending deployed Native QA',()=>{
  const x=summarize(result());
  assert.equal(x.ok,false);
  for(const item of ['NO_SYNTHETIC_COURSE','NO_NATIVE_ACTIVATION',
    'NO_PUBLISHED_NATIVE_EDITION','NO_APPROVED_PRIVATE_GRADING_POLICY',
    'NO_INDEPENDENT_NATIVE_ENROLLMENTS']){
    assert.ok(x.blockers.includes(item),item);
  }
  assert.ok(!x.blockers.includes('STAGING_SCHEMAS_NOT_APPLIED_ONCE'));
  assert.equal(x.certificatePdfVerified,false);
  assert.equal(x.sixBrowserJourneysVerified,false);
});
test('even populated D1 never implies content origins, tenant flags or E2E PASS',()=>{
  const row={...seeded,qa_courses:1,qa_markers:1,qa_published_editions:1,
    qa_approved_policies:1,qa_pinned_enrollments:2};
  const x=summarize(result(row));
  assert.equal(x.ok,true);
  assert.equal(x.contentOriginVerified,false);
  assert.equal(x.tenantFlagsVerified,false);
  assert.equal(x.sixBrowserJourneysVerified,false);
  assert.equal(x.certificatePdfVerified,false);
});
test('read-only evidence never accepts D1 writes, missing columns or multiple payloads',()=>{
  assert.throws(()=>summarize(result(seeded,{changed_db:true,rows_written:1})),
    /DB_RESPONSE_INVALID/);
  assert.throws(()=>summarize([{...result()[0],results:[seeded,seeded]}]),
    /DB_RESPONSE_INVALID/);
  assert.throws(()=>summarize(result({...seeded,qa_courses:-1})),
    /AGGREGATE_INVALID/);
  assert.throws(()=>summarize(result({...seeded,qa_courses:'one'})),
    /AGGREGATE_INVALID/);
  assert.throws(()=>summarize(result({qa_tenants:1})),/AGGREGATE_INVALID/);
});
