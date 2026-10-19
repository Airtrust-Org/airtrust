/**
 * source_reference: worker-airtrust/schema-v2/{lms-native-catalog-activation-0561,
 *   lms-player3-canonical-terminal-0562}.json and pinned, reviewed SQL/plan hashes.
 * operational_decision: assert only an APPROVED_FOR_STAGING manifest may generate
 *   an offline SQL bundle; a REVIEW_ONLY manifest must fail before output creation.
 * dry_run_required: this test builds bundles in an isolated local temp directory,
 *   verifies provenance/ledger text, and never connects to a remote D1 database.
 * rollback_plan_required: no remote data is mutated here; dispose of temp files.
 *   A future physical apply must use the authorized staging workflow, D1 Time
 *   Travel recovery point, ledger checks and approved compensation plan.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const bytes=(path)=>readFileSync(resolve(root,path));
const contents=(path)=>bytes(path).toString('utf8');
const digest=(path)=>createHash('sha256').update(bytes(path)).digest('hex');
const baseline=JSON.parse(contents('docs/database/schema-contracts/production-d1-baseline-v2.json'));
const workflow=contents('.github/workflows/staging-player3-schema-v2.yml');
const entries=baseline.schema_v2_since_baseline;
const byPrefix=new Map();
for (const entry of entries) {
  const number=entry.change_file.match(/^(05[56][0-9])_/);
  if (!number) continue;
  assert.ok(!byPrefix.has(number[1]),
    'Schema V2 number collision for '+number[1]);
  byPrefix.set(number[1],entry);
}

test('0553 LGPD, 0554 simulator, 0557 LMS and 0558/0559 Player3 have disjoint owners',()=>{
  const expected={
    '0553':'0553_retire_empty_lgpd_seg_info_model.sql',
    '0554':'0554_simulator_individual_check_evidence.sql',
    '0557':'0557_lms_cycle_evidence_archive.sql',
    '0558':'0558_lms_native_v1_evidence.sql',
    '0559':'0559_lms_player3_module_attempts.sql',
  };
  for(const [n,file] of Object.entries(expected)) {
    assert.equal(byPrefix.get(n)?.change_file,file);
  }
});

for(const [n,id] of [
  ['0558','lms-native-v1-evidence-0558'],
  ['0559','lms-player3-module-attempts-0559'],
]){
  test(id+' manifest matches real source bytes, baseline and staging pins',()=>{
    const manifest=JSON.parse(contents('worker-airtrust/schema-v2/'+id+'.json'));
    assert.equal(manifest.changeId,id);
    assert.equal(manifest.baselineId,'production-d1-baseline-v2-20260714');
    assert.equal(manifest.fileHash,digest(manifest.filePath));
    assert.equal(manifest.planHash,digest(manifest.planPath));
    const registered=byPrefix.get(n);
    assert.equal(registered.change_id,id);
    assert.equal(registered.sha256,manifest.fileHash);
    assert.equal(registered.reviewed_manifest,id+'.json');
    for(const fragment of [id,manifest.filePath,manifest.fileHash,manifest.planHash]){
      assert.ok(workflow.includes(fragment),fragment+' must be pinned in staging workflow');
    }
    assert.ok(!workflow.includes(id.replace(n,n==='0558'?'0553':'0554')),
      'staging must not permit obsolete Player3 number');
  });
}

test('0559 staging apply requires exact reviewed 0558 ledger evidence',()=>{
  assert.match(workflow,/change_id='lms-native-v1-evidence-0558'/);
  assert.match(workflow,/PLAYER3_NATIVE_0558_REQUIRED_FIRST/);
  assert.match(workflow,/RELEASE_SHA_DRIFT/);
  assert.match(workflow,/Verify eight required GitHub release gates/);
});


test('0561/0562 remain hashed NON-deployable reviewer artifacts until bootstrap and staging review',()=>{
  const candidates = [
    ['0561','lms-native-catalog-activation-0561'],
    ['0562','lms-player3-canonical-terminal-0562'],
  ];
  for (const [n,id] of candidates) {
    const meta=JSON.parse(contents('worker-airtrust/schema-v2/plans/'+id+'.REVIEW-ONLY.json'));
    assert.equal(meta.proposedChangeId,id);
    assert.equal(meta.reviewOnly,true);
    assert.equal(meta.notDeployable,true);
    assert.equal(meta.remoteApplied,false);
    assert.equal(digest(meta.candidateSqlPath),meta.candidateSqlSha256);
    assert.equal(digest(meta.candidatePlanPath),meta.candidatePlanSha256);
    assert.ok(meta.candidateSqlPath.endsWith('.REVIEW-ONLY.sql.txt'));
    assert.ok(contents(meta.candidateSqlPath).includes('DO NOT APPLY'));
    assert.equal(byPrefix.get(n)?.change_file,n+'_'.concat(n==='0561'?'native_catalog_activation.sql':'player3_canonical_terminal.sql'));
    assert.equal(byPrefix.get(n)?.governance_state,'REMOTE_APPLY_PENDING');
    assert.match(byPrefix.get(n)?.note??'',/REVIEW_ONLY_NO_REMOTE_APPLY/);
    assert.ok(!workflow.includes('          - '+id),'trusted-main staging choice absent');
  }
});

test('0561/0562 staging-approved manifests preserve hashes and refuse review-only transport',async()=>{
  const {buildReviewedSchemaApply}=await import('../schema-v2/build-reviewed-schema-apply.mjs');
  for(const [n,id,file] of [
    ['0561','lms-native-catalog-activation-0561','0561_native_catalog_activation.sql'],
    ['0562','lms-player3-canonical-terminal-0562','0562_player3_canonical_terminal.sql'],
  ]) {
    const path='worker-airtrust/schema-v2/'+id+'.json';
    const metadata=JSON.parse(contents(path));
    assert.equal(metadata.reviewStatus,'APPROVED_FOR_STAGING');
    assert.equal(metadata.filePath,'worker-airtrust/schema-v2/changes/'+file);
    assert.equal(metadata.fileHash,digest(metadata.filePath));
    assert.equal(metadata.planHash,digest(metadata.planPath));
    assert.equal(contents(metadata.filePath),
      contents('worker-airtrust/schema-v2/plans/'+id+'.REVIEW-ONLY.sql.txt'),
      'approved SQL must exactly preserve historically rehearsed candidate bytes');
    assert.equal(byPrefix.get(n)?.governance_state,'REMOTE_APPLY_PENDING');
    assert.match(byPrefix.get(n)?.note??'',/REVIEW_ONLY_NO_REMOTE_APPLY/);
    assert.ok(!workflow.includes('          - '+id));
    const dir=mkdtempSync(join(tmpdir(),'airtrust-player3-schema-approval-'));
    try {
      const deniedManifest=join(dir,'review-only.json');
      const deniedOutput=join(dir,'must-not-exist.sql');
      writeFileSync(deniedManifest,JSON.stringify({...metadata,
        reviewStatus:'REVIEW_ONLY_NO_REMOTE_APPLY'}));
      assert.throws(()=>buildReviewedSchemaApply({
        manifestPath:deniedManifest,outputPath:deniedOutput,
        expectedChangeId:id,githubSha:'a'.repeat(40),
      }),/SCHEMA_V2_REVIEW_ONLY_CANDIDATE_NOT_APPROVED/);
      assert.equal(existsSync(deniedOutput),false);
      const approvedOutput=join(dir,'reviewed-staging.sql');
      const built=buildReviewedSchemaApply({
        manifestPath:path,outputPath:approvedOutput,
        expectedChangeId:id,githubSha:'a'.repeat(40),
      });
      assert.equal(built.fileHash,metadata.fileHash);
      assert.equal(built.planHash,metadata.planHash);
      const bundle=readFileSync(approvedOutput,'utf8');
      assert.ok(bundle.startsWith(contents(metadata.filePath).trimEnd()));
      assert.ok(bundle.includes("INSERT INTO airtrust_schema_changes_v2"));
      assert.ok(bundle.includes("'"+id+"'"));
    } finally {
      rmSync(dir,{recursive:true,force:true});
    }
  }
});
