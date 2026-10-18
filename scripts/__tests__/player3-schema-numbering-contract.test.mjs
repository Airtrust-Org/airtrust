import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const bytes=(path)=>readFileSync(resolve(root,path));
const contents=(path)=>bytes(path).toString('utf8');
const digest=(path)=>createHash('sha256').update(bytes(path)).digest('hex');
const baseline=JSON.parse(contents('docs/database/schema-contracts/production-d1-baseline-v2.json'));
const workflow=contents('.github/workflows/staging-player3-schema-v2.yml');
const entries=baseline.schema_v2_since_baseline;
const byPrefix=new Map();
for (const entry of entries) {
  const number=entry.change_file.match(/^(05(?:5|6)[0-9])_/);
  if (!number) continue;
  assert.ok(!byPrefix.has(number[1]),
    'Schema V2 number collision for '+number[1]);
  byPrefix.set(number[1],entry);
}

test('0553/0554/0557 owners, 0558/0559 Player3 foundation and 0560/0561 draft intents are disjoint',()=>{
  const expected={
    '0553':'0553_retire_empty_lgpd_seg_info_model.sql',
    '0554':'0554_simulator_individual_check_evidence.sql',
    '0557':'0557_lms_cycle_evidence_archive.sql',
    '0558':'0558_lms_native_v1_evidence.sql',
    '0559':'0559_lms_player3_module_attempts.sql',
    '0560':'0560_lms_native_catalog_activation.sql',
    '0561':'0561_lms_player3_canonical_terminal.sql',
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


for (const [number,id] of [
  ['0560','lms-native-catalog-activation-0560'],
  ['0561','lms-player3-canonical-terminal-0561'],
]) {
  test(id+' is a hashed review candidate, not an authorized staging dispatch',()=>{
    const manifest=JSON.parse(contents('worker-airtrust/schema-v2/'+id+'.json'));
    const registered=byPrefix.get(number);
    assert.equal(manifest.baselineId,'production-d1-baseline-v2-20260714');
    assert.equal(manifest.changeId,id);
    assert.equal(manifest.fileHash,digest(manifest.filePath));
    assert.equal(manifest.planHash,digest(manifest.planPath));
    assert.equal(registered.change_id,id);
    assert.equal(registered.sha256,manifest.fileHash);
    assert.equal(registered.reviewed_manifest,id+'.json');
    assert.equal(registered.governance_state,'REMOTE_APPLY_PENDING');
    assert.equal(workflow.includes('          - '+id),false,'unapproved staging dispatch option');
    const sql=contents(manifest.filePath);
    assert.match(sql,/DO NOT APPLY/);
    assert.match(sql,/NATIVE_056[01]_/);
  });
}
test('terminal review chain requires 0560 marker and separate Player3 authority',()=>{
  const first=contents('worker-airtrust/schema-v2/changes/0560_lms_native_catalog_activation.sql');
  const second=contents('worker-airtrust/schema-v2/changes/0561_lms_player3_canonical_terminal.sql');
  for(const fragment of [
    'CREATE TABLE lms_native_catalog_activation',
    'CREATE TABLE lms_native_enrollment_intents',
    'DROP TRIGGER lms_player3_attempt_insert',
  ]) assert.ok(first.includes(fragment),fragment);
  for(const fragment of [
    'CREATE TABLE lms_native_completion_intents',
    'CREATE TABLE lms_player3_completion_intents',
    'lms_native_catalog_activation',
    'PLAYER3_TERMINAL_INTENT',
  ]) assert.ok(second.includes(fragment),fragment);
});

test('0559 staging apply requires exact reviewed 0558 ledger evidence',()=>{
  assert.match(workflow,/change_id='lms-native-v1-evidence-0558'/);
  assert.match(workflow,/PLAYER3_NATIVE_0558_REQUIRED_FIRST/);
  assert.match(workflow,/RELEASE_SHA_DRIFT/);
  assert.match(workflow,/Verify eight required GitHub release gates/);
});
