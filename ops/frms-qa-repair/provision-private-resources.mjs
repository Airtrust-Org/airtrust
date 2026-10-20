/**
 * FRMS QA staging resource provisioning, never case repair or production.
 * source_reference: #1426, #776, PR #1631, FRMS_QA_PRIVATE_ADAPTER.
 * operational_decision: an exact F0 issue grant and protected Actions
 * staging job are required before each remote resource mutation.
 * dry_run_required: authorize() and plan() never write to Cloudflare.
 * rollback_plan_required: created bucket/DO/Worker retained for reviewed
 * compensation; no automatic deletion or D1 Time Travel rollback.
 */
import {createHash, createPublicKey} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {EXPECTED,inspectPrivateStagingResources,assertPrivateConfig} from './verify-readiness.mjs';

export const REPO='Airtrust-Org/airtrust';
export const MUTEX='airtrust-staging-mutations-and-scorm-qa';
export const RULE=Object.freeze({
  id:'frms-qa-private-preimages-expire-24h',
  enabled:true,
  conditions:{prefix:EXPECTED.prefix},
  deleteObjectsTransition:{condition:{type:'Age',maxAge:86400}},
});
const PHASES=['bucket','worker'];
const GATES=['lint','build-content-gates','worker-typecheck','frontend-coverage',
  'worker-tests-1','worker-tests-2','lms-smoke','public-e2e'];
const fail=code=>{throw Error(code);};
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const HEX40=/^[a-f0-9]{40}$/;
const HEX64=/^[a-f0-9]{64}$/;
const ACCOUNT=/^[a-f0-9]{32}$/;

export function provisionPlan({sha,phase,configSha}){
  if(!HEX40.test(sha)||!PHASES.includes(phase)||!HEX64.test(configSha))
    fail('FRMS_QA_PROVISION_INPUT_DENIED');
  return {
    schema:'AIRTRUST_FRMS_QA_PROVISION_V1',
    repository:REPO,issue:776,frms_issue:1426,
    release_sha:sha,phase,tenant_id:999013,
    d1_uuid:EXPECTED.d1Id,d1_name:EXPECTED.d1Name,
    r2_bucket:EXPECTED.bucket,r2_prefix:EXPECTED.prefix,
    r2_lifecycle_max_age_seconds:86400,
    r2_public_access:false,worker:EXPECTED.worker,
    wrangler_config_sha256:configSha,
    global_mutex:MUTEX,
    private_runtime_only:true,
    rollout:'STAGING_ONLY_NO_REPAIR_APPLY',
    cleanup:'SEPARATE_F0_AUTHORIZATION_REQUIRED',
  };
}

export function assertProvisionComment(body,plan){
  if(typeof body!=='string'||!body.startsWith('AIRTRUST_FRMS_QA_PROVISION_V1\n'))
    fail('FRMS_QA_F0_GRANT_MISSING');
  let data;
  try{data=JSON.parse(body.slice('AIRTRUST_FRMS_QA_PROVISION_V1\n'.length));}
  catch{fail('FRMS_QA_F0_GRANT_INVALID');}
  if(!data||typeof data!=='object'||Array.isArray(data)||
    Object.keys(data).sort().join('|')!==Object.keys(plan).sort().join('|')||
    Object.entries(plan).some(([key,value])=>data[key]!==value))
    fail('FRMS_QA_F0_GRANT_NOT_EXACT');
}

export async function authorize({env,api,now=Date.now(),configText}){
  const sha=env.GITHUB_SHA,phase=env.FRMS_QA_PHASE,grantId=env.FRMS_QA_GRANT_ID;
  if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_REPOSITORY!==REPO||
     env.FRMS_QA_CONFIRM!=='AIRTRUST_FRMS_QA_PRIVATE_STAGING_PROVISION'||
     !HEX40.test(sha||'')||env.FRMS_QA_EXPECTED_SHA!==sha||
     !/^[1-9][0-9]{0,15}$/.test(grantId||''))
    fail('FRMS_QA_TRUSTED_MAIN_AND_GRANT_REQUIRED');
  assertPrivateConfig(configText);
  const plan=provisionPlan({sha,phase,configSha:hash(configText)});
  const main=await api('repos/'+REPO+'/branches/main');
  if(main?.commit?.sha!==sha)fail('FRMS_QA_CURRENT_MAIN_SHA_CHANGED');
  // A busy main may have >100 incidental check runs. A single unfiltered
  // first page can omit official gates even when all eight passed. Query each
  // required check name exactly and pin its SHA, conclusion and Actions app.
  const gateResults=await Promise.all(GATES.map(async name=>({
    name,
    checks:await api('repos/'+REPO+'/commits/'+sha+'/check-runs?check_name='+
      encodeURIComponent(name)+'&filter=latest&per_page=100'),
  })));
  if(!gateResults.every(({name,checks})=>
    Array.isArray(checks?.check_runs)&&checks.check_runs.some(x=>
      x.name===name&&x.head_sha===sha&&x.status==='completed'&&
      x.conclusion==='success'&&x.app?.slug==='github-actions')))
    fail('FRMS_QA_EIGHT_GATES_REQUIRED');
  const comment=await api('repos/'+REPO+'/issues/comments/'+grantId);
  if(comment?.issue_url!=='https://api.github.com/repos/'+REPO+'/issues/776'||
    comment.created_at!==comment.updated_at)
    fail('FRMS_QA_F0_GRANT_EDITED_OR_WRONG_ISSUE');
  const age=now-Date.parse(comment.created_at);
  if(!Number.isFinite(age)||age<0||age>12*3600000)
    fail('FRMS_QA_F0_GRANT_EXPIRED');
  assertProvisionComment(comment.body,plan);
  const author=comment.user?.login,actor=env.GITHUB_ACTOR;
  if(!author||!actor)fail('FRMS_QA_F0_ADMIN_MISSING');
  for(const login of new Set([author,actor])){
    if(!/^[a-zA-Z0-9-]{1,39}$/.test(login)||
      (await api('repos/'+REPO+'/collaborators/'+login+'/permission'))?.permission!=='admin')
      fail('FRMS_QA_F0_ADMIN_PERMISSION_REQUIRED');
  }
  return plan;
}

export async function createPrivateBucket({accountId,token,readToken,fetcher=fetch}){
  if(!ACCOUNT.test(accountId||'')||!token||!readToken)fail('FRMS_QA_R2_SCOPED_TOKEN_REQUIRED');
  const base='https://api.cloudflare.com/client/v4/accounts/'+accountId;
  const bucket=encodeURIComponent(EXPECTED.bucket);
  const request=async(method,path,payload,missing=false)=>{
    const response=await fetcher(base+path,{
      method,redirect:'manual',
      headers:{Authorization:'Bearer '+(method==='GET'?readToken:token),
        ...(payload?{'Content-Type':'application/json'}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{}),
      signal:AbortSignal.timeout(15000),
    });
    if(missing&&response.status===404)return null;
    if(!response.ok)fail('FRMS_QA_R2_API_DENIED_OR_FAILED');
    const doc=await response.json();
    if(doc?.success!==true||doc.result===undefined)fail('FRMS_QA_R2_API_INVALID');
    return doc.result;
  };
  const d1=await request('GET','/d1/database/'+EXPECTED.d1Id);
  if(d1?.uuid!==EXPECTED.d1Id||d1?.name!==EXPECTED.d1Name)
    fail('FRMS_QA_WRONG_STAGING_D1_ACCOUNT');
  const current=await request('GET','/r2/buckets/'+bucket,undefined,true);
  if(current){
    // Never rewrite a bucket that might already contain another team's data.
    await inspectPrivateStagingResources({accountId,token:readToken,fetcher});
    return {result:'EXISTING_PRIVATE_BUCKET_VERIFIED',writes:0};
  }
  // No other resource names or SQL supplied by the dispatcher.
  const created=await request('POST','/r2/buckets',{name:EXPECTED.bucket});
  if(created?.name!==EXPECTED.bucket)fail('FRMS_QA_BUCKET_CREATE_WRONG_TARGET');
  // This is a brand new bucket. Explicitly close its public managed endpoint.
  const custom=await request('GET','/r2/buckets/'+bucket+'/domains/custom');
  if(!Array.isArray(custom?.domains)||custom.domains.length)
    fail('FRMS_QA_BUCKET_PUBLIC_CUSTOM_DOMAIN');
  await request('PUT','/r2/buckets/'+bucket+'/domains/managed',{enabled:false});
  const lifecycle=await request('GET','/r2/buckets/'+bucket+'/lifecycle');
  if(!Array.isArray(lifecycle?.rules))fail('FRMS_QA_LIFECYCLE_READ_REQUIRED');
  if(lifecycle.rules.some(r=>r.conditions?.prefix===EXPECTED.prefix||
    (r.deleteObjectsTransition && (!r.conditions?.prefix||
      EXPECTED.prefix.startsWith(r.conditions.prefix)))))
    fail('FRMS_QA_LIFECYCLE_COLLISION');
  await request('PUT','/r2/buckets/'+bucket+'/lifecycle',
    {rules:[...lifecycle.rules,RULE]});
  await inspectPrivateStagingResources({accountId,token:readToken,fetcher});
  return {result:'CREATED_PRIVATE_BUCKET_AND_24H_PREFIX_RETENTION_VERIFIED',
          writes:3,workerPublished:false,caseRepairs:0};
}

export function buildPrivateRuntimeSecrets({env,sha}){
  const approved=env.FRMS_QA_APPROVAL_PUBLIC_KEY_PEM;
  const caller=env.FRMS_QA_CALLER_KEY_HEX,preimage=env.FRMS_QA_PREIMAGE_KEY_HEX;
  const d1read=env.FRMS_QA_D1_READ_TOKEN;
  if(!HEX40.test(sha||'')||!HEX64.test(caller||'')||
     !HEX64.test(preimage||'')||!d1read||!approved||
     !ACCOUNT.test(env.CLOUDFLARE_ACCOUNT_ID||''))
    fail('FRMS_QA_PRIVATE_RUNTIME_SECRETS_MISSING');
  let der;
  try{der=createPublicKey(approved).export({type:'spki',format:'der'});}
  catch{fail('FRMS_QA_ED25519_PUBLIC_KEY_INVALID');}
  if(createPublicKey(approved).asymmetricKeyType!=='ed25519')
    fail('FRMS_QA_ED25519_PUBLIC_KEY_INVALID');
  return {
    RELEASE_SHA:sha,
    APPROVAL_PUBLIC_KEY_PEM:approved,
    APPROVAL_KEY_SHA256:hash(der),
    PREIMAGE_KEY_HEX:preimage,
    CALLER_KEY_HEX:caller,
    CALLER_KEY_SHA256:hash(Buffer.from(caller,'hex')),
    D1_READ_TOKEN:d1read,
    CLOUDFLARE_ACCOUNT_ID:env.CLOUDFLARE_ACCOUNT_ID,
    PRIVATE_STORAGE_VERIFIED:'restricted-r2-lifecycle-1d',
  };
}

export async function publishPrivateWorker({env,exec=execFileSync,readiness=inspectPrivateStagingResources}){
  const sha=env.GITHUB_SHA;
  if(!env.CLOUDFLARE_FRMS_QA_WORKER_DEPLOY_API_TOKEN)
    fail('FRMS_QA_WORKER_DEPLOY_TOKEN_REQUIRED');
  const secrets=buildPrivateRuntimeSecrets({env,sha});
  await readiness({accountId:env.CLOUDFLARE_ACCOUNT_ID,
    token:env.CLOUDFLARE_FRMS_QA_READ_API_TOKEN});
  const config='ops/frms-qa-repair/wrangler.staging.toml';
  const cf={
    PATH:env.PATH,HOME:env.HOME,CI:'true',
    CLOUDFLARE_ACCOUNT_ID:env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN:env.CLOUDFLARE_FRMS_QA_WORKER_DEPLOY_API_TOKEN,
  };
  const run=(params,input)=>{
    try{
      return exec('node_modules/.bin/wrangler',params,{
        cwd:process.cwd(),env:cf,encoding:'utf8',
        ...(input?{input}:{}),stdio:['pipe','pipe','pipe'],timeout:120000,
      });
    }catch{fail('FRMS_QA_PRIVATE_WORKER_OPERATION_FAILED');}
  };
  // Wrangler's declarative DO migration applies only to this private Worker.
  run(['deploy','--config',config]);
  run(['secret','bulk','--config',config,'--name',EXPECTED.worker],
      JSON.stringify(secrets));
  // Names-only output; never log values.
  const names=JSON.parse(run(['secret','list','--config',config]));
  if(!Array.isArray(names)||!Object.keys(secrets).every(k=>
    names.some(x=>x.name===k)))fail('FRMS_QA_DEPLOYED_WORKER_SECRET_NAMES_MISSING');
  return {result:'PRIVATE_WORKER_DEPLOYED_WITH_SCOPED_SECRETS',
    worker:EXPECTED.worker,caseRepairs:0,mainWorkerTouched:false};
}

function apiClient(token){
  return async path=>{
    const r=await fetch('https://api.github.com/'+path,{
      headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});
    if(!r.ok)fail('FRMS_QA_GITHUB_READ_DENIED');
    return r.json();
  };
}
async function main(){
  try{
    const env=process.env,mode=process.argv[2];
    const text=await readFile(new URL('./wrangler.staging.toml',import.meta.url),'utf8');
    const plan=await authorize({env,configText:text,api:apiClient(env.GITHUB_TOKEN)});
    if(mode==='guard'){console.log('FRMS_QA_F0_ADMIN_SHA_GATES_PROVISION_APPROVED '+plan.phase);return;}
    // Protected environment grants are rechecked in this job immediately
    // before any external API mutation.
    if(mode!==plan.phase)fail('FRMS_QA_PHASE_MODE_MISMATCH');
    let result;
    if(mode==='bucket')result=await createPrivateBucket({
      accountId:env.CLOUDFLARE_ACCOUNT_ID,
      token:env.CLOUDFLARE_FRMS_QA_R2_PROVISION_API_TOKEN,
      readToken:env.CLOUDFLARE_FRMS_QA_READ_API_TOKEN});
    else result=await publishPrivateWorker({env});
    console.log(JSON.stringify(result));
  }catch(err){
    const code=/^FRMS_QA_[A-Z0-9_]+$/.test(err?.message||'')?
      err.message:'FRMS_QA_PROVISION_FAILED_CLOSED';
    console.error(code);process.exitCode=1;
  }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))
  await main();
