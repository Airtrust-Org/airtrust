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

test('trusted workflow isolates existing staging Pages, Worker/R2 and D1 tokens',()=>{
 const s=readFileSync(resolve('.github/workflows/staging-player3-synthetic-qa.yml'),'utf8');
 assert.match(s,/group:\s*airtrust-staging-mutations-and-scorm-qa/);
 assert.match(s,/environment:\s*staging/);
 for(const name of ['CLOUDFLARE_WORKER_API_TOKEN','CLOUDFLARE_PAGES_API_TOKEN','CLOUDFLARE_D1_MIGRATION_API_TOKEN'])
   assert.ok(s.includes('secrets.'+name));
 assert.doesNotMatch(s,/secrets\.PLAYER3_QA_R2_PAGES_API_TOKEN|pull_request_target:/);
 assert.match(s,/inputs\.phase == 'publish' &&/);
 assert.match(s,/inputs\.phase == 'bootstrap' \|\| inputs\.phase == 'edition'/);
});

test('scoped QA jobs preserve least-privilege steps, provenance and recovery',()=>{
 const w=readFileSync(resolve('.github/workflows/staging-player3-synthetic-qa.yml'),'utf8');
 const failures=checkWorkflowContent('.github/workflows/staging-player3-synthetic-qa.yml',w);
 assert.deepEqual(failures,[],failures.join('\n'));
 const extract=job=>{
   const tag='  '+job+':\n';
   const i=w.indexOf(tag);
   assert.notEqual(i,-1,'missing job '+job);
   const next=w.slice(i+tag.length).search(/^  [a-z][a-z0-9-]*:\s*$/m);
   return next===-1?w.slice(i):w.slice(i,i+tag.length+next);
 };
 const pages=extract('access-qa-pages');
 const r2=extract('access-qa-r2');
 const verify=extract('verify-r2-https');
 const d1=extract('d1-schema-operation');
 const publish=extract('publish-qa-artifacts');
 assert.match(pages,/secrets\.CLOUDFLARE_PAGES_API_TOKEN/);
 assert.doesNotMatch(pages,/secrets\.CLOUDFLARE_WORKER_API_TOKEN|secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
 assert.match(pages,/player3-qa-trusted-executor\.mjs access-pages/);
 assert.match(r2,/secrets\.CLOUDFLARE_WORKER_API_TOKEN/);
 assert.doesNotMatch(r2,/secrets\.CLOUDFLARE_PAGES_API_TOKEN|secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
 assert.match(r2,/player3-qa-trusted-executor\.mjs access-r2/);
 assert.match(verify,/secrets\.CLOUDFLARE_WORKER_API_TOKEN/);
 assert.doesNotMatch(verify,/secrets\.CLOUDFLARE_PAGES_API_TOKEN|secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
 assert.match(d1,/name: Governed staging D1 schema preflight/);
 assert.match(d1,/secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
 assert.doesNotMatch(d1,/secrets\.CLOUDFLARE_WORKER_API_TOKEN|secrets\.CLOUDFLARE_PAGES_API_TOKEN/);
 assert.match(d1,/needs\.access-qa-pages\.result == 'success'/);
 assert.match(d1,/needs\.access-qa-r2\.result == 'success'/);
 assert.match(d1,/needs\.verify-r2-https\.result == 'success'/);
 assert.match(publish,/run: node scripts\/staging\/player3-qa-trusted-executor\.mjs publish-r2/);
 assert.match(publish,/run: node scripts\/staging\/player3-qa-trusted-executor\.mjs publish-pages/);
 const r2Step=publish.split('      - name: Publish and verify only immutable tenant-scoped private R2 with Worker token')[1]
   .split('      - name: Publish only reviewed browser assets on isolated QA Pages with Pages token')[0];
 const pagesStep=publish.split('      - name: Publish only reviewed browser assets on isolated QA Pages with Pages token')[1]
   .split('      - name: Erase temporary private publication files')[0];
 assert.match(r2Step,/secrets\.CLOUDFLARE_WORKER_API_TOKEN/);
 assert.doesNotMatch(r2Step,/secrets\.CLOUDFLARE_PAGES_API_TOKEN|secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
 assert.match(pagesStep,/secrets\.CLOUDFLARE_PAGES_API_TOKEN/);
 assert.doesNotMatch(pagesStep,/secrets\.CLOUDFLARE_WORKER_API_TOKEN|secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
 assert.match(w,/needs\.d1-schema-operation\.result == 'success'/);
 assert.match(w,/QA_R2_VERIFIED_PLAN_SHA:/);
 assert.match(w,/QA_D1_PREFLIGHT_OK:/);
 assert.match(w,/cancel-in-progress: false/);
 assert.match(w,/PAGES_ACCESS: \$\{\{ needs\.access-qa-pages\.result \}\}/);
 assert.match(w,/R2_ACCESS: \$\{\{ needs\.access-qa-r2\.result \}\}/);
 const executor=readFileSync(resolve('scripts/staging/player3-qa-trusted-executor.mjs'),'utf8');
 assert.match(executor,/PLAYER3_QA_R2_TOKEN_SCOPE_MISSING/);
 assert.match(executor,/PLAYER3_QA_PAGES_TOKEN_SCOPE_MISSING/);
 assert.match(executor,/mode==='access-pages'\|\|mode==='access-r2'/);
 assert.match(executor,/mode==='publish-r2'/);
 assert.match(executor,/mode==='publish-pages'/);
 assert.match(executor,/PLAYER3_SPLIT_PUBLISH_MODES_REQUIRED/);
 assert.match(executor,/--branch=main/);
 assert.doesNotMatch(w,/pull_request_target:/);
});

test('existing Pages token is probed read-only by guarded staging diagnostic',()=>{
 const source=readFileSync(resolve('.github/workflows/cloudflare-credential-doctor.yml'),'utf8');
 assert.match(source,/- player3_pages_r2/);
 assert.match(source,/inputs\.credential == 'player3_pages_r2' && inputs\.target_environment == 'staging'/);
 assert.match(source,/secrets\.CLOUDFLARE_PAGES_API_TOKEN/);
 assert.match(source,/pages\/projects\/qa-player3-staging/);
 assert.match(source,/r2\/buckets\/airtrust-storage-staging/);
 assert.match(source,/\['R2','r2\/buckets\/airtrust-storage-staging'/);
 assert.match(source,/kind\+'_READONLY_ACCESS='/);
 assert.match(source,/- player3_worker_r2/);
 assert.match(source,/inputs\.credential == 'player3_worker_r2' && inputs\.target_environment == 'staging'/);
 assert.match(source,/secrets\.CLOUDFLARE_WORKER_API_TOKEN/);
 assert.match(source,/R2_READONLY_ACCESS/);
 assert.doesNotMatch(source,/secrets\.PLAYER3_QA_R2_PAGES_API_TOKEN/);
});

test('new split publish modes preserve F0 grant and fail closed outside Actions',()=>{
 const executor=readFileSync(resolve('scripts/staging/player3-qa-trusted-executor.mjs'),'utf8');
 assert.match(executor,/PLAYER3_F0_APPROVAL_LOCK_RECOVERY_AND_TARGET_REQUIRED/);
 assert.match(executor,/PLAYER3_PRIVATE_R2_STEP_PROOF_REQUIRED/);
 assert.match(executor,/PLAYER3_R2_OBJECT_SCOPE_INVALID/);
 assert.match(executor,/PLAYER3_PUBLIC_ASSET_SCOPE_INVALID/);
 for(const mode of ['publish-r2','publish-pages','access-pages','access-r2']){
  const result=spawnSync(process.execPath,
   ['scripts/staging/player3-qa-trusted-executor.mjs',mode],
   {cwd:resolve('.'),env:{...process.env,GITHUB_ACTIONS:'false'},encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/PLAYER3_TRUSTED_MAIN_ONLY/);
 }
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
    'a6c178bbddf132088007989300ec9f7c0ebd4943d68a53e7736066dfabd22bca'],
   ['worker-airtrust/package-lock.json',
    '6b5f8dbed586c6e67ebbf16dda5c157d5e16be621a81e136f530896cc69c45f6']
 ]){
   assert.ok(source.includes("'"+file+"':'"+sha+"'"),'missing pinned dependency '+file);
 }
 assert.match(source,/fileHash\(p\)===expected/);
});
