import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {requiredRows,requiredScenarios,verifyPilotRealDeviceEvidence as verify} from '../ci/pilot-real-device-evidence.mjs';
const sha='a'.repeat(40);
function sample(){
 const scenarios=Object.fromEntries(requiredScenarios.map(s=>[s,'PASS']));
 return {
  status:'PASS',staging_release_sha:sha,worker_source_sha:sha,pages_source_sha:sha,
  validated_at:'2026-10-19T13:00:00Z',
  rows:requiredRows.map(([platform,mode,orientation],i)=>({
   platform,mode,orientation,device_model:'Synthetic fixture model '+i,os_version:'FixtureOS 1',browser_version:'FixtureBrowser 1',evidence_ref:'synthetic-only-test-'+i,
   result:'PASS',scenario_results:{...scenarios}
  }))
 };
}
test('contract accepts a complete shape ONLY when bound to matching release SHA',()=>{
 assert.equal(verify(sample(),sha).ok,true);
 const other='b'.repeat(40);assert.equal(verify(sample(),other).ok,false);
});
test('rejects missing, duplicate and incomplete hardware rows and missing case evidence',()=>{
 const absent=sample();absent.rows.pop();assert.equal(verify(absent,sha).ok,false);
 const dup=sample();dup.rows[1]={...dup.rows[0]};assert.equal(verify(dup,sha).ok,false);
 const incomplete=sample();delete incomplete.rows[0].scenario_results['13_coordination_handoff_receipt'];assert.equal(verify(incomplete,sha).ok,false);
 const placeholder=sample();placeholder.rows[3].evidence_ref='REPLACE';assert.equal(verify(placeholder,sha).ok,false);
});
test('requires exact worker/pages provenance, real fields and all fifteen PASS per row',()=>{
 const v=sample();v.pages_source_sha='b'.repeat(40);assert.equal(verify(v,sha).ok,false);
 const vv=sample();vv.rows[4].scenario_results['10_idempotent_receipt_no_duplicate']='PENDING';assert.equal(verify(vv,sha).ok,false);
 const vvv=sample();vvv.rows[0].result='FAIL';assert.equal(verify(vvv,sha).ok,false);
});

test('official read-only device gate checks evidence at the exact reviewed PR SHA, not main',()=>{
 const workflow=readFileSync('.github/workflows/pilot-real-device-acceptance.yml','utf8');
 assert.match(workflow,/pr_number:/);
 assert.match(workflow,/PILOT_ACCEPTANCE_PR_HEAD_MISMATCH/);
 assert.match(workflow,/ref: \$\{\{ inputs.release_sha \}\}/);
 assert.match(workflow,/working-directory: release/);
 assert.match(workflow,/node \.\.\/scripts\/ci\/pilot-real-device-evidence\.mjs --release-sha/);
 assert.match(workflow,/PILOT_STAGING_WORKER_AND_PAGES_PROVENANCE_PASS/);
 assert.doesNotMatch(workflow,/pull_request_target:/);
});
