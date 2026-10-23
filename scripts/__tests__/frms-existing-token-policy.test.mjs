import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {probeExistingTokenPolicy} from '../../ops/frms-qa-repair/probe-existing-token-policy.mjs';

const account='a'.repeat(32),id='b'.repeat(32),token='SYNTHETIC_BEARER_NEVER_LOG';
const prefix='https://api.cloudflare.com/client/v4/accounts/'+account+'/tokens';
const policy=[{effect:'allow',permission_groups:[{name:'D1 Read',id:'c'.repeat(32)}],
  resources:{['com.cloudflare.api.account.'+account]:'*'}}];
const ok=result=>Response.json({success:true,result});
const denied=()=>Response.json({success:false,errors:[{message:'PRIVATE '+token}]},{status:403});
const run=(options={})=>{
  const calls=[];
  const fetcher=async(uri,params)=>{
    calls.push({uri,method:params.method,redirect:params.redirect,
      authorization:params.headers.Authorization});
    assert.equal(params.method,'GET');
    assert.equal(params.redirect,'manual');
    assert.equal(params.headers.Authorization,'Bearer '+token);
    if(uri===prefix+'/verify')return options.accountVerify===undefined?
      ok({id,status:'active'}):options.accountVerify();
    if(uri===prefix+'/'+id)return options.accountDetails===undefined?
      ok({id,policies:policy}):options.accountDetails();
    if(uri==='https://api.cloudflare.com/client/v4/user/tokens/verify')
      return options.userVerify?options.userVerify():denied();
    if(uri==='https://api.cloudflare.com/client/v4/user/tokens/'+id)
      return options.userDetails?options.userDetails():denied();
    throw Error('unapproved endpoint');
  };
  return {calls,probe:()=>probeExistingTokenPolicy({
    accountId:account,token,kind:'d1_backup',fetcher,
  })};
};

test('exact one-account D1 Read policy is ONLY candidate, not an authorization',async()=>{
  const x=run();
  const out=await x.probe();
  assert.deepEqual(out,{
    verdict:'D1_READ_ONLY_CANDIDATE_REQUIRES_INDEPENDENT_ATTESTATION',
    writes:0,usableForPrivateWorker:false,
  });
  assert.equal(x.calls.length,2);
  assert.ok(x.calls.every(c=>c.method==='GET'));
  assert.equal(JSON.stringify(out).includes(token),false);
  assert.equal(JSON.stringify(out).includes(id),false);
  assert.equal(JSON.stringify(out).includes(account),false);
});

test('D1 Write/Edit, extra Read, or empty groups deny exclusive read-only evidence',async()=>{
  for(const name of ['D1 Write','D1 Edit','Workers Scripts Read','Workers Scripts Write']){
    const x=run({accountDetails:()=>ok({id,policies:[{
      ...policy[0],permission_groups:[{name:'D1 Read'},{name}],
    }]})});
    assert.equal((await x.probe()).verdict,'NON_EXCLUSIVE_D1_READ_POLICY');
  }
  for(const invalid of [[],[{}],[{...policy[0],permission_groups:[]}]]) {
    const x=run({accountDetails:()=>ok({id,policies:invalid})});
    assert.equal((await x.probe()).verdict,'POLICY_NOT_ATTESTED');
  }
});

test('wildcard, foreign or ambiguous account resource never yields narrow scope candidate',async()=>{
  for(const resources of [
    {'com.cloudflare.api.account.*':'*'},
    {['com.cloudflare.api.account.'+'c'.repeat(32)]:'*'},
    {['com.cloudflare.api.account.'+account]:'*','com.cloudflare.api.account.*':'*'},
    {['com.cloudflare.api.account.'+account]:{'*':'*'}},
  ]){
    const x=run({accountDetails:()=>ok({id,policies:[{...policy[0],resources}]})});
    assert.equal((await x.probe()).verdict,'UNVERIFIED_ACCOUNT_RESOURCE_SCOPE');
  }
});

test('unreadable token metadata / failed network remains unknown; no inferred privileges',async()=>{
  for(const details of [
    denied,
    ()=>Response.json({success:false},{status:401}),
    ()=>Response.json({}, {status:404}),
    ()=>Response.json({}, {status:302,headers:{Location:'https://attacker.test/'}}),
    async()=>{throw Error('PRIVATE '+token);},
    ()=>new Response('not json'),
  ]){
    const x=run({accountDetails:details});
    const out=await x.probe();
    assert.equal(out.verdict,'TOKEN_POLICY_METADATA_UNAVAILABLE');
    assert.equal(JSON.stringify(out).includes(token),false);
  }
});

test('inactive token or mismatched details is never accepted',async()=>{
  for(const status of ['disabled','expired']){
    const x=run({accountVerify:()=>ok({id,status})});
    assert.equal((await x.probe()).verdict,'TOKEN_NOT_ACTIVE');
    assert.equal(x.calls.length,1);
  }
  const x=run({accountDetails:()=>ok({id:'f'.repeat(32),policies:policy})});
  assert.equal((await x.probe()).verdict,'TOKEN_POLICY_METADATA_UNAVAILABLE');
});

test('user-owned token fallback uses only verified ID, never untrusted ID or token text',async()=>{
  const x=run({accountVerify:denied,userVerify:()=>ok({id,status:'active'}),
    userDetails:()=>ok({id,policies:policy})});
  assert.equal((await x.probe()).verdict,
    'D1_READ_ONLY_CANDIDATE_REQUIRES_INDEPENDENT_ATTESTATION');
  assert.equal(x.calls.length,3);
  assert.ok(x.calls.every(c=>!c.uri.includes(token)));
  const y=run({accountVerify:denied});
  assert.equal((await y.probe()).verdict,'TOKEN_VERIFY_UNAVAILABLE');
});

test('malformed input makes zero remote requests',async()=>{
  let calls=0;
  for(const fields of [
    {accountId:'*',kind:'worker',token},
    {accountId:account,kind:'pages',token},
    {accountId:account,kind:'d1_backup',token:''},
  ]){
    const res=await probeExistingTokenPolicy({...fields,fetcher:async()=>{calls++;}});
    assert.equal(res.verdict,'INPUTS_NOT_AVAILABLE');
  }
  assert.equal(calls,0);
});

test('existing workflow has no token input nor mutating verbs',()=>{
  const workflow=readFileSync('.github/workflows/staging-frms-existing-token-capabilities.yml','utf8');
  const entry=readFileSync('ops/frms-qa-repair/probe-existing-staging-tokens.mjs','utf8');
  assert.match(workflow,/FRMS_EXISTING_STAGING_READONLY/);
  assert.match(workflow,/expected_main_sha:/);
  assert.match(workflow,/EXPECTED_SHA: \${{ inputs\.expected_main_sha }}/);
  assert.match(workflow,/test "\$GITHUB_SHA" = "\$EXPECTED_SHA"/);
  assert.match(workflow,/gh api repos\/Airtrust-Org\/airtrust\/branches\/main/);
  assert.match(workflow,/environment: staging/);
  assert.match(workflow,/group: airtrust-staging-mutations-and-scorm-qa/);
  assert.match(entry,/probeExistingTokenPolicy/);
  assert.match(entry,/FRMS_STAGING_TOKEN_POLICY_AUTHORIZES_RUNTIME=false/);
  assert.doesNotMatch(workflow,/\b(?:wrangler|secret bulk|git push)\b/);
});
