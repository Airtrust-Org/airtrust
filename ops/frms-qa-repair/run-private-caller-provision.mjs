#!/usr/bin/env node
/**
 * F0 staging-only private Caller deployment.
 * A single protected Actions step owns grant verification, Cloudflare GET
 * preflight, private deployment, secret install and secret-name readback.
 * Never log OAuth/bearer tokens, HMAC keys, signatures or provider responses.
 * A partial deployment is quarantined for reconciliation, not retried.
 */
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash,createPublicKey} from 'node:crypto';
import {verifyCallerProvisionAdminGrant,buildCallerRuntimeSecrets}
  from './provision-private-caller.mjs';
import {ensurePrivateQueues} from './provision-private-queues.mjs';
import {inspectPrivateStagingResources} from './verify-readiness.mjs';

const CFG='ops/frms-qa-repair/wrangler.caller.staging.toml';
const REPAIR='airtrust-frms-qa-repair-staging-private';
const CALLER='airtrust-frms-qa-caller-staging-private';
const SHA=/^[0-9a-f]{40}$/;
const HASH=/^[0-9a-f]{64}$/;
const deny=()=>{throw Error('FRMS_QA_CALLER_DEPLOY_DENIED');};
let phase='PRECONDITIONS';

function run(args,{input}={}){
  const p=spawnSync('npx',['wrangler',...args],{
    encoding:'utf8',input,
    env:process.env,maxBuffer:1024*1024,timeout:120000,
    stdio:['pipe','pipe','pipe'],
  });
  if(p.status!==0||p.error)deny();
  return p.stdout;
}
async function get(accountId,token,script){
  const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+
    accountId+'/workers/scripts/'+script+'/settings',{
    method:'GET',redirect:'manual',
    headers:{Authorization:'Bearer '+token,Accept:'application/json'},
    signal:AbortSignal.timeout(15000),
  });
  if(res.redirected)deny();
  // A missing private Caller can be created; never overwrite another deployment.
  if(script===CALLER && res.status===404)return 'ABSENT';
  if(res.status!==200)deny();
  const doc=await res.json();
  if(doc?.success!==true||!doc.result)deny();
  return 'PRESENT';
}
function assertSignerPin(env){
  if(!HASH.test(env.FRMS_QA_APPROVAL_PUBLIC_KEY_SHA256||'')||
     !HASH.test(env.FRMS_QA_SIGNER_ORIGIN_SHA256||'')||
     !env.FRMS_QA_APPROVAL_PUBLIC_KEY_PEM||!env.FRMS_QA_SIGNER_ORIGIN)
    deny();
  let k,u;
  try{k=createPublicKey(env.FRMS_QA_APPROVAL_PUBLIC_KEY_PEM);
    u=new URL(env.FRMS_QA_SIGNER_ORIGIN);}catch{deny();}
  if(k.asymmetricKeyType!=='ed25519'||
     createHash('sha256').update(k.export({format:'der',type:'spki'}))
       .digest('hex')!==env.FRMS_QA_APPROVAL_PUBLIC_KEY_SHA256||
     u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||
     u.search||u.hash||u.hostname==='localhost'||
     u.hostname.endsWith('.local')||u.hostname.endsWith('.internal')||
     /^\d{1,3}(?:\.\d{1,3}){3}$/.test(u.hostname)||
     createHash('sha256').update(u.origin).digest('hex')!==
       env.FRMS_QA_SIGNER_ORIGIN_SHA256)
    deny();
}
async function main(){
  const env=process.env;
  if(process.argv.length!==2||!SHA.test(env.GITHUB_SHA||'')||
     env.GITHUB_JOB!=='provision-private-caller'||
     !/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID||'')||
     !env.CLOUDFLARE_API_TOKEN||env.CLOUDFLARE_D1_MIGRATION_API_TOKEN||
     env.FRMS_QA_APPROVAL_PRIVATE_KEY_PEM||env.FRMS_QA_D1_READ_TOKEN)
    deny();
  const cfg=await readFile(CFG,'utf8');
  const verified=await verifyCallerProvisionAdminGrant({env,callerConfig:cfg});
  if(verified.status!=='CALLER_PROVISION_ADMIN_GRANT_VERIFIED'||
     verified.sha!==env.GITHUB_SHA)deny();
  assertSignerPin(env);
  const secrets=buildCallerRuntimeSecrets({env,sha:env.GITHUB_SHA});
  const getOnly=async(url,options)=>{
    if(options?.method!=='GET')deny();
    return fetch(url,options);
  };
  phase='REMOTE_READONLY_PREFLIGHT';
  await inspectPrivateStagingResources({
    accountId:verified.accountId,token:env.CLOUDFLARE_API_TOKEN,
    fetcher:getOnly,
  });
  const queue=await ensurePrivateQueues({
    accountId:verified.accountId,token:env.CLOUDFLARE_API_TOKEN,
    fetcher:getOnly,
  });
  if(queue.queuesCreated!==0||queue.retentionUpdates!==0||
     queue.httpPullCreated!==0||queue.queueNamesPresent!==2)deny();
  if(await get(verified.accountId,env.CLOUDFLARE_API_TOKEN,REPAIR)!=='PRESENT')
    deny();
  if(await get(verified.accountId,env.CLOUDFLARE_API_TOKEN,CALLER)!=='ABSENT')
    deny();
  phase='PRIVATE_DEPLOY';
  run(['deploy','--config',CFG]);
  phase='SECRET_BINDING';
  run(['secret','bulk','--config',CFG],{
    input:JSON.stringify({
      CALLER_KEY_HEX:secrets.CALLER_KEY_HEX,
      CALLER_KEY_SHA256:secrets.CALLER_KEY_SHA256,
      RELEASE_SHA:secrets.RELEASE_SHA,
    }),
  });
  phase='POST_DEPLOY_READBACK';
  const list=JSON.parse(run(['secret','list','--config',CFG,'--format','json']));
  if(!Array.isArray(list)||
     !['CALLER_KEY_HEX','CALLER_KEY_SHA256','RELEASE_SHA'].every(name=>
       list.some(item=>item.name===name)))deny();
  if(await get(verified.accountId,env.CLOUDFLARE_API_TOKEN,CALLER)!=='PRESENT')
    deny();
  console.log(JSON.stringify({verdict:'FRMS_QA_PRIVATE_CALLER_DEPLOYED_WITH_KEYS',
    sha:verified.sha,tenantId:999013,privateWorker:CALLER,
    d1Writes:0,r2Writes:0,applyAuthorized:false,productionAuthorized:false}));
}
try{await main();}catch{
  console.error('FRMS_QA_CALLER_PROVISION_FAILED_CLOSED_PHASE_'+phase);
  if(phase!=='PRECONDITIONS'&&phase!=='REMOTE_READONLY_PREFLIGHT')
    console.error('FRMS_QA_CALLER_PARTIAL_DEPLOYMENT_RECONCILIATION_REQUIRED');
  process.exitCode=1;
}
