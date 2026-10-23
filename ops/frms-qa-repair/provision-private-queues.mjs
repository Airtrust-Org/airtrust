/**
 * FRMS F0 staging-only provisioner for two fixed private Cloudflare Queues.
 * Existing Worker API bearer lives ONLY in the protected Actions runner.
 * No implicit grant from user text, successful GETs, or previous bucket grant.
 * Authorized provisioning never accesses D1 SQL, R2 objects or production.
 */
import {createHash} from 'node:crypto';
import {githubPrepareReadOnlyApi} from './verify-prepare-admin-grant.mjs';
import {TARGET} from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';
const REPO='Airtrust-Org/airtrust',WORKFLOW='.github/workflows/staging-frms-qa-private-queues.yml';
const REF=REPO+'/'+WORKFLOW+'@refs/heads/main';
const SCHEMA='AIRTRUST_FRMS_QA_QUEUE_PROVISION_V1';
const NAMES=Object.freeze(['airtrust-frms-qa-private-prepare-staging',
  'airtrust-frms-qa-private-results-staging']);
const GATES=['lint','build-content-gates','worker-typecheck','frontend-coverage',
  'worker-tests-1','worker-tests-2','lms-smoke','public-e2e'];
const SHA=/^[a-f0-9]{40}$/,HEX32=/^[a-f0-9]{32}$/,HEX64=/^[a-f0-9]{64}$/;
const NUM=/^[1-9][0-9]{0,15}$/,RUN=/^[1-9][0-9]{7,13}$/;
const USER=/^[a-zA-Z0-9-]{1,39}$/;
const fail=()=>{throw Error('FRMS_QA_QUEUE_PROVISION_DENIED');};
const same=(a,b)=>a&&typeof a==='object'&&!Array.isArray(a)&&
  Object.keys(a).sort().join('|')===Object.keys(b).sort().join('|')&&
  Object.entries(b).every(([k,v])=>JSON.stringify(a[k])===JSON.stringify(v));
const digest=value=>createHash('sha256').update(value).digest('hex');

export function exactQueueProvisionPlan({sha,accountId,callerConfig}={}){
  if(!SHA.test(sha||'')||!HEX32.test(accountId||'')||
     typeof callerConfig!=='string'||callerConfig.length<150||
     !callerConfig.includes('workers_dev = false')||
     !callerConfig.includes('preview_urls = false')||
     !NAMES.every(n=>callerConfig.includes(n)))fail();
  return Object.freeze({
    schema:SCHEMA,repository:REPO,coordination_issue:776,frms_issue:1426,
    phase:'queues',release_sha:sha,environment:'staging',
    account_id:accountId,tenant_id:999013,d1_uuid:TARGET.db_id,
    queues:NAMES,caller_worker:'airtrust-frms-qa-caller-staging-private',
    caller_config_sha256:digest(callerConfig),
    credential_mode:'existing_staging_worker_queue_only',
    global_mutex:'airtrust-staging-mutations-and-scorm-qa',
    workflow_path:WORKFLOW,production_authorized:false,
    d1_writes_authorized:0,r2_writes_authorized:0,
    private_worker_deploy_authorized:false,apply_authorized:false,
    max_queue_retention_seconds:900,
    results_http_pull_consumer_authorized:true,
  });
}

/** No Cloudflare operation is possible before a fresh exact admin grant. */
export async function verifyQueueProvisionAdminGrant({
  env={},callerConfig,fetcher=fetch,now=Date.now(),
}={}){
  const sha=env.GITHUB_SHA,grantId=String(env.FRMS_QA_QUEUE_GRANT_ID||''),
    runId=String(env.GITHUB_RUN_ID||''),attempt=Number(env.GITHUB_RUN_ATTEMPT);
  if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_WORKFLOW_REF!==REF||
     env.FRMS_QA_QUEUE_CONFIRM!=='AIRTRUST_FRMS_QA_PRIVATE_QUEUES_ONLY_APPROVED'||
     env.FRMS_QA_QUEUE_EXPECTED_SHA!==sha||!SHA.test(sha||'')||
     !NUM.test(grantId)||!RUN.test(runId)||!Number.isSafeInteger(attempt)||
     attempt<1||!USER.test(env.GITHUB_ACTOR||'')||!Number.isFinite(now)||
     typeof env.GITHUB_TOKEN!=='string'||!env.GITHUB_TOKEN.trim()||
     typeof fetcher!=='function')fail();
  const plan=exactQueueProvisionPlan({sha,accountId:env.CLOUDFLARE_ACCOUNT_ID,
    callerConfig});
  const api=githubPrepareReadOnlyApi({token:env.GITHUB_TOKEN,fetcher});
  let main,run,comment;
  try{
    [main,run,comment]=await Promise.all([
      api('repos/'+REPO+'/branches/main'),
      api('repos/'+REPO+'/actions/runs/'+runId),
      api('repos/'+REPO+'/issues/comments/'+grantId),
    ]);
  }catch{fail();}
  if(main?.commit?.sha!==sha||run?.id!==Number(runId)||
     run?.head_sha!==sha||run?.head_branch!=='main'||
     run?.event!=='workflow_dispatch'||run?.path!==WORKFLOW||
     run?.run_attempt!==attempt||run?.actor?.login!==env.GITHUB_ACTOR||
     !['in_progress','queued','waiting','requested'].includes(run?.status)||
     comment?.id!==Number(grantId)||!USER.test(comment?.user?.login||'')||
     comment?.issue_url!=='https://api.github.com/repos/'+REPO+'/issues/776'||
     comment.created_at!==comment.updated_at||
     typeof comment.body!=='string'||
     !comment.body.startsWith(SCHEMA+'\n'))fail();
  const age=now-Date.parse(comment.created_at);
  if(!Number.isFinite(age)||age<0||age>2*3600000)fail();
  let supplied;
  try{supplied=JSON.parse(comment.body.slice((SCHEMA+'\n').length));}catch{fail();}
  if(!same(supplied,plan))fail();
  const admins=[...new Set([comment.user.login,env.GITHUB_ACTOR])];
  let responses;
  try{
    responses=await Promise.all([
      ...admins.map(u=>api('repos/'+REPO+'/collaborators/'+u+'/permission')),
      ...GATES.map(name=>api('repos/'+REPO+'/commits/'+sha+
        '/check-runs?check_name='+encodeURIComponent(name)+'&filter=latest&per_page=100')),
    ]);
  }catch{fail();}
  if(!responses.slice(0,admins.length).every(p=>p?.permission==='admin')||
     !responses.slice(admins.length).every((g,i)=>
       Array.isArray(g?.check_runs)&&g.check_runs.some(c=>c.name===GATES[i]&&
         c.head_sha===sha&&c.status==='completed'&&
         c.conclusion==='success'&&c.app?.slug==='github-actions')))fail();
  return Object.freeze({status:'QUEUE_PROVISION_ADMIN_GRANT_VERIFIED',
    sha,accountId:env.CLOUDFLARE_ACCOUNT_ID,grantId,runId});
}

/** Only two fixed queue names. Existing names are never overwritten. */
export async function ensurePrivateQueues({accountId,token,fetcher=fetch}={}){
  if(!HEX32.test(accountId||'')||typeof token!=='string'||!token.trim()||
     typeof fetcher!=='function')fail();
  const origin='https://api.cloudflare.com/client/v4/accounts/'+accountId+'/queues';
  const call=async(method,path,payload)=>{
    let response,doc;
    try{
      response=await fetcher(origin+path,{method,redirect:'manual',
        headers:{Authorization:'Bearer '+token,Accept:'application/json',
          ...(payload?{'Content-Type':'application/json'}:{})},
        ...(payload?{body:JSON.stringify(payload)}:{}),
        signal:AbortSignal.timeout(15000)});
      if(response?.status!==200||response.redirected===true)fail();
      doc=await response.json();
    }catch{fail();}
    if(doc?.success!==true||doc.result===undefined)fail();
    return doc;
  };
  // Existing Queues are not changed. A newly created Queue is configured
  // before any Worker can publish messages to it. No public HTTP Worker route.
  const inspect=async id=>{
    if(!HEX32.test(id||''))fail();
    const doc=await call('GET','/'+id);
    const q=doc.result;
    if(!q||typeof q!=='object'||q.queue_id!==id||
       typeof q.queue_name!=='string')fail();
    return q;
  };
  const inventory=async()=>{
    const result=await call('GET','?per_page=100');
    if(!Array.isArray(result.result)||result.result.length>100||
       result.result_info?.total_count>100||
       result.result.some(q=>!q||typeof q.queue_name!=='string'))fail();
    const map=new Map();
    for(const item of result.result){
      if(map.has(item.queue_name))fail();
      map.set(item.queue_name,item);
    }
    return map;
  };
  let existing=await inventory();
  let creates=0,retentionWrites=0,httpPullWrites=0;
  for(const name of NAMES){
    const before=existing.get(name);
    let id=before?.queue_id;
    let newlyCreated=false;
    if(!before){
      const created=await call('POST','',{queue_name:name});
      id=created.result?.queue_id;
      if(created.result?.queue_name!==name||!HEX32.test(id||''))fail();
      creates++;
      newlyCreated=true;
    }
    // A Queue already in use by another executor must never be rewritten.
    // Cloudflare PUT is a full replacement, so only freshly-created Queues
    // can have their retention policy set by this F0 operation.
    if(newlyCreated){
      const cfg=await call('PUT','/'+id,{
        queue_name:name,settings:{
          delivery_delay:0,delivery_paused:false,message_retention_period:900,
        },
      });
      if(cfg.result?.queue_name!==name)fail();
      retentionWrites++;
    }
    let current=await inspect(id);
    if(current.queue_name!==name||
       !Number.isInteger(current.settings?.message_retention_period)||
       current.settings.message_retention_period<60||
       current.settings.message_retention_period>900)fail();
    if(name===NAMES[1]){
      if(!Array.isArray(current.consumers))fail();
      if(current.consumers.length===0){
        const response=await call('POST','/'+id+'/consumers',{
          type:'http_pull',settings:{
            batch_size:1,visibility_timeout_ms:30000,max_retries:1,
          },
        });
        if(response.result?.type!=='http_pull'||
           response.result.queue_name!==name)fail();
        httpPullWrites++;
        current=await inspect(id);
      }
      if(current.consumers?.length!==1||
         current.consumers[0]?.type!=='http_pull'||
         current.consumers[0]?.queue_name!==name||
         current.consumers[0]?.settings?.batch_size!==1||
         current.consumers[0]?.settings?.visibility_timeout_ms!==30000)
        fail();
    }else if(current.consumers?.length)fail();
  }
  existing=await inventory();
  if(!NAMES.every(name=>existing.has(name)))fail();
  return Object.freeze({verdict:'PRIVATE_STAGING_QUEUES_AND_PULL_METADATA_VERIFIED',
    queueNamesPresent:2,queueNamesExpected:2,queuesCreated:creates,
    retentionUpdates:retentionWrites,httpPullCreated:httpPullWrites,
    maxQueueRetentionSeconds:900,
    d1Writes:0,r2Writes:0,workerDeploys:0,productionWrites:0,
    queueHttpPullConfigured:true});
}
