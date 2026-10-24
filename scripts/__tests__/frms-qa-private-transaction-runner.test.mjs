// Synthetic GET-only private Queue resolution; no live queue messages or
// bypass of security-restricted Queue REST consumer test execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePrivateTransactionQueues,runProtectedPrivateTransaction,
  buildApplyGrantVerificationEnv} from
  '../../ops/frms-qa-repair/private-transaction-runner.mjs';

const ACCOUNT='a'.repeat(32),TOKEN='synthetic-existing-worker-token';
const PREPARE='airtrust-frms-qa-private-prepare-staging';
const RESULTS='airtrust-frms-qa-private-results-staging';
const P='1'.repeat(32),R='2'.repeat(32);
function source({queues=[
  {queue_name:PREPARE,queue_id:P},
  {queue_name:RESULTS,queue_id:R},
],status=200,success=true,redirected=false,total=queues.length,
  badConsumer=false,longRetention=false}={}){
  const calls=[];
  const base='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/queues';
  const fetcher=async(uri,request)=>{
    calls.push(uri);
    assert.equal(request.method,'GET');
    assert.equal(request.redirect,'manual');
    assert.equal(request.headers.Authorization,'Bearer '+TOKEN);
    if(uri===base+'?per_page=100')
      return {status,redirected,json:async()=>({success,result:queues,
        result_info:{total_count:total}})};
    const item=queues.find(q=>uri===base+'/'+q.queue_id);
    assert.ok(item,'No arbitrary Cloudflare endpoint');
    return {status,redirected,json:async()=>({success,result:{
      ...item,settings:{message_retention_period:longRetention?345600:900},
      consumers:[item.queue_name===PREPARE?{
        queue_name:PREPARE,type:'worker',
        script_name:badConsumer?'untrusted-worker':
          'airtrust-frms-qa-caller-staging-private',
        settings:{batch_size:1},
      }:{
        queue_name:RESULTS,type:badConsumer?'worker':'http_pull',
        settings:{batch_size:1,visibility_timeout_ms:30000},
      }],
    }})};
  };
  return {calls,fetcher};
}
test('pin exactly two distinct private queue IDs from GET-only inventory',async()=>{
  const f=source(),resolved=await resolvePrivateTransactionQueues({
    accountId:ACCOUNT,token:TOKEN,fetcher:f.fetcher});
  assert.deepEqual(resolved,{prepareQueueId:P,resultsQueueId:R,
    namesPinned:true,privateConsumersVerified:true});
  assert.equal(f.calls.length,3);
  assert.equal(Object.isFrozen(resolved),true);
  assert.equal(JSON.stringify(resolved).includes(TOKEN),false);
  assert.equal(JSON.stringify(resolved).includes(ACCOUNT),false);
});
test('missing, duplicate, swapped, malformed or ambiguous queues fail closed',async()=>{
  for(const queues of [
    [],[{queue_name:PREPARE,queue_id:P}],
    [{queue_name:RESULTS,queue_id:R}],
    [{queue_name:PREPARE,queue_id:P},{queue_name:RESULTS,queue_id:P}],
    [{queue_name:PREPARE,queue_id:'bad'},{queue_name:RESULTS,queue_id:R}],
    [{queue_name:PREPARE,queue_id:P},{queue_name:PREPARE,queue_id:R},
      {queue_name:RESULTS,queue_id:'3'.repeat(32)}],
    [null],
  ]){
    const f=source({queues});
    await assert.rejects(resolvePrivateTransactionQueues({
      accountId:ACCOUNT,token:TOKEN,fetcher:f.fetcher}),
    /FRMS_QA_TRANSACTION_RUNNER_DENIED/);
  }
});
test('wrong private consumer or retention blocks before publishing',async()=>{
  for(const opts of [{badConsumer:true},{longRetention:true}]){
    const f=source(opts);
    await assert.rejects(resolvePrivateTransactionQueues({
      accountId:ACCOUNT,token:TOKEN,fetcher:f.fetcher}),
    /FRMS_QA_TRANSACTION_RUNNER_DENIED/);
    assert.ok(f.calls.length<=3);
  }
});
test('transport or token failures cannot emit a private queue message',async()=>{
  for(const opts of [{status:403},{status:302,redirected:true},{success:false},
    {total:101}]){
    const f=source(opts);
    await assert.rejects(resolvePrivateTransactionQueues({
      accountId:ACCOUNT,token:TOKEN,fetcher:f.fetcher}),
    /FRMS_QA_TRANSACTION_RUNNER_DENIED/);
  }
  await assert.rejects(resolvePrivateTransactionQueues({
    accountId:ACCOUNT,token:''}),/FRMS_QA_TRANSACTION_RUNNER_DENIED/);
});
test('no external signer or public Ed25519 key can start transaction',async()=>{
  const f=source();
  const env={
    GITHUB_SHA:'b'.repeat(40),GITHUB_TOKEN:'synthetic-github',
    CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CLOUDFLARE_WORKER_API_TOKEN:TOKEN,
    FRMS_QA_CALLER_KEY_HEX:'c'.repeat(64),
  };
  for(const extra of [
    {},
    {signer:{assertReady:async()=>({})}},
    {signer:{signReceipt:async()=>({})}},
    {signer:{assertReady:async()=>({}),signReceipt:async()=>({})}},
    {signer:{assertReady:async()=>({}),signReceipt:async()=>({})},
      readback:async()=>({}),env:{...env,FRMS_QA_D1_READ_TOKEN:'forbidden'}},
  ]){
    await assert.rejects(runProtectedPrivateTransaction({
      env,fetcher:f.fetcher,...extra}),/FRMS_QA_TRANSACTION_RUNNER_DENIED/);
  }
  assert.equal(f.calls.length,0);
});

test('apply phase binds fresh signer grant to current SHA without granting writes',()=>{
  const sha='b'.repeat(40),grantId='6374255192';
  const base={GITHUB_SHA:sha,GITHUB_TOKEN:'synthetic-github'};
  const scoped=buildApplyGrantVerificationEnv({env:base,applyGrantId:grantId});
  assert.equal(scoped.FRMS_QA_APPLY_GRANT_ID,grantId);
  assert.equal(scoped.FRMS_QA_APPLY_EXPECTED_SHA,sha);
  assert.equal(scoped.FRMS_QA_APPLY_CONFIRM,'AIRTRUST_FRMS_QA_APPLY_F0_APPROVED');
  assert.equal(scoped.GITHUB_TOKEN,base.GITHUB_TOKEN);
  assert.equal(base.FRMS_QA_APPLY_CONFIRM,undefined);
  assert.equal(Object.isFrozen(scoped),true);
  // A phase marker is not a grant: the downstream verifier still performs
  // authenticated GitHub GET checks before emitting the apply Queue message.
  for(const bad of [
    {env:base,applyGrantId:'not-a-comment'},
    {env:{...base,GITHUB_SHA:'invalid'},applyGrantId:grantId},
    {env:{...base,FRMS_QA_APPLY_GRANT_ID:'6374255191'},applyGrantId:grantId},
    {env:{...base,FRMS_QA_APPLY_CONFIRM:'AIRTRUST_FRMS_QA_APPLY_F0_APPROVED'},applyGrantId:grantId},
    {env:{...base,FRMS_QA_APPLY_EXPECTED_SHA:sha},applyGrantId:grantId},
    {env:null,applyGrantId:grantId},
  ]) assert.throws(()=>buildApplyGrantVerificationEnv(bad),
    /FRMS_QA_TRANSACTION_RUNNER_DENIED/);
});
