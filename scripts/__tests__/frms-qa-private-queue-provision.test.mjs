// Fully synthetic GitHub GET and Cloudflare Queue metadata fixtures.
// No real tokens, networking, Queues, D1/R2 writes, or staging deployments.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {exactQueueProvisionPlan,verifyQueueProvisionAdminGrant,
  ensurePrivateQueues} from '../../ops/frms-qa-repair/provision-private-queues.mjs';

const ACCOUNT='a'.repeat(32),SHA='b'.repeat(40);
const REPO='Airtrust-Org/airtrust',RUN='40019815631',GRANT='6374255192';
const TOKEN='synthetic-github-token-never-log',CF='synthetic-worker-existing-token';
const NOW=Date.parse('2026-10-23T20:00:00Z');
const WORKFLOW='.github/workflows/staging-frms-qa-private-queues.yml';
const callerConfig=readFileSync('ops/frms-qa-repair/wrangler.caller.staging.toml','utf8');
const PLAN=exactQueueProvisionPlan({sha:SHA,accountId:ACCOUNT,callerConfig});
const NAMES=PLAN.queues;
const env={
  GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_REPOSITORY:REPO,GITHUB_REF:'refs/heads/main',
  GITHUB_WORKFLOW_REF:REPO+'/'+WORKFLOW+'@refs/heads/main',
  GITHUB_SHA:SHA,GITHUB_RUN_ID:RUN,GITHUB_RUN_ATTEMPT:'1',GITHUB_ACTOR:'f0-admin',
  GITHUB_TOKEN:TOKEN,CLOUDFLARE_ACCOUNT_ID:ACCOUNT,
  FRMS_QA_QUEUE_CONFIRM:'AIRTRUST_FRMS_QA_PRIVATE_QUEUES_ONLY_APPROVED',
  FRMS_QA_QUEUE_EXPECTED_SHA:SHA,FRMS_QA_QUEUE_GRANT_ID:GRANT,
};
function github(change={}){
  const calls=[],ts=new Date(NOW-1000).toISOString();
  const fetcher=async(uri,opts)=>{
    calls.push(uri);
    assert.equal(opts.method,'GET');
    assert.equal(opts.redirect,'manual');
    assert.equal(opts.headers.Authorization,'Bearer '+TOKEN);
    const u=new URL(uri),p=u.pathname;
    if(p.endsWith('/branches/main'))
      return Response.json({commit:{sha:change.mainSha||SHA}});
    if(p.endsWith('/actions/runs/'+RUN))
      return Response.json({id:Number(RUN),head_sha:SHA,head_branch:'main',
        event:'workflow_dispatch',run_attempt:1,
        path:change.runPath||WORKFLOW,status:change.runStatus||'in_progress',
        actor:{login:'f0-admin'}});
    if(p.endsWith('/issues/comments/'+GRANT))
      return Response.json({id:Number(GRANT),user:{login:'f0-admin'},
        issue_url:'https://api.github.com/repos/'+REPO+'/issues/776',
        created_at:change.old?new Date(NOW-2*3600000-1000).toISOString():ts,
        updated_at:change.edited?new Date(NOW-500).toISOString():ts,
        body:'AIRTRUST_FRMS_QA_QUEUE_PROVISION_V1\n'+
          JSON.stringify(change.forged?{approved:true}:PLAN)});
    if(p.endsWith('/permission'))
      return Response.json({permission:change.noAdmin?'write':'admin'});
    if(p.endsWith('/check-runs')){
      const name=u.searchParams.get('check_name');
      return Response.json({check_runs:name===change.badGate?[]:[{
        name,head_sha:SHA,status:'completed',conclusion:'success',
        app:{slug:'github-actions'},
      }]});
    }
    throw Error('unlisted synthetic GitHub URL');
  };
  return {calls,fetcher};
}
async function verify(change={},envChange={}){
  const f=github(change);
  return verifyQueueProvisionAdminGrant({
    env:{...env,...envChange},callerConfig,fetcher:f.fetcher,now:NOW});
}
test('plan is fixed to two Queues, existing Worker token, staging and zero D1/R2 writes',()=>{
  assert.equal(PLAN.schema,'AIRTRUST_FRMS_QA_QUEUE_PROVISION_V1');
  assert.deepEqual(PLAN.queues,[...NAMES]);
  assert.equal(new Set(PLAN.queues).size,2);
  assert.equal(PLAN.credential_mode,'existing_staging_worker_queue_only');
  assert.equal(PLAN.global_mutex,'airtrust-staging-mutations-and-scorm-qa');
  assert.equal(PLAN.production_authorized,false);
  assert.equal(PLAN.private_worker_deploy_authorized,false);
  assert.equal(PLAN.apply_authorized,false);
  assert.equal(PLAN.d1_writes_authorized,0);
  assert.equal(PLAN.r2_writes_authorized,0);
  assert.equal(PLAN.workflow_path,WORKFLOW);
  assert.equal(PLAN.max_queue_retention_seconds,900);
  assert.equal(PLAN.results_http_pull_consumer_authorized,true);
});
test('protected main runner verifies fresh unedited F0 admin and eight Actions gates',async()=>{
  const f=github();
  const outcome=await verifyQueueProvisionAdminGrant({
    env,callerConfig,fetcher:f.fetcher,now:NOW});
  assert.equal(outcome.status,'QUEUE_PROVISION_ADMIN_GRANT_VERIFIED');
  assert.equal(outcome.sha,SHA);
  assert.equal(outcome.grantId,GRANT);
  assert.equal(f.calls.filter(x=>x.includes('check-runs?')).length,8);
  assert.equal(JSON.stringify(outcome).includes(TOKEN),false);
  assert.equal(JSON.stringify(outcome).includes(CF),false);
});
test('forged, edited, old, non-admin, wrong workflow, main or gates fail closed',async()=>{
  for(const bad of [{forged:true},{edited:true},{old:true},{noAdmin:true},
    {mainSha:'c'.repeat(40)},{badGate:'worker-tests-1'},
    {runPath:'another.yml'},{runStatus:'completed'}]){
    await assert.rejects(verify(bad),/FRMS_QA_QUEUE_PROVISION_DENIED/);
  }
  for(const bad of [{GITHUB_REF:'refs/heads/feature'},
    {FRMS_QA_QUEUE_CONFIRM:'wrong'}, {FRMS_QA_QUEUE_GRANT_ID:'0'},
    {FRMS_QA_QUEUE_EXPECTED_SHA:'d'.repeat(40)},
    {GITHUB_WORKFLOW_REF:REPO+'/not-this-workflow@refs/heads/main'},
    {GITHUB_TOKEN:''}])
    await assert.rejects(verify({},bad),/FRMS_QA_QUEUE_PROVISION_DENIED/);
});
function cfHarness({existing=[],failPostName='',badInventory=false,
  badExistingRetention=false,badConsumer=false,callerDeployed=false,
  foreignPrepareConsumer=false}={}){
  const items=new Map(),calls=[];
  const idFor=name=>name===NAMES[0]?'1'.repeat(32):'2'.repeat(32);
  const knownId=id=>[...items.values()].find(q=>q.queue_id===id);
  for(const name of existing){
    items.set(name,{queue_id:idFor(name),queue_name:name,
      settings:{message_retention_period:badExistingRetention?345600:900},
      consumers:name===NAMES[1]?[{
        type:badConsumer?'worker':'http_pull',queue_name:name,
        settings:{batch_size:1,visibility_timeout_ms:30000},
      }]:callerDeployed||foreignPrepareConsumer?[{
        type:'worker',queue_name:name,settings:{batch_size:1},
        script_name:foreignPrepareConsumer?'unreviewed-other-worker':
          'airtrust-frms-qa-caller-staging-private',
      }]:[]});
  }
  const fetcher=async(uri,opts)=>{
    const path=new URL(uri).pathname,method=opts.method;
    calls.push({method,path,body:opts.body});
    assert.equal(opts.headers.Authorization,'Bearer '+CF);
    assert.equal(opts.redirect,'manual');
    if(method==='GET'&&uri.endsWith('/queues?per_page=100')){
      return Response.json({success:true,result:badInventory?[{}]:
        [...items.values()].map(q=>({queue_name:q.queue_name,queue_id:q.queue_id})),
        result_info:{total_count:items.size}});
    }
    if(method==='GET'&&/\/queues\/[0-9a-f]{32}$/.test(path)){
      const item=knownId(path.split('/').at(-1));
      assert.ok(item);
      return Response.json({success:true,result:item});
    }
    if(method==='POST'&&path.endsWith('/queues')){
      const data=JSON.parse(opts.body);
      assert.deepEqual(Object.keys(data),['queue_name']);
      assert.ok(NAMES.includes(data.queue_name));
      if(data.queue_name===failPostName)
        return Response.json({success:false},{status:403});
      const item={queue_id:idFor(data.queue_name),queue_name:data.queue_name,
        settings:{message_retention_period:345600},consumers:[]};
      items.set(data.queue_name,item);
      return Response.json({success:true,result:item});
    }
    if(method==='PUT'&&/\/queues\/[0-9a-f]{32}$/.test(path)){
      const item=knownId(path.split('/').at(-1));
      assert.ok(item);
      const data=JSON.parse(opts.body);
      assert.equal(data.queue_name,item.queue_name);
      assert.deepEqual(data.settings,{delivery_delay:0,delivery_paused:false,
        message_retention_period:900});
      item.settings={...data.settings};
      return Response.json({success:true,result:item});
    }
    if(method==='POST'&&/\/queues\/[0-9a-f]{32}\/consumers$/.test(path)){
      const item=knownId(path.split('/').at(-2));
      assert.equal(item?.queue_name,NAMES[1]);
      const data=JSON.parse(opts.body);
      assert.deepEqual(data,{type:'http_pull',settings:{
        batch_size:1,visibility_timeout_ms:30000,max_retries:1,
      }});
      const consumer={...data,queue_name:item.queue_name};
      item.consumers.push(consumer);
      return Response.json({success:true,result:consumer});
    }
    throw Error('unexpected Cloudflare request');
  };
  return {items,calls,fetcher};
}
test('existing private Queues require only fixed metadata GETs, no mutation',async()=>{
  const f=cfHarness({existing:NAMES});
  const r=await ensurePrivateQueues({accountId:ACCOUNT,token:CF,fetcher:f.fetcher});
  assert.equal(r.queuesCreated,0);
  assert.equal(r.queueNamesPresent,2);
  assert.equal(r.queueHttpPullConfigured,true);
  assert.equal(r.maxQueueRetentionSeconds,900);
  assert.equal(r.d1Writes,0);
  assert.ok(f.calls.every(x=>x.method==='GET'));
});
test('exact preexisting caller Worker is safe for GET-only Queue revalidation',async()=>{
  const f=cfHarness({existing:NAMES,callerDeployed:true});
  const r=await ensurePrivateQueues({accountId:ACCOUNT,token:CF,fetcher:f.fetcher});
  assert.equal(r.queuesCreated,0);
  assert.equal(r.queueHttpPullConfigured,true);
  assert.ok(f.calls.every(x=>x.method==='GET'));
});
test('create exactly two missing private Queues under explicitly verified grant',async()=>{
  const f=cfHarness();
  const r=await ensurePrivateQueues({accountId:ACCOUNT,token:CF,fetcher:f.fetcher});
  assert.equal(r.queuesCreated,2);
  assert.equal(r.retentionUpdates,2);
  assert.equal(r.httpPullCreated,1);
  assert.equal(r.queueHttpPullConfigured,true);
  assert.deepEqual([...f.items.keys()].sort(),[...NAMES].sort());
  assert.equal(f.calls.filter(x=>x.method==='POST').length,3);
  assert.equal(f.calls.filter(x=>x.method==='PUT').length,2);
  assert.equal(f.calls.filter(x=>x.method==='GET').length,5);
  assert.ok(f.calls.every(x=>['GET','POST','PUT'].includes(x.method)));
});
test('partial provisioning remains quarantined; no broad delete or retry',async()=>{
  const f=cfHarness({failPostName:NAMES[1]});
  await assert.rejects(ensurePrivateQueues({
    accountId:ACCOUNT,token:CF,fetcher:f.fetcher}),/FRMS_QA_QUEUE_PROVISION_DENIED/);
  assert.equal(f.calls.filter(x=>x.method==='POST').length,2);
  assert.equal(f.calls.filter(x=>x.method==='DELETE').length,0);
  assert.equal(f.calls.filter(x=>x.method==='PUT').length,1);
});
test('existing Queues with long retention or foreign consumer fail closed before mutations',async()=>{
  for(const opts of [{badExistingRetention:true},{badConsumer:true},{foreignPrepareConsumer:true}]){
    const f=cfHarness({existing:NAMES,...opts});
    await assert.rejects(ensurePrivateQueues({accountId:ACCOUNT,token:CF,
      fetcher:f.fetcher}),/FRMS_QA_QUEUE_PROVISION_DENIED/);
    assert.ok(f.calls.every(c=>c.method==='GET'));
  }
});
test('bad Queue inventory or missing token stops before all write attempts',async()=>{
  const f=cfHarness({badInventory:true});
  await assert.rejects(ensurePrivateQueues({
    accountId:ACCOUNT,token:CF,fetcher:f.fetcher}),/FRMS_QA_QUEUE_PROVISION_DENIED/);
  assert.equal(f.calls.filter(x=>x.method==='POST').length,0);
  await assert.rejects(ensurePrivateQueues({accountId:ACCOUNT,token:''}),
    /FRMS_QA_QUEUE_PROVISION_DENIED/);
});
