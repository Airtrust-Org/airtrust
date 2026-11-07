import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {checkRows,validateGrant,CONFIRM,V2_HASH}
 from '../staging/player3-qa-v2-learners.mjs';
const sha='a'.repeat(40),now=Date.parse('2026-10-22T01:00:00Z');
const grant={body:CONFIRM+' '+sha+' tenant=999006 course=328 learners=2 staging-only',
 issue_url:'https://api.github.com/repos/Airtrust-Org/airtrust/issues/776',
 user:{login:'qa-admin'},created_at:'2026-10-22T00:30:00Z',
 updated_at:'2026-10-22T00:30:00Z'};
const rows=[
 {email:'qa-player3-chromium@staging.airtrust.invalid',empresa_id:999006,
 funcionario_id:11,course_count:1,marker_count:1,published_count:1,
 edition_count:1,edition_hash:V2_HASH,enrollment_count:0},
 {email:'qa-player3-webkit@staging.airtrust.invalid',empresa_id:999006,
 funcionario_id:12,course_count:1,marker_count:1,published_count:1,
 edition_count:1,edition_hash:V2_HASH,enrollment_count:0}
];
test('requires fresh exact unedited admin comment and scoped course',()=>{
 assert.doesNotThrow(()=>validateGrant(grant,'qa-admin','admin',sha,328,now));
 for(const [value,actor,permission,course,clock] of [
 [{...grant,updated_at:'2026-10-22T00:31:00Z'},'qa-admin','admin',328,now],
 [grant,'another-admin','admin',328,now],[grant,'qa-admin','write',328,now],
 [grant,'qa-admin','admin',327,now],[grant,'qa-admin','admin',328,now+5*3600000]]){
  assert.throws(()=>validateGrant(value,actor,permission,sha,course,clock),
   /PLAYER3_QA_V2_FRESH_EXACT_ADMIN_GRANT_REQUIRED/);
 }
});
test('no existing V2 enrollments, independent employees, one pinned edition',()=>{
 assert.equal(checkRows(rows,328),rows);
 for(const patch of [{enrollment_count:1},{published_count:2},{edition_count:0},
  {course_count:0},{marker_count:0},{edition_hash:'0'.repeat(64)}]){
  assert.throws(()=>checkRows([{...rows[0],...patch},rows[1]],328),
   /PLAYER3_QA_V2_V2_COURSE_EDITION_STUDENT_SCOPE_INVALID/);
 }
 assert.throws(()=>checkRows([rows[0],{...rows[1],funcionario_id:11}],328),
 /PLAYER3_QA_V2_V2_STUDENT_IDENTITIES_NOT_DISTINCT/);
});
test('postflight checks two new scoped enrollment pins without changing V1',()=>{
 const after=rows.map((r,i)=>({...r,enrollment_count:2,matricula_id:401+i,
  ciclo_id:501+i,status:'NAO_INICIADO',ciclo_status:'NAO_INICIADO',
  ciclo_atual:1}));
 assert.equal(checkRows(after,328,true),after);
 assert.throws(()=>checkRows(after,328,false),/PLAYER3_QA_V2_V2_COURSE_EDITION_STUDENT_SCOPE_INVALID/);
 assert.throws(()=>checkRows([{...after[0],status:'CONCLUIDO'},after[1]],328,true),
 /PLAYER3_QA_V2_V2_ATOMIC_ENROLLMENT_OR_CYCLE_MISSING/);
});
