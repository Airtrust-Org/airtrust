import test from 'node:test';
import assert from 'node:assert/strict';
import {runTrustedPrepareAdmission} from '../../ops/frms-qa-repair/trusted-prepare-admission.mjs';
import {exactPreparePlan} from '../../ops/frms-qa-repair/verify-prepare-admin-grant.mjs';

const SHA='a'.repeat(40),GRANT='6374255192',RUN='40019815631',TOKEN='synthetic-test-token-never-logs';
const REPO='Airtrust-Org/airtrust',WORKFLOW='.github/workflows/staging-frms-qa-private-prepare.yml';
const DB='bf9963f4-eb12-439b-a830-20bbf577ac22';
const env=Object.freeze({
  GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:REPO,
  GITHUB_WORKFLOW_REF:REPO+'/'+WORKFLOW+'@refs/heads/main',
  GITHUB_SHA:SHA,GITHUB_ACTOR:'f0-admin',
  GITHUB_RUN_ID:RUN,GITHUB_RUN_ATTEMPT:'1',
  FRMS_QA_PREPARE_CONFIRM:'AIRTRUST_FRMS_QA_PREPARE_ONLY_F0_APPROVED',
  FRMS_QA_PREPARE_EXPECTED_SHA:SHA,FRMS_QA_PREPARE_GRANT_ID:GRANT,
  FRMS_QA_CALLER_KEY_HEX:'b'.repeat(64),GITHUB_TOKEN:TOKEN,
});
const getFixture=(change={})=>{
  let calls=[],bound=0;
  const plan=exactPreparePlan({sha:SHA});
  const stamp=new Date(Date.now()-30000).toISOString();
  const body='AIRTRUST_FRMS_QA_PREPARE_GRANT_V1\n'+JSON.stringify(plan);
  const fetcher=async(uri,args)=>{
    calls.push({uri,method:args?.method,redirect:args?.redirect});
    assert.equal(args?.method,'GET');
    assert.equal(args?.redirect,'manual');
    assert.equal(args?.headers?.Authorization,'Bearer '+TOKEN);
    const path=new URL(uri).pathname;
    if(change.deniedPath&&path.endsWith(change.deniedPath))
      return Response.json({message:'deny'},{status:403});
    if(path.endsWith('/branches/main'))
      return Response.json({commit:{sha:change.mainSha??SHA}});
    if(path.endsWith('/actions/runs/'+RUN))
      return Response.json({id:Number(RUN),head_sha:SHA,head_branch:'main',
        event:'workflow_dispatch',run_attempt:1,path:WORKFLOW,
        status:'in_progress',actor:{login:'f0-admin'}});
    if(path.endsWith('/issues/comments/'+GRANT))
      return Response.json({id:Number(GRANT),issue_url:'https://api.github.com/repos/'+REPO+'/issues/776',
        user:{login:'f0-admin'},created_at:stamp,updated_at:stamp,
        body:change.invalidBody?'forged':body});
    if(path.endsWith('/permission'))
      return Response.json({permission:change.permission??'admin'});
    if(path.endsWith('/check-runs')){
      const name=new URL(uri).searchParams.get('check_name');
      return Response.json({check_runs:change.failedGate===name?[]:[{
        name,head_sha:SHA,status:'completed',conclusion:'success',app:{slug:'github-actions'},
      }]});
    }
    throw Error('Unexpected GET path');
  };
  const used=new Map();
  const grantLedger={
    transaction:async callback=>{
      const staged=new Map(used);
      const result=await callback({
        get:async k=>staged.get(k),
        put:async(k,v)=>{staged.set(k,v);},
      });
      used.clear();
      for(const [k,v] of staged)used.set(k,v);
      return result;
    },
  };
  const binding={
    prepare:async input=>{
      bound++;
      assert.deepEqual(Object.keys(input),['callerAuth']);
      assert.equal(input.callerAuth.claims.operation,'prepare');
      assert.equal(input.callerAuth.claims.sha,SHA);
      assert.equal(JSON.stringify(input).includes(TOKEN),false);
      if(change.transportFails)throw Error('secret transport exception '+TOKEN);
      return {receiptId:'c'.repeat(64),
        receipt:{dbId:DB,tenantId:999013,writes:0,
          recoveryBookmark:'private-bookmark-must-not-be-exposed'}};
    },
  };
  return {fetcher,binding,grantLedger,used,get calls(){return calls;},
    get bound(){return bound;}};
};
const execute=(f,environment=env)=>runTrustedPrepareAdmission({
  env:environment,fetcher:f.fetcher,binding:f.binding,grantLedger:f.grantLedger,
});

test('authenticated GitHub GET-only gates allow one scoped private prepare',async()=>{
  const f=getFixture();
  const result=await execute(f);
  assert.equal(result.status,'FRMS_QA_PRIVATE_PREPARE_RECEIPT_VALIDATED');
  assert.equal(result.d1Writes,0);
  assert.equal(result.applyAuthorized,false);
  assert.equal(result.productionAuthorized,false);
  assert.equal(f.bound,1);
  assert.equal(f.used.size,1);
  assert.equal(f.calls.filter(x=>x.uri.includes('/check-runs')).length,8);
  assert.ok(f.calls.every(x=>x.uri.startsWith('https://api.github.com/repos/'+REPO+'/')&&x.method==='GET'));
  assert.equal(JSON.stringify(result).includes(TOKEN),false);
  assert.equal(JSON.stringify(result).includes('private-bookmark'),false);
});
test('the same grant cannot invoke binding twice even with a new caller HMAC',async()=>{
  const f=getFixture();
  await execute(f);
  await assert.rejects(execute(f),err=>{
    assert.equal(err.message,'FRMS_QA_TRUSTED_PREPARE_ADMISSION_DENIED');
    return true;
  });
  assert.equal(f.bound,1);
  assert.equal(f.used.size,1);
});
test('stale, forged or unauthorized GitHub evidence never reaches grant ledger or RPC',async()=>{
  for(const change of [
    {mainSha:'f'.repeat(40)},{permission:'write'},
    {failedGate:'worker-tests-2'},{invalidBody:true},{deniedPath:'/permission'},
  ]){
    const f=getFixture(change);
    await assert.rejects(execute(f),/FRMS_QA_TRUSTED_PREPARE_ADMISSION_DENIED/);
    assert.equal(f.bound,0);
    assert.equal(f.used.size,0);
  }
});
test('untrusted workflow, SHA, token or caller key fail before RPC and never log bearer',async()=>{
  for(const modifications of [
    {GITHUB_ACTIONS:'false'},{GITHUB_WORKFLOW_REF:'other/workflow@main'},
    {FRMS_QA_PREPARE_EXPECTED_SHA:'f'.repeat(40)},
    {GITHUB_ACTOR:'non-admin!'},{GITHUB_TOKEN:''},
    {FRMS_QA_CALLER_KEY_HEX:'bad'},
  ]){
    const f=getFixture();
    await assert.rejects(execute(f,{...env,...modifications}),err=>{
      assert.equal(err.message,'FRMS_QA_TRUSTED_PREPARE_ADMISSION_DENIED');
      assert.equal(err.message.includes(TOKEN),false);
      return true;
    });
    assert.equal(f.bound,0);
    assert.equal(f.used.size,0);
  }
});
test('transport error permanently spends grant but never leaks bookmark or token',async()=>{
  const f=getFixture({transportFails:true});
  for(let i=0;i<2;i++)
    await assert.rejects(execute(f),err=>{
      assert.equal(err.message,'FRMS_QA_TRUSTED_PREPARE_ADMISSION_DENIED');
      assert.equal(err.message.includes(TOKEN),false);
      return true;
    });
  assert.equal(f.bound,1);
  assert.equal(f.used.size,1);
});
