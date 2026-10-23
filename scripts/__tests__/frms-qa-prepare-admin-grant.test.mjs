import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exactPreparePlan,assertPrepareGrantBody,verifyPrepareAdminGrant,
  githubPrepareReadOnlyApi,
} from '../../ops/frms-qa-repair/verify-prepare-admin-grant.mjs';
const REPO='Airtrust-Org/airtrust',SHA='a'.repeat(40);
const NOW=Date.parse('2026-10-23T15:00:00.000Z'),GRANT='99999000000';
const RUN='39977611720', WORKFLOW='.github/workflows/staging-frms-qa-private-prepare.yml';
const env={
  GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:REPO,
  GITHUB_WORKFLOW_REF:REPO+'/'+WORKFLOW+'@refs/heads/main',
  GITHUB_SHA:SHA,GITHUB_ACTOR:'f0-admin',
  GITHUB_RUN_ID:RUN,GITHUB_RUN_ATTEMPT:'1',
  FRMS_QA_PREPARE_CONFIRM:'AIRTRUST_FRMS_QA_PREPARE_ONLY_F0_APPROVED',
  FRMS_QA_PREPARE_EXPECTED_SHA:SHA,FRMS_QA_PREPARE_GRANT_ID:GRANT,
};
const plan=exactPreparePlan({sha:SHA});
const body=value=>'AIRTRUST_FRMS_QA_PREPARE_GRANT_V1\n'+JSON.stringify(value);
function fixture(overrides={}){
  const calls=[];
  const opts={...overrides};
  const api=async path=>{
    calls.push(path);
    if(path==='repos/'+REPO+'/branches/main')
      return {commit:{sha:opts.mainSha??SHA}};
    if(path==='repos/'+REPO+'/actions/runs/'+RUN)
      return {id:Number(RUN),head_sha:SHA,head_branch:'main',
        event:'workflow_dispatch',run_attempt:1,path:WORKFLOW,
        status:'in_progress',actor:{login:'f0-admin'},...opts.run};
    if(path==='repos/'+REPO+'/issues/comments/'+GRANT)
      return {id:Number(GRANT),issue_url:'https://api.github.com/repos/'+REPO+'/issues/776',
        user:{login:'f0-admin'},
        created_at:'2026-10-23T14:30:00.000Z',
        updated_at:'2026-10-23T14:30:00.000Z',
        body:body({...plan,...opts.grantChanges}),...opts.comment};
    if(path.endsWith('/permission'))return {permission:opts.permission??'admin'};
    if(path.includes('/check-runs?')){
      const url=new URL('https://api.github.com/'+path);
      assert.equal(url.searchParams.get('filter'),'latest');
      assert.equal(url.searchParams.get('per_page'),'100');
      const name=url.searchParams.get('check_name');
      if(opts.failGate===name)return {check_runs:[]};
      return {check_runs:[{name,head_sha:SHA,status:'completed',
        conclusion:'success',app:{slug:'github-actions'},
        ...opts.check}]};
    }
    throw Error('Unexpected read-only path: '+path);
  };
  return {api,calls};
}
const check=(opts={},environment=env,now=NOW)=>{
  const f=fixture(opts);
  return verifyPrepareAdminGrant({env:environment,api:f.api,now});
};
test('strict prepare grant pins exact four-case synthetic tenant, phase and zero D1 writes',()=>{
  assert.equal(plan.repository,REPO);
  assert.equal(plan.d1_uuid,'bf9963f4-eb12-439b-a830-20bbf577ac22');
  assert.equal(plan.tenant_id,999013);
  assert.equal(plan.phase,'prepare');
  assert.equal(plan.d1_writes_authorized,0);
  assert.equal(plan.apply_authorized,false);
  assert.equal(plan.worker_deploy_authorized,false);
  assert.equal(plan.production_authorized,false);
  assert.equal(plan.workflow_path,WORKFLOW);
  assertPrepareGrantBody(body(plan),plan);
  for(const change of [
    {apply_authorized:true},{phase:'apply'},
    {tenant_id:6},{release_sha:'b'.repeat(40)},
    {d1_writes_authorized:8},{worker_deploy_authorized:true},
    {extra:'unexpected'},{workflow_path:'other'},
  ])assert.throws(()=>assertPrepareGrantBody(body({...plan,...change}),plan),
    /FRMS_QA_PREPARE_ADMIN_GRANT_DENIED/);
});
test('independent GET-only verifier checks exact issue admin, main, run and all 8 gates',async()=>{
  const {api,calls}=fixture();
  const verified=await verifyPrepareAdminGrant({env,api,now:NOW});
  assert.deepEqual(verified,{
    schema:'AIRTRUST_FRMS_QA_PREPARE_GRANT_VERIFIED_V1',
    status:'VERIFIED_BY_INDEPENDENT_GITHUB_ADMIN_CHECK',
    sha:SHA,dbId:plan.d1_uuid,tenantId:999013,
    grantId:GRANT,runId:RUN,runAttempt:1,
  });
  const checks=calls.filter(path=>path.includes('/check-runs?'));
  assert.equal(checks.length,8);
  assert.equal(calls.filter(path=>path.endsWith('/permission')).length,1);
  assert.ok(Object.isFrozen(verified));
});
test('rejects wrong run, actor, branch, workflow path, attempt and status',async()=>{
  const alternatives=[
    {run:{id:Number(RUN)+1}},{run:{head_sha:'b'.repeat(40)}},
    {run:{head_branch:'feature'}},{run:{event:'push'}},
    {run:{path:'.github/workflows/attacker.yml'}},
    {run:{run_attempt:2}},{run:{actor:{login:'attacker'}}},
    {run:{status:'completed'}},
  ];
  for(const opts of alternatives)
    await assert.rejects(check(opts),/FRMS_QA_PREPARE_ADMIN_GRANT_DENIED/);
});
test('rejects all untrusted runner contexts before querying GitHub',async()=>{
  const changes=[
    {GITHUB_ACTIONS:'false'},{GITHUB_EVENT_NAME:'push'},
    {GITHUB_REF:'refs/heads/dev'},{GITHUB_REPOSITORY:'other/repo'},
    {GITHUB_WORKFLOW_REF:'other/workflow@main'},
    {FRMS_QA_PREPARE_CONFIRM:'wrong'},
    {FRMS_QA_PREPARE_EXPECTED_SHA:'b'.repeat(40)},
    {GITHUB_SHA:'invalid'},{GITHUB_ACTOR:'attacker!'},
    {GITHUB_RUN_ID:'bad'},{GITHUB_RUN_ATTEMPT:'0'},
    {FRMS_QA_PREPARE_GRANT_ID:'bad'},
  ];
  for(const changeset of changes){
    const {api,calls}=fixture();
    await assert.rejects(verifyPrepareAdminGrant({
      env:{...env,...changeset},api,now:NOW,
    }),/FRMS_QA_PREPARE_ADMIN_GRANT_DENIED/);
    assert.equal(calls.length,0);
  }
});
test('deny modified, stale, future, wrong issue, wrong grant and non-admin approvals',async()=>{
  const rejected=[
    {comment:{id:99}},
    {comment:{issue_url:'https://api.github.com/repos/'+REPO+'/issues/1426'}},
    {comment:{updated_at:'2026-10-23T14:32:00.000Z'}},
    {comment:{user:{login:'invalid!'}}},
    {comment:{created_at:'2026-10-23T11:00:00.000Z',
      updated_at:'2026-10-23T11:00:00.000Z'}},
    {comment:{created_at:'2026-10-23T15:10:00.000Z',
      updated_at:'2026-10-23T15:10:00.000Z'}},
    {grantChanges:{d1_uuid:'0'.repeat(36)}},
    {grantChanges:{phase:'bucket'}},{permission:'write'},
    {mainSha:'f'.repeat(40)},{failGate:'worker-tests-2'},
    {check:{app:{slug:'external-app'}}},
    {check:{head_sha:'0'.repeat(40)}},
    {check:{conclusion:'neutral'}},
  ];
  for(const opts of rejected)
    await assert.rejects(check(opts),/FRMS_QA_PREPARE_ADMIN_GRANT_DENIED/);
});
test('strict read-only GitHub API accepts only GET on fixed host without redirects',async()=>{
  const calls=[],token='synthetic-github-secret-do-not-output';
  const fetcher=async(uri,options)=>{
    calls.push({uri,options});
    return new Response(JSON.stringify({commit:{sha:SHA}}),{status:200});
  };
  const api=githubPrepareReadOnlyApi({token,fetcher});
  assert.equal((await api('repos/'+REPO+'/branches/main')).commit.sha,SHA);
  assert.equal(calls.length,1);
  assert.equal(calls[0].uri,'https://api.github.com/repos/'+REPO+'/branches/main');
  assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[0].options.redirect,'manual');
  for(const path of ['https://attacker.test','repos/other/repo/branches/main',
    'repos/'+REPO+'/../evil','repos/'+REPO+'/branch%2f..']){
    await assert.rejects(api(path),/FRMS_QA_PREPARE_ADMIN_GRANT_DENIED/);
  }
  assert.equal(calls.length,1);
  for(const handler of [
    async()=>new Response(null,{status:403}),
    async()=>new Response(null,{status:302,headers:{Location:'https://other.test/'}}),
    async()=>{throw Error('sensitive '+token);},
    async()=>new Response('not json',{status:200}),
  ]){
    await assert.rejects(githubPrepareReadOnlyApi({
      token,fetcher:handler,
    })('repos/'+REPO+'/branches/main'),err=>{
      assert.equal(err.message,'FRMS_QA_PREPARE_ADMIN_GRANT_DENIED');
      assert.equal(err.message.includes(token),false);
      return true;
    });
  }
});
test('grant cannot be substituted with an earlier bucket grant or an Ed25519 apply signature',()=>{
  const old={schema:'AIRTRUST_FRMS_QA_PROVISION_V2',phase:'bucket'};
  assert.throws(()=>assertPrepareGrantBody('AIRTRUST_FRMS_QA_PROVISION_V2\n'+JSON.stringify(old),plan),
    /FRMS_QA_PREPARE_ADMIN_GRANT_DENIED/);
  assert.throws(()=>assertPrepareGrantBody('random signed apply grant',plan),
    /FRMS_QA_PREPARE_ADMIN_GRANT_DENIED/);
});
