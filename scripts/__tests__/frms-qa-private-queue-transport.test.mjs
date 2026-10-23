// Fully synthetic Cloudflare Queue contract; never contacts real GitHub or D1/R2.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createTrustedQueuePrepareMessage,consumeTrustedQueuePrepare,
  createTrustedQueueApplyMessage,consumeTrustedQueueApply,
  verifyPrivateQueueReply} from
  '../../ops/frms-qa-repair/queue-prepare-transport.mjs';
import {exactPreparePlan} from '../../ops/frms-qa-repair/verify-prepare-admin-grant.mjs';
import {exactApplyGrantPlan} from '../../ops/frms-qa-repair/verify-apply-admin-grant.mjs';
import {buildReviewPlan} from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';
import {durableCoordinator} from '../../ops/frms-qa-repair/adapters.mjs';

const SHA='b'.repeat(40),KEY='a'.repeat(64),GRANT='6374255192',
  RUN='40019815631',TOKEN='fixture-only-never-forward';
const REPO='Airtrust-Org/airtrust';
const WORKFLOW='.github/workflows/staging-frms-qa-private-prepare.yml';
const APPLY_WORKFLOW='.github/workflows/staging-frms-qa-private-transaction.yml';
const SIGNATURE=Buffer.alloc(64,7).toString('base64');
const REVIEWED_IDS=buildReviewPlan(Array.from({length:30},(_,i)=>({
  day:new Date(Date.parse('2026-09-14T00:00:00Z')+i*86400000).toISOString().slice(0,10),
  jornadas:i===29?'0':'5-9'}))).operations.map(op=>op.id);
const DB='bf9963f4-eb12-439b-a830-20bbf577ac22';
const env={
  GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:REPO,
  GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',
  GITHUB_SHA:SHA,GITHUB_RUN_ID:RUN,GITHUB_RUN_ATTEMPT:'1',
  GITHUB_ACTOR:'f0-admin',GITHUB_WORKFLOW_REF:REPO+'/'+WORKFLOW+'@refs/heads/main',
  FRMS_QA_PREPARE_CONFIRM:'AIRTRUST_FRMS_QA_PREPARE_ONLY_F0_APPROVED',
  FRMS_QA_PREPARE_EXPECTED_SHA:SHA,FRMS_QA_PREPARE_GRANT_ID:GRANT,
  GITHUB_TOKEN:TOKEN,FRMS_QA_CALLER_KEY_HEX:KEY,
  CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),
  CLOUDFLARE_WORKER_API_TOKEN:'fixture-cloudflare-get-only-token',
};
const runtime={
  ENVIRONMENT:'staging',D1_ID:DB,RELEASE_SHA:SHA,
  CALLER_KEY_HEX:KEY,CALLER_KEY_SHA256:
    createHash('sha256').update(Buffer.from(KEY,'hex')).digest('hex'),
};
const clock=Date.now();
function fixture(change={},phase='prepare'){
  const applying=phase==='apply';
  const workflow=applying?APPLY_WORKFLOW:WORKFLOW;
  let requests=[];
  const stamp=new Date(clock-1000).toISOString();
  const plan=applying?exactApplyGrantPlan({sha:SHA,manifest:manifest(),
    receiptId:'5'.repeat(64),signatureBase64:SIGNATURE}):exactPreparePlan({sha:SHA});
  const fetcher=async(uri,options)=>{
    requests.push(uri);
    assert.equal(options.method,'GET');
    const parsed=new URL(uri),path=parsed.pathname;
    assert.equal(options.headers.Authorization,'Bearer '+
      (parsed.hostname==='api.cloudflare.com'?
        env.CLOUDFLARE_WORKER_API_TOKEN:TOKEN));
    if(path.endsWith('/branches/main'))
      return Response.json({commit:{sha:change.mainSha??SHA}});
    if(path.endsWith('/actions/runs/'+RUN))
      return Response.json({id:Number(RUN),head_sha:SHA,head_branch:'main',
        event:'workflow_dispatch',run_attempt:1,path:workflow,
        status:'in_progress',actor:{login:'f0-admin'}});
    if(path.endsWith('/issues/comments/'+GRANT))
      return Response.json({id:Number(GRANT),user:{login:'f0-admin'},
        issue_url:'https://api.github.com/repos/'+REPO+'/issues/776',
        created_at:stamp,updated_at:stamp,
        body:(applying?'AIRTRUST_FRMS_QA_APPLY_GRANT_V1\n':
          'AIRTRUST_FRMS_QA_PREPARE_GRANT_V1\n')+
          JSON.stringify(change.forged?{approved:true}:plan)});
    if(path.endsWith('/permission'))
      return Response.json({permission:change.permission??'admin'});
    if(path.endsWith('/time_travel/bookmark'))
      return Response.json({success:true,result:{bookmark:'bookmark-'+RUN}});
    if(path.endsWith('/check-runs')){
      const name=new URL(uri).searchParams.get('check_name');
      return Response.json({check_runs:change.badGate===name?[]:[{
        name,head_sha:SHA,status:'completed',conclusion:'success',
        app:{slug:'github-actions'},
      }]});
    }
    throw Error('unexpected fixture GET');
  };
  return {fetcher,requests};
}
function storage(){
  const map=new Map();let chain=Promise.resolve();
  return {map,
    async transaction(fn){
      const prev=chain;let release;chain=new Promise(r=>release=r);
      await prev;
      try{
        const snapshot=new Map(map);
        const tx={get:async k=>snapshot.get(k),
          put:async(k,v)=>snapshot.set(k,v)};
        const value=await fn(tx);
        map.clear();for(const [k,v] of snapshot)map.set(k,v);
        return value;
      }finally{release();}
    },
    get:async k=>map.get(k),
    put:async(k,v)=>{map.set(k,v);},
  };
}
const message=async(change)=>createTrustedQueuePrepareMessage({
  env,fetcher:fixture(change).fetcher,now:clock});
const consume=(m,db,binding,options={})=>consumeTrustedQueuePrepare({
  message:m,env:runtime,storage:db,binding,now:clock,...options});
const manifest=()=>({authority:'AIRTRUST_RELEASE_COORDINATION',coordinationIssue:776,
  scope:'FRMS_QA_999013_4_CASES_4_JOURNEYS',sha:SHA,environment:'staging',
  dbId:DB,tenantId:999013,
  planSha256:'38a81ed05821919d87b424ddfc7b731bfc8d7d759dadebbb6a21d11edb349ed3',
  authorizedIds:REVIEWED_IDS,
  receiptSha256:'5'.repeat(64),preimageSha256:'2'.repeat(64),
  artifactSha256:'3'.repeat(64),recoveryBookmark:'bookmark-123',
  nonce:'4'.repeat(64),issuedAt:new Date(clock-1000).toISOString(),
  expiresAt:new Date(clock+60000).toISOString()});
const applyEnv={...env,FRMS_QA_APPLY_GRANT_ID:GRANT,
  FRMS_QA_APPLY_CONFIRM:'AIRTRUST_FRMS_QA_APPLY_F0_APPROVED',
  FRMS_QA_APPLY_EXPECTED_SHA:SHA,
  GITHUB_WORKFLOW_REF:REPO+'/'+APPLY_WORKFLOW+'@refs/heads/main'};
const applyMessage=(change={},overrides={})=>createTrustedQueueApplyMessage({
  env:{...applyEnv,...overrides},manifest:manifest(),receiptId:'5'.repeat(64),
  signatureBase64:SIGNATURE,fetcher:fixture(change,'apply').fetcher,now:clock});
const consumeApply=(m,db,binding,options={})=>consumeTrustedQueueApply({
  message:m,env:runtime,storage:db,binding,now:clock,...options});

test('trusted producer reconstructs exact authenticated GitHub grant and omits secrets',async()=>{
  const f=fixture();
  const m=await createTrustedQueuePrepareMessage({env,fetcher:f.fetcher,now:clock});
  assert.equal(m.grantId,GRANT);
  assert.equal(m.dbId,DB);
  assert.equal(m.tenantId,999013);
  assert.equal(m.callerAuth.claims.operation,'prepare');
  assert.equal(Object.hasOwn(m,'recoveryProof'),false);
  assert.equal(JSON.stringify(m).includes('bookmark-'+RUN),false);
  assert.equal(JSON.stringify(m).includes(env.CLOUDFLARE_WORKER_API_TOKEN),false);
  assert.equal(f.requests.filter(x=>x.includes('check-runs')).length,8);
  assert.equal(JSON.stringify(m).includes(TOKEN),false);
  assert.equal(JSON.stringify(m).includes(KEY),false);
  assert.equal(JSON.stringify(m).includes('recoveryBookmark'),false);
});
test('forged, non-admin or out-of-date GitHub authorization emits no queue message',async()=>{
  for(const change of [{forged:true},{permission:'write'},
    {badGate:'worker-tests-1'},{mainSha:'f'.repeat(40)}]){
    await assert.rejects(message(change),
      /FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
  }
});
test('private queue consumer accepts only one signed prepare and persists minimal receipt status',async()=>{
  const m=await message(),db=storage();
  let calls=0;
  const binding={prepare:async args=>{
    calls++;
    assert.deepEqual(Object.keys(args),['callerAuth','recoveryProof']);
    assert.equal(args.recoveryProof.claims.callerNonce,m.callerAuth.claims.nonce);
    return {receiptId:'c'.repeat(64),receipt:{dbId:DB,tenantId:999013,
      writes:0,recoveryBookmark:'DO_NOT_EXPOSE'}};
  }};
  const outcome=await consume(m,db,binding);
  assert.equal(outcome.status,'RECEIPT_VALIDATED');
  assert.equal(outcome.d1Writes,0);
  assert.equal(outcome.physicalR2ReadbackConfirmed,false);
  assert.equal(JSON.stringify(outcome).includes('DO_NOT_EXPOSE'),false);
  assert.equal(JSON.stringify([...db.map]).includes('DO_NOT_EXPOSE'),false);
  await assert.rejects(consume(m,db,binding),/FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
  assert.equal(calls,1);
});
test('24 concurrent deliveries with different signed nonces reserve same grant only once',async()=>{
  const messages=await Promise.all(Array.from({length:24},()=>message()));
  const db=storage();let calls=0;
  const binding={prepare:async()=>{calls++;
    return {receiptId:'d'.repeat(64),receipt:{dbId:DB,tenantId:999013,writes:0}};}};
  const outcomes=await Promise.allSettled(messages.map(m=>consume(m,db,binding)));
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(calls,1);
  assert.equal([...db.map.keys()].filter(k=>k.startsWith('frms-qa-prepare-grant:')).length,1);
});
test('transport exception consumes grant and records indeterminate outcome without retry',async()=>{
  const m=await message(),db=storage();let calls=0;
  const binding={prepare:async()=>{calls++;throw Error('DO_NOT_LEAK');}};
  await assert.rejects(consume(m,db,binding),err=>{
    assert.equal(err.message,'FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED');return true;
  });
  assert.equal(calls,1);
  assert.ok([...db.map.values()].some(v=>v?.status==='INDETERMINATE'));
  assert.equal(JSON.stringify([...db.map]).includes('DO_NOT_LEAK'),false);
  await assert.rejects(consume(m,db,binding),/FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
  assert.equal(calls,1);
});
test('malformed private prepare response quarantines spent grant without exposing receipt',async()=>{
  const m=await message(),db=storage();
  let calls=0;
  const binding={prepare:async()=>{
    calls++;
    return {receiptId:'a'.repeat(64),receipt:{
      dbId:DB,tenantId:999013,writes:1,internalBookmark:'SECRET_BOOKMARK'}};
  }};
  await assert.rejects(consume(m,db,binding),
    /FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
  assert.equal(calls,1);
  const persisted=JSON.stringify([...db.map]);
  assert.match(persisted,/INDETERMINATE/);
  assert.doesNotMatch(persisted,/SECRET_BOOKMARK/);
  assert.equal([...db.map.keys()].filter(k=>k.startsWith('frms-qa-prepare-grant:')).length,1);
  await assert.rejects(consume(m,db,binding),
    /FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
  assert.equal(calls,1);
});
test('runtime HMAC key pin mismatch denies before binding invocation',async()=>{
  const m=await message(),db=storage();
  let calls=0;
  await assert.rejects(consume(m,db,{prepare:async()=>{calls++;}},
    {env:{...runtime,CALLER_KEY_SHA256:'0'.repeat(64)}}),
    /FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
  assert.equal(calls,0);
  assert.equal(db.map.size,0);
});

test('trusted apply message binds the exact staging manifest and hides runner credentials',async()=>{
  const m=await applyMessage();
  assert.equal(m.schema,'AIRTRUST_FRMS_QA_QUEUE_APPLY_V1');
  assert.equal(m.callerAuth.claims.operation,'apply');
  assert.equal(Object.hasOwn(m,'manifest'),false);
  assert.equal(Object.hasOwn(m,'receiptId'),false);
  assert.equal(JSON.stringify(m).includes('bookmark-123'),false);
  assert.equal(JSON.stringify(m).includes(TOKEN),false);
  assert.equal(JSON.stringify(m).includes(KEY),false);
  await assert.rejects(createTrustedQueueApplyMessage({env:applyEnv,
    manifest:{...manifest(),tenantId:2},receiptId:'5'.repeat(64),
    signatureBase64:SIGNATURE,fetcher:fixture({},'apply').fetcher,now:clock}),
    /FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
});
test('apply producer rejects forged, non-admin, stale main and missing gate grants',async()=>{
  for(const change of [{forged:true},{permission:'write'},
    {badGate:'worker-tests-2'},{mainSha:'f'.repeat(40)}]){
    await assert.rejects(applyMessage(change),
      /FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
  }
  for(const overrides of [{GITHUB_TOKEN:''},{FRMS_QA_APPLY_GRANT_ID:'0'},
    {GITHUB_WORKFLOW_REF:REPO+'/'+WORKFLOW+'@refs/heads/main'},
    {FRMS_QA_APPLY_CONFIRM:'unapproved'},
    {FRMS_QA_APPLY_EXPECTED_SHA:'f'.repeat(40)}]){
    await assert.rejects(applyMessage({},overrides),
      /FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
  }
});
test('private apply transport reserves grant and manifest nonce before one RPC',async()=>{
  const m=await applyMessage(),db=storage();let calls=0;
  const binding={apply:async args=>{
    calls++;
    assert.deepEqual(Object.keys(args),['callerAuth','recoveryProof','manifest','receiptId','signatureBase64']);
    assert.equal(args.receiptId,'5'.repeat(64));
    return {status:'QA_STAGING_REPAIR_VALIDATED',valid:4,updatedRows:8,sha:SHA};
  }};
  const outcome=await consumeApply(m,db,binding);
  assert.deepEqual(outcome,{status:'APPLY_VALIDATED',sha:SHA,grantId:GRANT,
    valid:4,updatedRows:8});
  await assert.rejects(consumeApply(m,db,binding),/FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
  assert.equal(calls,1);
  assert.equal(db.map.get('outcome:frms-qa-apply-grant:'+SHA+':'+GRANT).status,
    'APPLY_VALIDATED');
});
test('concurrent apply messages with distinct caller nonces reserve one signed grant',async()=>{
  const messages=await Promise.all(Array.from({length:16},()=>applyMessage()));
  const db=storage();let calls=0;
  const binding={apply:async()=>{calls++;return {
    status:'QA_STAGING_REPAIR_VALIDATED',valid:4,updatedRows:8,sha:SHA};}};
  const results=await Promise.allSettled(messages.map(m=>consumeApply(m,db,binding)));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(calls,1);
  assert.equal([...db.map.keys()].filter(k=>k.startsWith('frms-qa-apply-grant:')).length,1);
  assert.equal([...db.map.keys()].filter(k=>k.startsWith('frms-qa-apply-manifest:')).length,1);
});
test('prepare receipt returns only through a correlated signed private reply',async()=>{
  const m=await message(),db=storage(),sent=[];
  const receipt={environment:'staging',dbId:DB,tenantId:999013,writes:0,
    preimageSha256:'a'.repeat(64),artifactSha256:'b'.repeat(64),
    recoveryBookmark:'bookmark-private'};
  const receiptId=createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
  const outcome=await consumeTrustedQueuePrepare({message:m,env:runtime,
    storage:db,binding:{prepare:async()=>({receiptId,receipt})},
    responseQueue:{send:async x=>sent.push(x)},now:clock});
  assert.equal(outcome.status,'RECEIPT_VALIDATED');
  const reply=verifyPrivateQueueReply({reply:sent[0],keyHex:KEY,
    expected:{sha:SHA,runId:RUN,runAttempt:1,grantId:GRANT,
      operation:'prepare',requestNonce:m.callerAuth.claims.nonce},now:clock});
  assert.equal(reply.receiptId,receiptId);
  assert.equal(reply.receipt.recoveryBookmark,'bookmark-private');
  assert.equal(JSON.stringify(sent[0]).includes('bookmark-private'),false);
  assert.equal(JSON.stringify([...db.map]).includes('bookmark-private'),false);
  await assert.rejects(Promise.resolve().then(()=>verifyPrivateQueueReply({
    reply:sent[0],keyHex:KEY,expected:{sha:SHA,runId:RUN,runAttempt:1,
      grantId:GRANT,operation:'prepare',requestNonce:'f'.repeat(64)},
    now:clock})),/FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
  for(const wrong of [{grantId:'1234567890'},{operation:'apply'}]){
    assert.throws(()=>verifyPrivateQueueReply({reply:sent[0],keyHex:KEY,
      expected:{sha:SHA,runId:RUN,runAttempt:1,grantId:GRANT,
        operation:'prepare',requestNonce:m.callerAuth.claims.nonce,...wrong},
      now:clock}),/FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
  }
  assert.throws(()=>verifyPrivateQueueReply({reply:sent[0],keyHex:KEY,
    expected:{sha:SHA,runId:RUN,runAttempt:1,grantId:GRANT,
      operation:'prepare',requestNonce:m.callerAuth.claims.nonce},
    now:clock+90001}),/FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
});
test('correlated encrypted reply rejects a signed but inconsistent receipt digest',async()=>{
  const m=await message(),db=storage(),sent=[];
  const receipt={environment:'staging',dbId:DB,tenantId:999013,writes:0,
    preimageSha256:'a'.repeat(64),artifactSha256:'b'.repeat(64),
    recoveryBookmark:'bookmark-private'};
  await consumeTrustedQueuePrepare({message:m,env:runtime,
    storage:db,binding:{prepare:async()=>({receiptId:'c'.repeat(64),receipt})},
    responseQueue:{send:async x=>sent.push(x)},now:clock});
  assert.equal(sent.length,1);
  assert.throws(()=>verifyPrivateQueueReply({reply:sent[0],keyHex:KEY,
    expected:{sha:SHA,runId:RUN,runAttempt:1,grantId:GRANT,
      operation:'prepare',requestNonce:m.callerAuth.claims.nonce},now:clock}),
    /FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
});

test('indeterminate apply burns capability and never retries private RPC',async()=>{
  const m=await applyMessage(),db=storage();let calls=0;
  const binding={apply:async()=>{calls++;throw Error('DO_NOT_LEAK');}};
  await assert.rejects(consumeApply(m,db,binding),
    /FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
  assert.equal(calls,1);
  assert.equal(db.map.get('outcome:frms-qa-apply-grant:'+SHA+':'+GRANT).status,
    'INDETERMINATE');
  await assert.rejects(consumeApply(m,db,binding),/FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
  assert.equal(calls,1);
  assert.doesNotMatch(JSON.stringify([...db.map]),/DO_NOT_LEAK/);
});

test('durable coordinator treats every present lock value as occupied',async()=>{
  for(const corrupt of [null,false,0,'']){
    const db=storage();
    db.map.set('lock',corrupt);
    const coordinator=durableCoordinator(db);
    assert.deepEqual(await coordinator.acquireLock('airtrust-staging-mutations-and-scorm-qa'),{held:false});
    assert.equal(db.map.get('lock'),corrupt);
    assert.equal(db.map.size,1);
  }
});
test('durable coordinator treats every present nonce value as consumed',async()=>{
  const nonce='e'.repeat(64);
  for(const corrupt of [null,false,0,'']){
    const db=storage();
    db.map.set('nonce:'+nonce,corrupt);
    const coordinator=durableCoordinator(db);
    assert.equal(await coordinator.reserveNonce({nonce,sha:SHA,scope:'prepare'}),false);
    assert.equal(db.map.get('nonce:'+nonce),corrupt);
    assert.equal(db.map.size,1);
  }
});

test('tampering, wrong env or expiration fails closed before private RPC',async()=>{
  const m=await message();
  for(const changes of [
    {grantId:'1234567890'},{sha:'f'.repeat(40)},{tenantId:6},
    {runAttempt:2},{mac:'0'.repeat(64)},
  ]){
    const db=storage();let calls=0;
    await assert.rejects(consume({...m,...changes},db,{prepare:async()=>{calls++;}}),
      /FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
    assert.equal(db.map.size,0);assert.equal(calls,0);
  }
  const db=storage();
  await assert.rejects(consume(m,db,{prepare:async()=>{}},
    {env:{...runtime,ENVIRONMENT:'production'}}),
    /FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
  assert.equal(db.map.size,0);
  await assert.rejects(consume(m,db,{prepare:async()=>{}},
    {now:clock+90001}),/FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED/);
  assert.equal(db.map.size,0);
});
test('inactive caller configuration has no public route or automatic deploy workflow',async()=>{
  const config=await readFile(new URL('../../ops/frms-qa-repair/wrangler.caller.staging.toml',import.meta.url),'utf8');
  const worker=await readFile(new URL('../../ops/frms-qa-repair/queue-caller-worker.mjs',import.meta.url),'utf8');
  assert.match(config,/workers_dev = false/);
  assert.match(config,/preview_urls = false/);
  assert.match(config,/max_batch_size = 1/);
  assert.match(config,/binding = "REPAIR"/);
  assert.match(config,/binding = "RESULTS"/);
  assert.match(config,/class_name = "FrmsQaCallerLedger"/);
  assert.doesNotMatch(config,/^routes?\s*=/m);
  assert.doesNotMatch(worker,/async fetch\s*\(/);
  assert.match(worker,/message\.ack\(\)/);
});
