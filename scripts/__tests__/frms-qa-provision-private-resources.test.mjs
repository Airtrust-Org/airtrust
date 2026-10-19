import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync} from 'node:crypto';
import {
  REPO,MUTEX,RULE,provisionPlan,assertProvisionComment,authorize,
  createPrivateBucket,buildPrivateRuntimeSecrets,publishPrivateWorker,
} from '../../ops/frms-qa-repair/provision-private-resources.mjs';
import {EXPECTED} from '../../ops/frms-qa-repair/verify-readiness.mjs';

const sha='a'.repeat(40),configText=readFileSync(
  'ops/frms-qa-repair/wrangler.staging.toml','utf8');
const fakePlan=provisionPlan({sha,phase:'bucket',configSha:'b'.repeat(64)});
const now=Date.parse('2026-10-19T18:30:00Z');
const env={
  GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:REPO,
  GITHUB_SHA:sha,GITHUB_ACTOR:'f0-admin',
  FRMS_QA_PHASE:'bucket',FRMS_QA_GRANT_ID:'123',
  FRMS_QA_EXPECTED_SHA:sha,
  FRMS_QA_CONFIRM:'AIRTRUST_FRMS_QA_PRIVATE_STAGING_PROVISION',
};
const body=p=>'AIRTRUST_FRMS_QA_PROVISION_V1\n'+JSON.stringify(p);
function apiFor(plan,{permission='admin',gates=true,extraGrant={}}={}){
  return async path=>{
    if(path.endsWith('/branches/main'))return {commit:{sha}};
    if(path.includes('/check-runs?'))return {check_runs:
      (gates?['lint','build-content-gates','worker-typecheck','frontend-coverage',
        'worker-tests-1','worker-tests-2','lms-smoke','public-e2e']:['lint'])
        .map(name=>({name,head_sha:sha,status:'completed',conclusion:'success'}))};
    if(path.includes('/issues/comments/'))return {
      issue_url:'https://api.github.com/repos/'+REPO+'/issues/776',
      body:body({...plan,...extraGrant}),
      created_at:'2026-10-19T18:20:00Z',updated_at:'2026-10-19T18:20:00Z',
      user:{login:'f0-admin'}};
    if(path.includes('/collaborators/'))return {permission};
    throw Error('unexpected '+path);
  };
}
test('complete grant requires exact F0 admin, current SHA and all 8 gates',async()=>{
  const {createHash}=await import('node:crypto');
  const digest=createHash('sha256').update(configText).digest('hex');
  const approved=provisionPlan({sha,phase:'bucket',configSha:digest});
  assert.equal((await authorize({env,api:apiFor(approved),now,configText})).phase,'bucket');
  for(const opts of [
    {api:apiFor(approved,{permission:'write'}),error:'ADMIN'},
    {api:apiFor(approved,{gates:false}),error:'GATES'},
    {api:apiFor(approved,{extraGrant:{tenant_id:6}}),error:'NOT_EXACT'},
    {api:apiFor(approved,{extraGrant:{rollout:'PRODUCTION'}}),error:'NOT_EXACT'},
  ]){
    await assert.rejects(authorize({env,api:opts.api,now,configText}),
      new RegExp(opts.error));
  }
  await assert.rejects(authorize({env:{...env,GITHUB_REF:'refs/heads/feat'},
    api:apiFor(approved),now,configText}),/TRUSTED_MAIN/);
  await assert.rejects(authorize({env,api:apiFor(approved),
    now:now+13*3600000,configText}),/EXPIRED/);
  assert.throws(()=>assertProvisionComment(body({...approved,extra:'no'}),approved),
    /NOT_EXACT/);
});
test('provision plan fixes tenant 999013, D1 UUID and global lock',()=>{
  assert.equal(fakePlan.tenant_id,999013);
  assert.equal(fakePlan.d1_uuid,EXPECTED.d1Id);
  assert.equal(fakePlan.global_mutex,MUTEX);
  assert.equal(fakePlan.r2_public_access,false);
  assert.equal(fakePlan.r2_lifecycle_max_age_seconds,86400);
  assert.equal(RULE.conditions.prefix,'frms-qa/999013/');
});
function cfHarness({exists=false,badD1=false,managed=true,lifecycle=[]}={}){
  const calls=[];
  let created=exists;
  let configured=[...lifecycle];
  let domainEnabled=managed;
  const fetcher=async(url,options)=>{
    const path=new URL(url).pathname,method=options.method;
    calls.push([method,path]);
    assert.equal(options.headers.Authorization,'Bearer '+(method==='GET'?'unit-test-read':'unit-test-write'));
    if(path.endsWith('/d1/database/'+EXPECTED.d1Id))
      return Response.json({success:true,result:{
        uuid:badD1?'0'.repeat(32):EXPECTED.d1Id,name:EXPECTED.d1Name}});
    if(path.endsWith('/r2/buckets/'+EXPECTED.bucket)){
      if(method==='GET'&&!created)return Response.json({}, {status:404});
      if(method==='GET')return Response.json({success:true,result:{name:EXPECTED.bucket}});
    }
    if(path.endsWith('/r2/buckets')&&method==='POST'){
      assert.deepEqual(JSON.parse(options.body),{name:EXPECTED.bucket});
      created=true;
      return Response.json({success:true,result:{name:EXPECTED.bucket}});
    }
    if(path.endsWith('/domains/custom'))
      return Response.json({success:true,result:{domains:[]}});
    if(path.endsWith('/domains/managed')){
      if(method==='PUT'){
        assert.deepEqual(JSON.parse(options.body),{enabled:false});
        domainEnabled=false;
      }
      return Response.json({success:true,result:{enabled:domainEnabled}});
    }
    if(path.endsWith('/lifecycle')){
      if(method==='PUT')configured=JSON.parse(options.body).rules;
      return Response.json({success:true,result:{rules:configured}});
    }
    throw Error('Unexpected Cloudflare route '+method+' '+path);
  };
  return {fetcher,calls};
}
const cred={accountId:'a'.repeat(32),token:'unit-test-write',readToken:'unit-test-read'};
test('creates only brand-new R2 bucket, closes managed access, adds prefix 24h TTL, GET readback',async()=>{
  const h=cfHarness({managed:true});
  const r=await createPrivateBucket({...cred,fetcher:h.fetcher});
  assert.equal(r.writes,3);
  assert.equal(h.calls.filter(([m])=>m==='POST').length,1);
  assert.equal(h.calls.filter(([m])=>m==='PUT').length,2);
  assert.equal(h.calls.filter(([m])=>m==='DELETE').length,0);
});
test('existing private compliant bucket is reused without any writes',async()=>{
  const h=cfHarness({exists:true,managed:false,lifecycle:[RULE]});
  const r=await createPrivateBucket({...cred,fetcher:h.fetcher});
  assert.equal(r.writes,0);
  assert.ok(h.calls.every(([method])=>method==='GET'));
});
test('denies existing bucket without privacy and wrong D1, never attempts fixing foreign bucket',async()=>{
  for(const opts of [
    {exists:true,managed:true,lifecycle:[RULE]},
    {exists:true,managed:false,lifecycle:[]},
    {exists:false,badD1:true},
  ]){
    const h=cfHarness(opts);
    await assert.rejects(createPrivateBucket({...cred,fetcher:h.fetcher}),
      /FRMS_QA_|QA_PRIVATE_/);
    assert.equal(h.calls.filter(([m])=>m==='POST'||m==='PUT').length,0);
  }
});
test('prevents lifecycle replacement on colliding fresh-bucket rule',async()=>{
  const h=cfHarness({lifecycle:[{
    id:'unexpected-global-expiry',enabled:true,conditions:{prefix:''},
    deleteObjectsTransition:{condition:{type:'Age',maxAge:200}},
  }]});
  await assert.rejects(createPrivateBucket({...cred,fetcher:h.fetcher}),
    /LIFECYCLE_COLLISION/);
  assert.equal(h.calls.filter(([m,p])=>m==='PUT'&&p.endsWith('lifecycle')).length,0);
});
test('worker secrets derive cryptographic fingerprints; release is SHA-pinned',()=>{
  const {publicKey}=generateKeyPairSync('ed25519');
  const pub=publicKey.export({type:'spki',format:'pem'});
  const e={CLOUDFLARE_ACCOUNT_ID:'b'.repeat(32),
    FRMS_QA_CALLER_KEY_HEX:'a'.repeat(64),FRMS_QA_PREIMAGE_KEY_HEX:'c'.repeat(64),
    FRMS_QA_APPROVAL_PUBLIC_KEY_PEM:pub,FRMS_QA_D1_READ_TOKEN:'read-token'};
  const v=buildPrivateRuntimeSecrets({env:e,sha});
  assert.equal(v.RELEASE_SHA,sha);
  assert.match(v.APPROVAL_KEY_SHA256,/^[a-f0-9]{64}$/);
  assert.match(v.CALLER_KEY_SHA256,/^[a-f0-9]{64}$/);
  assert.equal(v.PRIVATE_STORAGE_VERIFIED,'restricted-r2-lifecycle-1d');
  assert.throws(()=>buildPrivateRuntimeSecrets({env:{...e,FRMS_QA_D1_READ_TOKEN:''},sha}),
    /SECRETS_MISSING/);
});

test('reviewed Worker deploy sends private keys only through bulk stdin, no public route',async()=>{
  const {publicKey}=generateKeyPairSync('ed25519');
  const priv={
    GITHUB_SHA:sha,CLOUDFLARE_ACCOUNT_ID:'b'.repeat(32),
    CLOUDFLARE_FRMS_QA_WORKER_DEPLOY_API_TOKEN:'worker-deploy-scoped',
    CLOUDFLARE_FRMS_QA_READ_API_TOKEN:'metadata-only',
    FRMS_QA_CALLER_KEY_HEX:'a'.repeat(64),FRMS_QA_PREIMAGE_KEY_HEX:'c'.repeat(64),
    FRMS_QA_APPROVAL_PUBLIC_KEY_PEM:publicKey.export({type:'spki',format:'pem'}),
    FRMS_QA_D1_READ_TOKEN:'timetravel-read-only',
  };
  let commands=[],secretKeys=[];
  const mocked=(exe,args,opts)=>{
    commands.push(args.slice());
    assert.equal(exe,'node_modules/.bin/wrangler');
    assert.equal(opts.env.CLOUDFLARE_API_TOKEN,'worker-deploy-scoped');
    assert.equal(opts.env.FRMS_QA_PREIMAGE_KEY_HEX,undefined);
    assert.equal(opts.env.FRMS_QA_D1_READ_TOKEN,undefined);
    if(args[0]==='secret'&&args[1]==='bulk'){
      const obj=JSON.parse(opts.input);
      secretKeys=Object.keys(obj);
      assert.equal(obj.PRIVATE_STORAGE_VERIFIED,'restricted-r2-lifecycle-1d');
      assert.equal(obj.RELEASE_SHA,sha);
      return '';
    }
    if(args[0]==='secret'&&args[1]==='list'){
      return JSON.stringify(secretKeys.map(name=>({name,type:'secret_text'})));
    }
    return '';
  };
  const r=await publishPrivateWorker({
    env:priv,exec:mocked,readiness:async ({token})=>{
      assert.equal(token,'metadata-only');
      return {verdict:'PRIVATE_STAGING_RESOURCES_READONLY_VERIFIED'};
    },
  });
  assert.equal(r.caseRepairs,0);
  assert.deepEqual(commands.map(x=>x.slice(0,2)),
    [['deploy','--config'],['secret','bulk'],['secret','list']]);
});

test('Worker provisioning requires scoped token and independently verified private R2',async()=>{
  await assert.rejects(publishPrivateWorker({env:{GITHUB_SHA:sha}}),
    /WORKER_DEPLOY_TOKEN_REQUIRED/);
  const {publicKey}=generateKeyPairSync('ed25519');
  const e={GITHUB_SHA:sha,CLOUDFLARE_ACCOUNT_ID:'b'.repeat(32),
    CLOUDFLARE_FRMS_QA_WORKER_DEPLOY_API_TOKEN:'disposable',
    CLOUDFLARE_FRMS_QA_READ_API_TOKEN:'read',
    FRMS_QA_CALLER_KEY_HEX:'a'.repeat(64),FRMS_QA_PREIMAGE_KEY_HEX:'c'.repeat(64),
    FRMS_QA_APPROVAL_PUBLIC_KEY_PEM:publicKey.export({type:'spki',format:'pem'}),
    FRMS_QA_D1_READ_TOKEN:'read-only'};
  let executed=false;
  await assert.rejects(publishPrivateWorker({env:e,readiness:async()=>{
    throw Error('No Cloudflare proof');},exec:()=>{executed=true;}}),
    /No Cloudflare proof/);
  assert.equal(executed,false);
});
