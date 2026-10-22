import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {requiredRows,requiredScenarios,verifyPilotRealDeviceEvidence as verify,verifyPilotProductionReleaseLineage as verifyProductionLineage} from '../ci/pilot-real-device-evidence.mjs';
const sha='a'.repeat(40);
function sample(){
 const scenarios=Object.fromEntries(requiredScenarios.map(s=>[s,'PASS']));
 return {
  status:'PASS',staging_release_sha:sha,worker_source_sha:sha,pages_source_sha:sha,
  staging_pages_url:'https://staging.airtrust.pages.dev/',
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

test('PR-only physical gate binds prior staged code to later evidence without self-referential SHA',()=>{
 const workflow=readFileSync('.github/workflows/pilot-real-device-acceptance.yml','utf8');
 for(const marker of ['pull_request:', 'docs/pilot/PILOT_REAL_DEVICE_ACCEPTANCE_EVIDENCE.json',
  'github.event.pull_request.head.sha', 'PILOT_ACCEPTANCE_PR_HEAD_MISMATCH',
  'git merge-base --is-ancestor "$RELEASE_SHA" "$PR_HEAD"',
  'git diff --name-only "$RELEASE_SHA" "$PR_HEAD"',
  'PILOT_RUNTIME_DELTA_AFTER_STAGING_DENIED',
  'node scripts/ci/pilot-real-device-evidence.mjs --release-sha',
  'PILOT_STAGING_WORKER_AND_PAGES_PROVENANCE_PASS'])
   assert.ok(workflow.includes(marker),'missing gate: '+marker);
 assert.doesNotMatch(workflow,/pull_request_target:|workflow_dispatch:/);
});

test('real-device evidence example keeps all six rows and all fifteen cases PENDING',()=>{
 const example=JSON.parse(readFileSync('docs/pilot/PILOT_REAL_DEVICE_ACCEPTANCE_EVIDENCE.example.json','utf8'));
 assert.equal(example.status,'PENDING');
 assert.equal(example.rows.length,requiredRows.length);
 for(let i=0;i<requiredRows.length;i++){
  const row=example.rows[i];
  assert.deepEqual([row.platform,row.mode,row.orientation],requiredRows[i]);
  assert.equal(row.result,'PENDING');
  assert.deepEqual(Object.keys(row.scenario_results).sort(),[...requiredScenarios].sort());
  assert.ok(Object.values(row.scenario_results).every(result=>result==='PENDING'));
 }
});

test('physical evidence rejects missing, placeholder or external Pages origin',()=>{
 const missing=sample();delete missing.staging_pages_url;assert.equal(verify(missing,sha).ok,false);
 const placeholder=sample();placeholder.staging_pages_url='REPLACE';assert.equal(verify(placeholder,sha).ok,false);
 const offsite=sample();offsite.staging_pages_url='https://staging.airtrust.pages.dev.attacker.example/';
 assert.equal(verify(offsite,sha).ok,false);
});

test('production release requires the staged SHA ancestor and evidence-only delta',()=>{
 const evidence=sample();
 assert.equal(verifyProductionLineage({evidence,releaseSha:'b'.repeat(40),changedPaths:['docs/pilot/PILOT_REAL_DEVICE_ACCEPTANCE_EVIDENCE.json'],stagedShaIsAncestor:true}).ok,true);
 assert.equal(verifyProductionLineage({evidence,releaseSha:'b'.repeat(40),changedPaths:['worker-airtrust/src/index.ts'],stagedShaIsAncestor:true}).ok,false);
 assert.equal(verifyProductionLineage({evidence,releaseSha:'b'.repeat(40),changedPaths:['docs/pilot/PILOT_REAL_DEVICE_ACCEPTANCE_EVIDENCE.json'],stagedShaIsAncestor:false}).ok,false);
});

test('production Worker deploy invokes the exact Pilot acceptance lineage guard',()=>{
 const workflow=readFileSync('.github/workflows/deploy-airtrust.yml','utf8');
 assert.match(workflow,/name: Verify Pilot real-device acceptance for production release[\s\S]*?if: \$\{\{ inputs\.deploy_worker \|\| inputs\.deploy_pages \}\}[\s\S]*?node scripts\/ci\/pilot-production-release-guard\.mjs --release-sha/);
});

test('protocol documents the distinct staged SHA and later evidence commit',()=>{
 const protocol=readFileSync('docs/pilot/PILOT_REAL_DEVICE_ACCEPTANCE_PROTOCOL.md','utf8');
 assert.ok(protocol.includes('commit de evidência'));
 assert.ok(protocol.includes('somente o arquivo EVIDENCE.json'));
});
