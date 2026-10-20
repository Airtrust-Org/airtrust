import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {checkWorkflowContent} from '../ci/cloudflare-secret-contract-lib.mjs';
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
 assert.match(s,/secrets\.CLOUDFLARE_PAGES_API_TOKEN/);
 assert.doesNotMatch(s,/secrets\.PLAYER3_QA_R2_PAGES_API_TOKEN/);
 assert.match(s,/secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
 assert.match(s,/inputs\.phase == 'publish' &&/);
 assert.match(s,/inputs\.phase == 'bootstrap' \|\| inputs\.phase == 'edition'/);
 assert.doesNotMatch(s,/pull_request_target:|secrets\.CLOUDFLARE_WORKER_API_TOKEN/);
});

test('scoped staging jobs never inherit D1 and R2/Pages credentials together',()=>{
 const w=readFileSync(resolve('.github/workflows/staging-player3-synthetic-qa.yml'),'utf8');
 const failures=checkWorkflowContent('.github/workflows/staging-player3-synthetic-qa.yml',w);
 assert.deepEqual(failures,[],failures.join('\n'));
 const extract=(job)=>{
   const tag='  '+job+':\n';
   const i=w.indexOf(tag);
   assert.notEqual(i,-1,'missing job '+job);
   const next=w.slice(i+tag.length).search(/^  [a-z][a-z0-9-]*:\s*$/m);
   return next===-1?w.slice(i):w.slice(i,i+tag.length+next);
 };
 const readOnly=extract('verify-qa-credential');
 const d1=extract('d1-schema-operation');
 const verify=extract('verify-r2-pages');
 const publish=extract('publish-r2-pages');
 assert.match(d1,/name: Governed staging D1 schema preflight/);
 assert.match(d1,/environment: staging/);
 assert.match(d1,/secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
 assert.doesNotMatch(d1,/secrets\.CLOUDFLARE_PAGES_API_TOKEN/);
 assert.match(readOnly,/secrets\.CLOUDFLARE_PAGES_API_TOKEN/);
 assert.doesNotMatch(readOnly,/secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
 assert.match(readOnly,/player3-qa-trusted-executor\.mjs access/);
 assert.match(d1,/needs\.verify-qa-credential\.result == 'success'/);
 assert.match(verify,/secrets\.CLOUDFLARE_PAGES_API_TOKEN/);
 assert.doesNotMatch(verify,/secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
 assert.match(publish,/secrets\.CLOUDFLARE_PAGES_API_TOKEN/);
 assert.doesNotMatch(publish,/secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
 assert.match(w,/needs\.verify-r2-pages\.result == 'success'/);
 assert.match(w,/needs\.d1-schema-operation\.result == 'success'/);
 assert.match(w,/QA_R2_VERIFIED_PLAN_SHA:/);
 assert.match(w,/QA_D1_PREFLIGHT_OK:/);
 assert.match(w,/cancel-in-progress: false/);
 assert.match(w,/CREDENTIAL: \$\{\{ needs\.verify-qa-credential\.result \}\}/);
 const executor=readFileSync(resolve('scripts/staging/player3-qa-trusted-executor.mjs'),'utf8');
 assert.match(executor,/PLAYER3_QA_R2_TOKEN_SCOPE_MISSING/);
 assert.match(executor,/PLAYER3_QA_PAGES_TOKEN_SCOPE_MISSING/);
 assert.match(executor,/if\(mode==='access'\)await doAccess\(\)/);
 assert.doesNotMatch(w,/pull_request_target:/);
});

test('existing Pages token is probed read-only by guarded staging diagnostic',()=>{
 const source=readFileSync(resolve('.github/workflows/cloudflare-credential-doctor.yml'),'utf8');
 assert.match(source,/- player3_pages_r2/);
 assert.match(source,/inputs\.credential == 'player3_pages_r2' && inputs\.target_environment == 'staging'/);
 assert.match(source,/secrets\.CLOUDFLARE_PAGES_API_TOKEN/);
 assert.match(source,/pages\/projects\/qa-player3-staging/);
 assert.match(source,/r2\/buckets\/airtrust-storage-staging/);
 assert.match(source,/R2_READONLY_ACCESS/);
 assert.doesNotMatch(source,/secrets\.PLAYER3_QA_R2_PAGES_API_TOKEN/);
});

test('protected executor denies local operation without main and reviewed files',()=>{
 const result=spawnSync(process.execPath,
   ['scripts/staging/player3-qa-trusted-executor.mjs','prepare'],
   {cwd:resolve('.'),env:{...process.env,GITHUB_ACTIONS:'false'},encoding:'utf8'});
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/PLAYER3_TRUSTED_MAIN_ONLY/);
});


test('trusted executor also pins transitive Python loader and Wrangler lockfile',()=>{
 const source=readFileSync(resolve('scripts/staging/player3-qa-trusted-executor.mjs'),'utf8');
 for(const [file,sha] of [
   ['scripts/learning-factory/generate_player3_technical_zip.py',
    '9a18f21c60c05c3173f03ad365d6ee1df5b1519202f513e88aea34f6e038f7e5'],
   ['worker-airtrust/package-lock.json',
    '0516921fa9eddea097711828b9f5b406391828cb12bb88dbe46b90ffd5562235']
 ]){
   assert.ok(source.includes("'"+file+"':'"+sha+"'"),'missing pinned dependency '+file);
 }
 assert.match(source,/fileHash\(p\)===expected/);
});
