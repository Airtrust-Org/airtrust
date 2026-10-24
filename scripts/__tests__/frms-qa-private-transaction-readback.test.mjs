// Synthetic process-spawn/readback fixture. Never connects to remote D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readbackReviewedF0,verifyReviewedFourCaseOutput} from
  '../../ops/frms-qa-repair/private-transaction-readback.mjs';
const SHA='a'.repeat(40);
const DB='bf9963f4-eb12-439b-a830-20bbf577ac22';
const PREFIX='FRMS_QA_REVIEWED_FIXED_STATUS_ONLY=';
const env={
  GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_REPOSITORY:'Airtrust-Org/airtrust',GITHUB_REF:'refs/heads/main',
  GITHUB_SHA:SHA,
  GITHUB_WORKFLOW_REF:'Airtrust-Org/airtrust/.github/workflows/staging-frms-qa-private-transaction.yml@refs/heads/main',
  CLOUDFLARE_ACCOUNT_ID:'1'.repeat(32),
  CLOUDFLARE_D1_MIGRATION_API_TOKEN:'synthetic-staging-only-bearer',
};
const successful=()=>({
  tenant_id:999013,evaluated:4,valid:4,
  verdict:'READONLY_ACCEPTANCE_READY',writes:0,
  cases:[1,2,3,4].map(n=>({case_id:'qa-frms-ux-case-'+n,status:'VALID'})),
});
const encoded=x=>PREFIX+JSON.stringify(x)+'\n';
test('readback converts existing four-case SELECT-only result into sanitized acceptance',()=>{
  const result=verifyReviewedFourCaseOutput({output:encoded(successful()),sha:SHA});
  assert.deepEqual(result,{
    verdict:'READONLY_ACCEPTANCE_READY',valid:4,writes:0,
    tenantId:999013,dbId:DB,sha:SHA,
  });
  assert.equal(Object.isFrozen(result),true);
  assert.equal(JSON.stringify(result).includes('cases'),false);
});
test('missing, duplicated, tenant-crossed, stale, invalid, or writes results deny 4/4',()=>{
  const proper=successful();
  for(const result of [
    {...proper,valid:3},{...proper,tenant_id:999014},
    {...proper,verdict:'GOVERNED_INCREMENTAL_REPAIR_REQUIRED'},
    {...proper,writes:1},{...proper,evaluated:3},
    {...proper,cases:proper.cases.slice(1)},
    {...proper,cases:proper.cases.map((x,i)=>i===0?{...x,status:'MISSING'}:x)},
    {...proper,cases:proper.cases.map(x=>({...x,case_id:'qa-frms-ux-case-1'}))},
  ]){
    assert.throws(()=>verifyReviewedFourCaseOutput({output:encoded(result),sha:SHA}),
      /FRMS_QA_TRANSACTION_READBACK_DENIED/);
  }
  for(const output of ['',encoded(proper)+encoded(proper),PREFIX+'{broken}', 'Status PASS']){
    assert.throws(()=>verifyReviewedFourCaseOutput({output,sha:SHA}),
      /FRMS_QA_TRANSACTION_READBACK_DENIED/);
  }
});
test('protected fixed inspector is invoked once with sanitized output and SELECT-only scope',async()=>{
  const calls=[];
  const result=await readbackReviewedF0({env,sha:SHA,execute:(exec,args,opts)=>{
    calls.push({exec,args,opts});
    assert.equal(args.length,2);
    assert.match(args[0],/scripts\/staging\/inspect-frms-ux-cases\.mjs$/);
    assert.equal(args[1],'--reviewed-fixed-status-only');
    assert.equal(opts.env.STAGING_D1_ID,DB);
    assert.equal(opts.env.FRMS_QA_FIXED_STATUS_ONLY,
      'FRMS_QA_REVIEWED_4CASE_STATUS_READONLY');
    assert.equal(opts.env.SOURCE_AGGREGATE_SHA,'');
    assert.equal(opts.env.SANITIZED_AGGREGATE_PATH,'');
    assert.equal(opts.env.CLOUDFLARE_API_TOKEN,env.CLOUDFLARE_D1_MIGRATION_API_TOKEN);
    return {status:0,stdout:encoded(successful()),stderr:''};
  }});
  assert.equal(result.valid,4);
  assert.equal(result.writes,0);
  assert.equal(calls.length,1);
  assert.equal(JSON.stringify(result).includes(env.CLOUDFLARE_D1_MIGRATION_API_TOKEN),false);
});
test('wrong runner, SHA, token, DB, failed command and forged output deny',async()=>{
  const deny=()=>{throw Error('command should not run');};
  for(const bad of [
    {env:{...env,GITHUB_REF:'refs/heads/review'}},
    {env:{...env,GITHUB_SHA:'b'.repeat(40)}},
    {env:{...env,CLOUDFLARE_D1_MIGRATION_API_TOKEN:''}},
    {env:{...env,GITHUB_EVENT_NAME:'push'}},
    {dbId:'2'.repeat(32)},
    {tenantId:1},
  ]){
    await assert.rejects(readbackReviewedF0({
      env,sha:SHA,execute:deny,...bad}),
      /FRMS_QA_TRANSACTION_READBACK_DENIED/);
  }
  for(const result of [
    {status:1,stdout:encoded(successful())},
    {status:0,stdout:encoded({...successful(),valid:0})},
    {status:0,stdout:'garbage'},
  ]){
    await assert.rejects(readbackReviewedF0({
      env,sha:SHA,execute:()=>result}),
      /FRMS_QA_TRANSACTION_READBACK_DENIED/);
  }
});
