import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {requiredRows,requiredScenarios,verifyPilotRealDeviceEvidence as verify,verifyPilotProductionReleaseLineage as verifyProductionLineage,isPilotImpactingPath} from '../ci/pilot-real-device-evidence.mjs';
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

test('production provenance uses the official HEAD response and fails closed on missing headers',async()=>{
 const {currentProductionSourceSha}=await import('../ci/pilot-production-release-guard.mjs');
 const previous=globalThis.fetch;
 const h={'x-airtrust-source-sha':'a'.repeat(40),'x-airtrust-source-tree':'b'.repeat(40),
  'x-airtrust-release-manifest-sha256':'c'.repeat(64),'x-airtrust-environment':'production'};
 try{
  globalThis.fetch=async(url,options)=>{
   assert.equal(url,'https://api.airtrust.online/api/version');
   assert.equal(options.method,'HEAD');
   return {ok:true,headers:new Headers(h)};
  };
  assert.equal(await currentProductionSourceSha(),'a'.repeat(40));
  globalThis.fetch=async()=>({ok:true,headers:new Headers({...h,'x-airtrust-environment':'staging'})});
  await assert.rejects(()=>currentProductionSourceSha(),/SOURCE_UNVERIFIED/);
  globalThis.fetch=async()=>({ok:false,headers:new Headers()});
  await assert.rejects(()=>currentProductionSourceSha(),/LOOKUP_DENIED/);
 }finally{globalThis.fetch=previous;}
});

test('Pilot scope is conservative for shared code and independent for named domain modules',()=>{
 for(const path of ['public/pilot/app.js','worker-airtrust/src/services/controle-voos/pilot-offline-sync.ts',
  'worker-airtrust/wrangler.toml','worker-airtrust/src/index.ts',
  'public/dev-config.js','public/force-reload.js','public/branding/global.css',
  'scripts/ci/build-content-gates.mjs','worker-airtrust/schema-v2/changes/9999_unknown.sql',
  'worker-airtrust/src/middleware/tenant.ts','src/App.tsx',
  'scripts/ci/pilot-production-release-guard.mjs','.github/workflows/deploy-airtrust.yml',
  'worker-airtrust/schema-v2/changes/0564_controle_voos_pilot_supplier_history.sql'])
  assert.equal(isPilotImpactingPath(path),true,path);
 for(const path of ['worker-airtrust/src/services/training-compliance-roster-plan.ts',
  'worker-airtrust/src/services/frms/risk.ts','worker-airtrust/src/routes/lms/courses.ts',
  'worker-airtrust/src/cron/resilient/compliance-roster.ts',
  'scripts/staging/qa-training-compliance-cycle-evidence.mjs',
  'docs/frms/REPORT.md','e2e/frontend-pr-ui-qa/training-compliance-lifecycle.spec.ts',
  'public/h5p-standalone/engine.js',
  'worker-airtrust/schema-v2/changes/0580_training-compliance-cycle.sql',
  '.github/workflows/staging-training-compliance-lifecycle-qa.yml',
  'docs/pilot/PILOT_REAL_DEVICE_ACCEPTANCE_EVIDENCE.json'])
  assert.equal(isPilotImpactingPath(path),false,path);
 assert.equal(isPilotImpactingPath('worker-airtrust/src/services/unknown-module.ts'),true);
});

test('unrelated production release needs no new Pilot evidence',()=>{
 const result=verifyProductionLineage({
  evidence:null,releaseSha:'b'.repeat(40),
  productionChangedPaths:['worker-airtrust/src/services/training-compliance-roster-plan.ts',
   '.github/workflows/staging-training-compliance-lifecycle-qa.yml',
   'worker-airtrust/src/services/frms/risk.ts'],
  changedPaths:[],stagedShaIsAncestor:false,
 });
 assert.equal(result.ok,true);assert.equal(result.requiresPhysicalAcceptance,false);
});

test('Pilot production requires staged SHA ancestor, valid 6x15 and no subsequent Pilot delta',()=>{
 const evidence=sample();
 const productionChangedPaths=['worker-airtrust/src/services/controle-voos/pilot-offline-sync-apply.ts'];
 const base={evidence,releaseSha:'b'.repeat(40),productionChangedPaths,
  changedPaths:['docs/pilot/PILOT_REAL_DEVICE_ACCEPTANCE_EVIDENCE.json',
    'worker-airtrust/src/services/training-compliance-roster-plan.ts'],
  stagedShaIsAncestor:true};
 assert.equal(verifyProductionLineage(base).ok,true);
 assert.equal(verifyProductionLineage({...base,
  changedPaths:[...base.changedPaths,'public/pilot/app.js']}).ok,false);
 assert.equal(verifyProductionLineage({...base,
  changedPaths:[...base.changedPaths,'worker-airtrust/src/services/controle-voos/pilot-offline-sync.ts']}).ok,false);
 assert.equal(verifyProductionLineage({...base,stagedShaIsAncestor:false}).ok,false);
 assert.equal(verifyProductionLineage({...base,evidence:null}).ok,false);
 assert.equal(verifyProductionLineage({...base,evidence:{...evidence,worker_source_sha:'c'.repeat(40)}}).ok,false);
 assert.equal(verifyProductionLineage({...base,productionChangedPaths:undefined}).ok,false);
});


test('production Worker deploy invokes the exact Pilot acceptance lineage guard',()=>{
 const workflow=readFileSync('.github/workflows/deploy-airtrust.yml','utf8');
 assert.match(workflow,/name: Verify Pilot real-device acceptance for production release[\s\S]*?if: \$\{\{ inputs\.deploy_worker \|\| inputs\.deploy_pages \}\}[\s\S]*?node scripts\/ci\/pilot-production-release-guard\.mjs --release-sha/);
 assert.match(workflow,/Checkout trusted production pipeline[\s\S]*?fetch-depth: 0/);
 const guard=readFileSync('scripts/ci/pilot-production-release-guard.mjs','utf8');
 assert.ok(guard.includes("'--no-renames'"),'renames must expose both source and destination');
});

test('protocol documents the distinct staged SHA and later evidence commit',()=>{
 const protocol=readFileSync('docs/pilot/PILOT_REAL_DEVICE_ACCEPTANCE_PROTOCOL.md','utf8');
 assert.ok(protocol.includes('commit de evidência'));
 assert.ok(protocol.includes('somente o arquivo EVIDENCE.json'));
});
