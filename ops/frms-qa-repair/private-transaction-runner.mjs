/**
 * Protected Actions transaction composition. Inactive until invoked by the
 * exact staging transaction workflow with a separate signer and readback.
 * No token generation, private signing key, automatic grant, or deploy.
 */
import {createTrustedQueuePrepareMessage,
  createTrustedQueueApplyMessage} from './queue-prepare-transport.mjs';
import {privateQueueRunnerApi} from './queue-runner-api.mjs';
import {coordinatePrivateF0Transaction} from './private-transaction-controller.mjs';

const ACCOUNT=/^[a-f0-9]{32}$/,QUEUE=/^[a-f0-9]{32}$/;
const SHA=/^[a-f0-9]{40}$/,KEY=/^[a-f0-9]{64}$/;
const PREPARE='airtrust-frms-qa-private-prepare-staging';
const RESULTS='airtrust-frms-qa-private-results-staging';
const deny=()=>{throw Error('FRMS_QA_TRANSACTION_RUNNER_DENIED');};

/** GET only; never accept queue IDs from workflow_dispatch inputs. */
export async function resolvePrivateTransactionQueues({
  accountId,token,fetcher=fetch,
}={}){
  if(!ACCOUNT.test(accountId||'')||typeof token!=='string'||!token.trim()||
     typeof fetcher!=='function')deny();
  let data,response;
  try{
    response=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+
      accountId+'/queues?per_page=100',{
      method:'GET',redirect:'manual',
      headers:{Authorization:'Bearer '+token,Accept:'application/json'},
      signal:AbortSignal.timeout(15000),
    });
    if(response?.status!==200||response.redirected===true)deny();
    data=await response.json();
  }catch{deny();}
  if(data?.success!==true||!Array.isArray(data.result)||
     data.result.length>100||data.result_info?.total_count>100)deny();
  const found=new Map();
  for(const item of data.result){
    if(!item||typeof item.queue_name!=='string')deny();
    if(item.queue_name===PREPARE||item.queue_name===RESULTS){
      if(found.has(item.queue_name)||!QUEUE.test(item.queue_id||''))deny();
      found.set(item.queue_name,item.queue_id);
    }
  }
  if(found.size!==2||found.get(PREPARE)===found.get(RESULTS))deny();
  // The list alone is not evidence of a configured private consumer. Inspect
  // both queue resources via fixed IDs before any signed message can be sent.
  const inspect=async name=>{
    let res,body;
    try{
      res=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+
        accountId+'/queues/'+found.get(name),{
        method:'GET',redirect:'manual',
        headers:{Authorization:'Bearer '+token,Accept:'application/json'},
        signal:AbortSignal.timeout(15000),
      });
      if(res?.status!==200||res.redirected===true)deny();
      body=await res.json();
    }catch{deny();}
    const q=body?.result;
    if(body?.success!==true||q?.queue_id!==found.get(name)||
       q?.queue_name!==name||
       !Number.isInteger(q.settings?.message_retention_period)||
       q.settings.message_retention_period<60||
       q.settings.message_retention_period>900||
       !Array.isArray(q.consumers)||q.consumers.length!==1)deny();
    const consumer=q.consumers[0];
    if(consumer.queue_name!==name||
       (name===PREPARE?
         consumer.type!=='worker'||
           consumer.script_name!=='airtrust-frms-qa-caller-staging-private'||
           consumer.settings?.batch_size!==1:
         consumer.type!=='http_pull'||consumer.settings?.batch_size!==1||
           consumer.settings?.visibility_timeout_ms!==30000))deny();
  };
  await inspect(PREPARE);
  await inspect(RESULTS);
  return Object.freeze({prepareQueueId:found.get(PREPARE),
    resultsQueueId:found.get(RESULTS),namesPinned:true,
    privateConsumersVerified:true});
}

/**
 * Composes the real private queues but cannot run without independent signer
 * and read-only verifier injection, and only the protected GitHub transaction
 * workflow can satisfy the controller's workflow/branch/SHA checks.
 */
export async function runProtectedPrivateTransaction({
  env={},signer,readback,fetcher=fetch,
  now=Date.now,sleep=async()=>new Promise(resolve=>setTimeout(resolve,1000)),
}={}){
  const key=env.FRMS_QA_CALLER_KEY_HEX,sha=env.GITHUB_SHA,
    accountId=env.CLOUDFLARE_ACCOUNT_ID,
    token=env.CLOUDFLARE_WORKER_API_TOKEN;
  if(!SHA.test(sha||'')||!ACCOUNT.test(accountId||'')||
     !KEY.test(key||'')||typeof token!=='string'||!token.trim()||
     typeof env.GITHUB_TOKEN!=='string'||!env.GITHUB_TOKEN.trim()||
     typeof signer?.assertReady!=='function'||
     typeof signer?.signReceipt!=='function'||
     typeof readback!=='function'||typeof fetcher!=='function'||
     typeof now!=='function'||typeof sleep!=='function'||
     // This runner never stores a signing private key or D1 bearer.
     env.FRMS_QA_APPROVAL_PRIVATE_KEY_PEM||env.FRMS_QA_D1_READ_TOKEN)deny();
  const pinned=await resolvePrivateTransactionQueues({
    accountId,token,fetcher});
  const outbound=privateQueueRunnerApi({
    accountId,queueId:pinned.prepareQueueId,releaseSha:sha,
    keyHex:key,token,fetcher});
  const inbound=privateQueueRunnerApi({
    accountId,queueId:pinned.resultsQueueId,releaseSha:sha,
    keyHex:key,token,fetcher});
  const producer=Object.freeze({
    prepare:()=>createTrustedQueuePrepareMessage({env,fetcher,now:now()}),
    apply:({manifest,receiptId,signatureBase64,applyGrantId})=>
      createTrustedQueueApplyMessage({env:{...env,
        FRMS_QA_APPLY_GRANT_ID:applyGrantId},
        manifest,receiptId,signatureBase64,fetcher,now:now()}),
  });
  const transport=Object.freeze({
    pushSigned:message=>outbound.pushSigned(message),
    consumeExpectedReply:params=>inbound.consumeExpectedReply(params),
  });
  return coordinatePrivateF0Transaction({env,
    publicKeyPem:env.FRMS_QA_APPROVAL_PUBLIC_KEY_PEM,
    publicKeySha256:env.FRMS_QA_APPROVAL_PUBLIC_KEY_SHA256,
    producer,queue:transport,signer,readback,now,sleep,maxPolls:12});
}
