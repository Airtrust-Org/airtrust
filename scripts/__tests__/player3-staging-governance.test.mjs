import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  REPO,BRANCH,LOCK,ARTIFACT_SHA,REQUIRED,
  assertConfig,expectedGrant,checkGrantBody,checkChecks,verify,
} from '../staging/player3-qa-approval-guard.mjs';

const sha='1c7dc659ee467a9b9bdbcc39b2a13a58878d9afb';
const v={repo:REPO,ref:'refs/heads/main',event:'workflow_dispatch',
  actor:'operator',confirmation:'AIRTRUST_PLAYER3_SYNTHETIC_STAGING',
  sha,phase:'bootstrap',grantId:'123',courseId:'0',approverId:'0',
  sqlSha:'a'.repeat(64),planSha:'none'};
const grantBody=(w)=>'AIRTRUST_PLAYER3_QA_GRANT_V1\n'+JSON.stringify(expectedGrant(w));
const checks=()=>REQUIRED.map(name=>({name,status:'completed',
  conclusion:'success',head_sha:sha}));
const clock=Date.parse('2026-10-19T16:00:00Z');

function fakeGet(w,{badGate=false,permission='admin',grant=null,prOverride={}}={}){
 const item=grant||grantBody(w);
 return async path=>{
  if(path==='pulls/1389')return {
    state:'open',base:{ref:'main'},
    head:{sha:w.sha,ref:BRANCH,repo:{full_name:REPO,fork:false}},
    ...prOverride};
  if(path.startsWith('commits/'))return {check_runs:badGate?checks().slice(1):checks()};
  if(path==='issues/comments/'+w.grantId)return {
    issue_url:'https://api.github.com/repos/'+REPO+'/issues/776',
    created_at:'2026-10-19T15:50:00Z',
    updated_at:'2026-10-19T15:50:00Z',
    body:item,user:{login:'operator'}};
  if(path.endsWith('/permission'))return {permission};
  throw Error('Unexpected lookup');
 };
}

test('positive grant supports exactly three independent approved phases',async()=>{
 for(const w of [
   v,
   {...v,phase:'publish',courseId:'123',sqlSha:'none',planSha:'b'.repeat(64)},
   {...v,phase:'edition',courseId:'123',approverId:'25',planSha:'b'.repeat(64)}
 ]){
  assert.doesNotThrow(()=>assertConfig(w));
  checkGrantBody(grantBody(w),w);
  assert.equal(await verify(w,'test-github-token',fakeGet(w),clock),true);
 }
});

test('denies non-main, wrong sha, unpinned SQL, dangerous phase',()=>{
 for(const mutation of [
   {ref:'refs/heads/qa'}, {repo:'other/repo'}, {event:'push'},
   {confirmation:'AIRTRUST_PRODUCTION'}, {sha:'f'.repeat(39)},
   {sqlSha:'none'}, {phase:'delete'}, {courseId:'6'}
 ]){
  assert.throws(()=>assertConfig({...v,...mutation}),/PLAYER3_/);
 }
});

test('denies multi-tenant and unauthorized changes to F0 comment',()=>{
 for(const [key,value] of Object.entries({
  tenant_id:6,artifact_sha256:'b'.repeat(64),
  environment:'production',lock:'other',phase:'edition',
  cleanup:'DELETE',sql_sha256:'f'.repeat(64)})){
  const body='AIRTRUST_PLAYER3_QA_GRANT_V1\n'+JSON.stringify({
    ...expectedGrant(v),[key]:value});
  assert.throws(()=>checkGrantBody(body,v),/PLAYER3_F0_GRANT_SCOPE/);
 }
});

test('requires 8/8 exact SHA checks plus PR Check',()=>{
 assert.doesNotThrow(()=>checkChecks(checks(),sha));
 for(const bad of [checks().slice(1),
     checks().map(x=>({...x,head_sha:'f'.repeat(40)})),
     checks().map(x=>({...x,conclusion:'neutral'}))]){
  assert.throws(()=>checkChecks(bad,sha),/GATES_AND_PR_CHECK/);
 }
});

test('requires current admin grant and nonforked same-repo PR',async()=>{
 await assert.rejects(verify(v,'test',fakeGet(v,{permission:'write'}),clock),/ADMIN_PERMISSION/);
 await assert.rejects(verify(v,'test',fakeGet(v,{badGate:true}),clock),/GATES_AND_PR_CHECK/);
 await assert.rejects(verify(v,'test',fakeGet(v,{
   prOverride:{head:{sha,ref:BRANCH,repo:{full_name:REPO,fork:true}}}
 }),clock),/HEAD_CHANGED_OR_FORKED/);
 await assert.rejects(verify(v,'test',fakeGet(v),clock+13*3600000),/GRANT_EXPIRED/);
});

test('trusted workflow separates D1 credential from Pages/R2 credential',()=>{
 const s=readFileSync(resolve('.github/workflows/staging-player3-synthetic-qa.yml'),'utf8');
 assert.match(s,/group:\s*airtrust-staging-mutations-and-scorm-qa/);
 assert.match(s,/environment:\s*staging/);
 assert.match(s,/secrets\.PLAYER3_QA_R2_PAGES_API_TOKEN/);
 assert.match(s,/secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
 assert.match(s,/if:\s*inputs\.phase == 'publish'/);
 assert.match(s,/if:\s*inputs\.phase == 'bootstrap' \|\| inputs\.phase == 'edition'/);
 assert.doesNotMatch(s,/pull_request_target:|secrets\.CLOUDFLARE_WORKER_API_TOKEN|secrets\.CLOUDFLARE_PAGES_API_TOKEN/);
});

test('protected executor denies local operation without main and reviewed files',()=>{
 const result=spawnSync(process.execPath,
   ['scripts/staging/player3-qa-trusted-executor.mjs','prepare'],
   {cwd:resolve('.'),env:{...process.env,GITHUB_ACTIONS:'false'},encoding:'utf8'});
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/PLAYER3_TRUSTED_MAIN_ONLY/);
});
