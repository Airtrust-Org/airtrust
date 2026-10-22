import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {assertV2QaSnapshot,PIN} from '../staging/player3-qa-trusted-executor.mjs';
import {ARTIFACT_SHA,expectedGrant,checkGrantBody} from '../staging/player3-qa-approval-guard.mjs';

const base=Object.freeze({
 tenant:1,s61:1,s62:1,v1_course:1,v1_marker:1,v1_edition:1,v1_policy:1,
 types:0,courses:0,course_id:0,markers:0,editions:0,policies:0,enrolled:0
});
const ready=Object.freeze({...base,types:1,courses:1,course_id:328,markers:1});
test('trusted executor pins the staged-bootstrap category reuse correction',()=>{
 assert.equal(PIN['scripts/staging/build_player3_qa_catalog_sql_plan.py'],
  'ad01d77112639fac1216b1bdc120b13c8fd7c8861513193bf0bdc36231745adc');
});
test('v2 bootstrap tolerates preserved v1 course but requires empty new course',()=>{
 assert.equal(assertV2QaSnapshot(base,'bootstrap',0),base);
 assert.throws(()=>assertV2QaSnapshot({...base,courses:1},'bootstrap',0),/PLAYER3_V2_BOOTSTRAP_NOT_FRESH/);
 assert.throws(()=>assertV2QaSnapshot({...base,course_id:327},'bootstrap',0),/PLAYER3_V2_BOOTSTRAP_NOT_FRESH/);
});
test('v2 publish/edition demands precisely one new course and zero bound learners',()=>{
 for(const p of ['publish','edition'])assert.equal(assertV2QaSnapshot(ready,p,328),ready);
 for(const patch of [{editions:1},{policies:1},{enrolled:1},{markers:2},{v1_edition:0},{v1_course:0}]){
  assert.throws(()=>assertV2QaSnapshot({...ready,...patch},'edition',328),/PLAYER3_V1_IMMUTABLE_QA_BASELINE_MISSING|PLAYER3_V2_PUBLISH_OR_EDITION_STATE_DRIFT/);
 }
 assert.throws(()=>assertV2QaSnapshot(ready,'publish',327),/PLAYER3_V2_PUBLISH_OR_EDITION_STATE_DRIFT/);
});
test('grant pins new QA edition hash and refuses historical SHA',()=>{
 assert.equal(ARTIFACT_SHA,'07d9a165a7840b548aee339354054885d437d19909537ead6e5eab4b71449c8e');
 const params={sha:'a'.repeat(40),phase:'publish',sqlSha:'none',planSha:'b'.repeat(64),courseId:'328',approverId:'0'};
 const grant=expectedGrant(params);
 checkGrantBody('AIRTRUST_PLAYER3_QA_GRANT_V1\n'+JSON.stringify(grant),params);
 assert.throws(()=>checkGrantBody('AIRTRUST_PLAYER3_QA_GRANT_V1\n'+JSON.stringify({...grant,artifact_sha256:'0dcbbb7d50235d2e37d2c1ddda16c1f55cb2482551a6cf3a3a420829cf642b8f'}),params),/PLAYER3_F0_GRANT_SCOPE_OR_SHA_MISMATCH/);
});
