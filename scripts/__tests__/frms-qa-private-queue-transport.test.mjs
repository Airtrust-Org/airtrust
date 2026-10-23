// Fully synthetic Cloudflare Queue contract; never contacts real GitHub or D1/R2.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createTrustedQueuePrepareMessage,consumeTrustedQueuePrepare} from
  '../../ops/frms-qa-repair/queue-prepare-transport.mjs';
import {exactPreparePlan} from '../../ops/frms-qa-repair/verify-prepare-admin-grant.mjs';
import {durableCoordinator} from '../../ops/frms-qa-repair/adapters.mjs';

const SHA='b'.repeat(40),KEY='a'.repeat(64),GRANT='6374255192',
  RUN='40019815631',TOKEN='fixture-only-never-forward';
const REPO='Airtrust-Org/airtrust';
const WORKFLOW='.github/workflows/staging-frms-qa-private-prepare.yml';
const DB='bf9963f4-eb12-439b-a830-20bbf577ac22';
const env={
  GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:REPO,
  GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',
  GITHUB_SHA:SHA,GITHUB_RUN_ID:RUN,GITHUB_RUN_ATTEMPT:'1',
  GITHUB_ACTOR:'f0-admin',GITHUB_WORKFLOW_REF:REPO+'/'+WORKFLOW+'@refs/heads/main',
  FRMS_QA_PREPARE_CONFIRM:'AIRTRUST_FRMS_QA_PREPARE_ONLY_F0_APPROVED',
  FRMS_QA_PREPARE_EXPECTED_SHA:SHA,FRMS_QA_PREPARE_GRANT_ID:GRANT,
  GITHUB_TOKEN:TOKEN,FRMS_QA_CALLER_KEY_HEX:KEY,
};
const runtime={
  ENVIRONMENT:'staging',D1_ID:DB,RELEASE_SHA:SHA,
  CALLER_KEY_HEX:KEY,CALLER_KEY_SHA256:
    createHash('sha256').update(Buffer.from(KEY,'hex')).digest('hex'),
};
const clock=Date.now();
function fixture(change={}){
  let requests=[];
  const stamp=new Date(clock-1000).toISOString();
  const plan=exactPreparePlan({sha:SHA});
  const fetcher=async(uri,options)=>{
    requests.push(uri);
    assert.equal(options.method,'GET');
    assert.equal(options.headers.Authorization,'Bearer '+TOKEN);
    const path=new URL(uri).pathname;
    if(path.endsWith('/branches/main'))
      return Response.json({commit:{sha:change.mainSha??SHA}});
    if(path.endsWith('/actions/runs/'+RUN))
      return Response.json({id:Number(RUN),head_sha:SHA,head_branch:'main',
        event:'workflow_dispatch',run_attempt:1,path:WORKFLOW,
        status:'in_progress',actor:{login:'f0-admin'}});
    if(path.endsWith('/issues/comments/'+GRANT))
      return Response.json({id:Number(GRANT),user:{login:'f0-admin'},
        issue_url:'https://api.github.com/repos/'+REPO+'/issues/776',
        created_at:stamp,updated_at:stamp,
        body:'AIRTRUST_FRMS_QA_PREPARE_GRANT_V1\n'+
          JSON.stringify(change.forged?{approved:true}:plan)});
    if(path.endsWith('/permission'))
      return Response.json({permission:change.permission??'admin'});
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

test('trusted producer reconstructs exact authenticated GitHub grant and omits secrets',async()=>{
  const f=fixture();
  const m=await createTrustedQueuePrepareMessage({env,fetcher:f.fetcher,now:clock});
  assert.equal(m.grantId,GRANT);
  assert.equal(m.dbId,DB);
  assert.equal(m.tenantId,999013);
  assert.equal(m.callerAuth.claims.operation,'prepare');
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
    assert.deepEqual(Object.keys(args),['callerAuth']);
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
  assert.match(config,/class_name = "FrmsQaCallerLedger"/);
  assert.doesNotMatch(config,/^routes?\s*=/m);
  assert.doesNotMatch(worker,/async fetch\s*\(/);
  assert.match(worker,/message\.ack\(\)/);
});
