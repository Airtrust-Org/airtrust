// Synthetic Cloudflare Queues REST boundary. No account/token/Queue network use.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,createCipheriv,randomBytes} from 'node:crypto';
import {privateQueueRunnerApi} from '../../ops/frms-qa-repair/queue-runner-api.mjs';

const ACCOUNT='a'.repeat(32),QUEUE='b'.repeat(32),KEY='c'.repeat(64);
const DB='bf9963f4-eb12-439b-a830-20bbf577ac22',SHA='d'.repeat(40);
const TOKEN='synthetic-pull-ack-credential-never-log',RUN='40019815631';
const GRANT='6374255192',NONCE='e'.repeat(64),NOW=Date.parse('2026-10-23T20:00:00Z');
const LEASE='lease-'+ 'L'.repeat(36);
const URL='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+
  '/queues/'+QUEUE+'/messages';
const expected={operation:'prepare',sha:SHA,runId:RUN,runAttempt:1,
  grantId:GRANT,requestNonce:NONCE};
const receipt={environment:'staging',dbId:DB,tenantId:999013,writes:0,
  preimageSha256:'1'.repeat(64),artifactSha256:'2'.repeat(64),
  recoveryBookmark:'private-bookmark-no-logs'};
const digest=s=>createHash('sha256').update(s).digest('hex');
const mac=b=>createHmac('sha256',Buffer.from(KEY,'hex'))
  .update(JSON.stringify(b)).digest('hex');
function reply(change={}){
  const payload={receiptId:digest(JSON.stringify(receipt)),receipt};
  const iv=randomBytes(12);
  const key=createHmac('sha256',Buffer.from(KEY,'hex'))
    .update('AIRTRUST_FRMS_QA_QUEUE_PAYLOAD_AES_GCM_V1').digest();
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(payload)),cipher.final()]);
  const body={schema:'AIRTRUST_FRMS_QA_PRIVATE_REPLY_V1',
    operation:'prepare',sha:SHA,grantId:GRANT,runId:RUN,runAttempt:1,
    requestNonce:NONCE,issuedAt:new Date(NOW).toISOString(),
    expiresAt:new Date(NOW+90000).toISOString(),
    payloadEnvelope:{version:1,iv:iv.toString('base64'),
      ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')},
    ...change};
  return {...body,mac:mac(body)};
}
function fixture({body=reply(),failPath='',failStatus=403,ackCount=1,
  malformed=false}={}){
  const calls=[];
  const fetcher=async(uri,opts)=>{
    assert.ok(uri.startsWith(URL));
    assert.equal(opts.method,'POST');
    assert.equal(opts.redirect,'manual');
    assert.equal(opts.headers.Authorization,'Bearer '+TOKEN);
    const path=uri.slice(URL.length),request=JSON.parse(opts.body);
    calls.push({path,body:request});
    if(path===failPath)return Response.json({success:false},{status:failStatus});
    if(path==='/pull')return Response.json({success:true,result:{
      messages:[{lease_id:LEASE,body:malformed?'not-base64':
        Buffer.from(JSON.stringify(body),'utf8').toString('base64')}]}});
    if(path==='/ack')return Response.json({success:true,result:{
      ackCount,retryCount:0,warnings:{}}});
    if(path==='')return Response.json({success:true,result:{metadata:{}}});
    throw Error('UNEXPECTED_QUEUE_API_ACTION');
  };
  return {calls,fetcher};
}
test('refuses missing, wrong or unbounded Queue credentials and IDs',()=>{
  for(const bad of [
    {},{accountId:ACCOUNT,queueId:'not-an-id',token:TOKEN},
    {accountId:'wrong',queueId:QUEUE,releaseSha:SHA,token:TOKEN},
    {accountId:ACCOUNT,queueId:QUEUE,releaseSha:SHA,token:''},
  ])assert.throws(()=>privateQueueRunnerApi(bad),/FRMS_QA_QUEUE_RUNNER_API_DENIED/);
});
test('protected runner pushes one pinned encrypted request with no generic API methods',async()=>{
  const f=fixture();
  const api=privateQueueRunnerApi({accountId:ACCOUNT,queueId:QUEUE,releaseSha:SHA,
    token:TOKEN,fetcher:f.fetcher});
  const request={schema:'AIRTRUST_FRMS_QA_QUEUE_PREPARE_V1',
    sha:SHA,dbId:DB,tenantId:999013,mac:'f'.repeat(64),
    payloadEnvelope:{version:1,ciphertext:'opaque'}};
  assert.equal((await api.pushSigned(request)).queued,true);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].path,'');
  assert.deepEqual(f.calls[0].body,{body:request,content_type:'json'});
  assert.equal(api.ackVerified,undefined);
  assert.equal(api.delete,undefined);
  assert.equal(api.purge,undefined);
  assert.equal(JSON.stringify(f.calls).includes(TOKEN),false);
  for(const invalid of [{...request,tenantId:6},{...request,dbId:'wrong'},
    {...request,sha:'0'.repeat(40)},{...request,mac:''}]){
    await assert.rejects(api.pushSigned(invalid),/FRMS_QA_QUEUE_RUNNER_API_DENIED/);
  }
  assert.equal(f.calls.length,1);
});
test('only authenticated correlated reply is acknowledged; plaintext never sent back',async()=>{
  const f=fixture();
  const api=privateQueueRunnerApi({accountId:ACCOUNT,queueId:QUEUE,releaseSha:SHA,
    token:TOKEN,fetcher:f.fetcher});
  const outcome=await api.consumeExpectedReply({keyHex:KEY,expected,now:NOW});
  assert.equal(outcome.receipt.recoveryBookmark,'private-bookmark-no-logs');
  assert.deepEqual(f.calls.map(c=>c.path),['/pull','/ack']);
  assert.deepEqual(f.calls[0].body,{batch_size:1,visibility_timeout_ms:30000});
  assert.deepEqual(f.calls[1].body,{acks:[{lease_id:LEASE}],retries:[]});
  assert.equal(JSON.stringify(f.calls).includes('private-bookmark-no-logs'),false);
});
test('wrong grant, run, operation or expired reply leaves lease unacknowledged',async()=>{
  for(const override of [{grantId:'1'.repeat(10)},{operation:'apply'},
    {requestNonce:'0'.repeat(64)}]){
    const f=fixture(),api=privateQueueRunnerApi({accountId:ACCOUNT,
      queueId:QUEUE,releaseSha:SHA,token:TOKEN,fetcher:f.fetcher});
    await assert.rejects(api.consumeExpectedReply({keyHex:KEY,
      expected:{...expected,...override},now:NOW}),
      /FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
    assert.deepEqual(f.calls.map(c=>c.path),['/pull']);
  }
  const f=fixture(),api=privateQueueRunnerApi({accountId:ACCOUNT,
    queueId:QUEUE,releaseSha:SHA,token:TOKEN,fetcher:f.fetcher});
  await assert.rejects(api.consumeExpectedReply({keyHex:KEY,
    expected,now:NOW+90001}),/FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
  assert.equal(f.calls.length,1);
});
test('invalid response, malformed body and failed ack are sanitized and fail closed',async()=>{
  for(const setup of [{failPath:'/pull'},{malformed:true},{ackCount:0}]){
    const f=fixture(setup),api=privateQueueRunnerApi({accountId:ACCOUNT,
      queueId:QUEUE,releaseSha:SHA,token:TOKEN,fetcher:f.fetcher});
    await assert.rejects(api.consumeExpectedReply({keyHex:KEY,
      expected,now:NOW}),/FRMS_QA_QUEUE_RUNNER_API_DENIED/);
  }
});
test('malformed Base64 and raw JSON are rejected before receipt acknowledgement',async()=>{
  for(const body of ['e30', 'e30===', JSON.stringify(reply()),
    Buffer.from(JSON.stringify(reply()),'utf8').toString('base64').slice(0,-2)+'$']){
    const f=fixture({body}),api=privateQueueRunnerApi({accountId:ACCOUNT,
      queueId:QUEUE,releaseSha:SHA,token:TOKEN,fetcher:f.fetcher});
    await assert.rejects(api.consumeExpectedReply({keyHex:KEY,expected,now:NOW}),
      /FRMS_QA_QUEUE_RUNNER_API_DENIED/);
    assert.deepEqual(f.calls.map(x=>x.path),['/pull']);
  }
});
test('empty Queue is not treated as a receipt or as physical staging acceptance',async()=>{
  const calls=[];
  const api=privateQueueRunnerApi({accountId:ACCOUNT,queueId:QUEUE,releaseSha:SHA,token:TOKEN,
    fetcher:async(u,o)=>{calls.push(u);return Response.json({
      success:true,result:{messages:[]}});}});
  assert.equal(await api.consumeExpectedReply({keyHex:KEY,expected,now:NOW}),null);
  assert.equal(calls.length,1);
});
