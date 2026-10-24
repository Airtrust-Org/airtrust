// Synthetic external signer/OIDC exchange. Never creates an approval key or
// sends real receipts, data, tokens, grants or Queue messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {independentFrmsSigner as create} from
  '../../ops/frms-qa-repair/external-approval-signer.mjs';
import {validatePrivateTransactionEntry as validate} from
  '../../ops/frms-qa-repair/run-protected-private-transaction.mjs';

const REPO='Airtrust-Org/airtrust',SHA='a'.repeat(40);
const PIN='b'.repeat(64),KEY='c'.repeat(64),GRANT='6374255192';
const HOST='https://signer.airtrust.example.com';
const hash=x=>createHash('sha256').update(x).digest('hex');
const OIDC_URL='https://pipelines.actions.githubusercontent.com/abc/token';
const env={
  GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_REPOSITORY:REPO,GITHUB_REF:'refs/heads/main',
  GITHUB_WORKFLOW_REF:REPO+
    '/.github/workflows/staging-frms-qa-private-transaction.yml@refs/heads/main',
  GITHUB_SHA:SHA,GITHUB_TOKEN:'synthetic-github-job-token',
  GITHUB_JOB:'frms-queue-apply',GITHUB_OUTPUT:'/tmp/synthetic-github-output',
  GITHUB_RUN_ID:'40019815631',GITHUB_RUN_ATTEMPT:'1',
  FRMS_QA_CALLER_KEY_HEX:KEY,
  FRMS_QA_PREPARE_GRANT_ID:GRANT,
  FRMS_QA_PREPARE_EXPECTED_SHA:SHA,
  FRMS_QA_PREPARE_CONFIRM:'AIRTRUST_FRMS_QA_PREPARE_ONLY_F0_APPROVED',
  FRMS_QA_TRANSACTION_PHASE:'queue-apply',
  CLOUDFLARE_ACCOUNT_ID:'e'.repeat(32),
  CLOUDFLARE_WORKER_API_TOKEN:'existing-worker-token-synthetic',
  FRMS_QA_APPROVAL_PUBLIC_KEY_PEM:'synthetic-non-operational-pem',
  FRMS_QA_APPROVAL_PUBLIC_KEY_SHA256:PIN,
  FRMS_QA_SIGNER_ORIGIN:HOST,FRMS_QA_SIGNER_ORIGIN_SHA256:hash(HOST),
  ACTIONS_ID_TOKEN_REQUEST_URL:OIDC_URL,
  ACTIONS_ID_TOKEN_REQUEST_TOKEN:'ephemeral-job-oidc-request',
};
const receipt={environment:'staging',tenantId:999013,writes:0,
  recoveryBookmark:'secret-not-output',preimageSha256:'f'.repeat(64)};
function fake({redirect=false,denyOidc=false,denySigner=false}={}){
  const calls=[];
  const fetcher=async(url,opts)=>{
    calls.push({url,method:opts.method,body:opts.body,
      auth:opts.headers.Authorization});
    if(url.startsWith(OIDC_URL)){
      assert.equal(opts.method,'GET');
      assert.equal(new URL(url).searchParams.get('audience'),
        'airtrust-frms-qa-signing-staging');
      assert.equal(opts.headers.Authorization,
        'Bearer '+env.ACTIONS_ID_TOKEN_REQUEST_TOKEN);
      if(denyOidc)return {status:403,redirected:false};
      return {status:200,redirected:false,json:async()=>({value:'a.b.c'})};
    }
    assert.ok(url.startsWith(HOST+'/api/frms-qa/v1/'));
    assert.equal(opts.method,'POST');
    assert.equal(opts.headers.Authorization,'Bearer a.b.c');
    if(denySigner)return {status:403,redirected:false};
    if(redirect)return {status:302,redirected:true};
    if(url.endsWith('/ready'))return {status:200,redirected:false,
      json:async()=>({status:'INDEPENDENT_SIGNER_READY',
        sha:SHA,publicKeySha256:PIN})};
    if(url.endsWith('/sign'))return {status:200,redirected:false,
      json:async()=>({manifest:{sha:SHA},
        signatureBase64:Buffer.alloc(64,7).toString('base64'),
        applyGrantId:GRANT})};
    throw Error('Unexpected destination');
  };
  return {calls,fetcher};
}
test('entrypoint requires exact workflow/main/grant and all independent inputs',()=>{
  assert.equal(validate(env).productionAuthorized,false);
  for(const bad of [
    {FRMS_QA_PREPARE_GRANT_ID:'0'},
    {GITHUB_REF:'refs/heads/preview'},
    {FRMS_QA_PREPARE_EXPECTED_SHA:'d'.repeat(40)},
    {FRMS_QA_PREPARE_CONFIRM:'approved'},
    {FRMS_QA_SIGNER_ORIGIN:''},
    {FRMS_QA_APPROVAL_PUBLIC_KEY_PEM:''},
    {CLOUDFLARE_WORKER_API_TOKEN:''},
    {CLOUDFLARE_D1_MIGRATION_API_TOKEN:'forbidden-cross-scope'},
    {FRMS_QA_TRANSACTION_PHASE:'not-queue-apply'},
    {GITHUB_WORKFLOW_REF:'Airtrust-Org/airtrust/.github/workflows/other.yml@refs/heads/main'},
    {ACTIONS_ID_TOKEN_REQUEST_TOKEN:''},
    {FRMS_QA_APPROVAL_PRIVATE_KEY_PEM:'forbidden'},
    {FRMS_QA_D1_READ_TOKEN:'forbidden'},
  ]){
    assert.throws(()=>validate({...env,...bad}),
      /FRMS_QA_TRANSACTION_ENTRY_DENIED/);
  }
});
test('signer uses only GitHub OIDC and fixed HTTPS ready/sign endpoints',async()=>{
  const f=fake(),signer=create({env,fetcher:f.fetcher});
  const ready=await signer.assertReady({sha:SHA,publicKeySha256:PIN,
    scope:'FRMS_QA_999013_4_CASES_4_JOURNEYS'});
  assert.equal(ready.status,'INDEPENDENT_SIGNER_READY');
  const result=await signer.signReceipt({sha:SHA,receipt,
    receiptId:'8'.repeat(64),publicKeySha256:PIN});
  assert.equal(result.applyGrantId,GRANT);
  assert.deepEqual(f.calls.map(c=>c.method),['GET','POST','GET','POST']);
  assert.ok(f.calls[1].url.endsWith('/ready'));
  assert.ok(f.calls[3].url.endsWith('/sign'));
  const combined=JSON.stringify({ready,result});
  assert.equal(combined.includes(env.GITHUB_TOKEN),false);
  assert.equal(combined.includes(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN),false);
  assert.equal(combined.includes(receipt.recoveryBookmark),false);
});
test('no arbitrary endpoint or missing origin pin can be used as signer',()=>{
  for(const origin of ['http://signer.airtrust.example.com',
    'https://127.0.0.1','https://localhost','https://signer.local',
    'https://signer.airtrust.example.com:8443',
    'https://user:pass@signer.airtrust.example.com',
    'https://signer.airtrust.example.com/path',
    'https://signer.airtrust.example.com?token=bad']){
    assert.throws(()=>create({env:{...env,FRMS_QA_SIGNER_ORIGIN:origin,
      FRMS_QA_SIGNER_ORIGIN_SHA256:hash(origin)}}),
      /FRMS_QA_EXTERNAL_SIGNER_DENIED/);
  }
  assert.throws(()=>create({env:{
    ...env,FRMS_QA_SIGNER_ORIGIN_SHA256:'0'.repeat(64)}}),
    /FRMS_QA_EXTERNAL_SIGNER_DENIED/);
});
test('OIDC denial, signer failure or redirect cannot return an approval',async()=>{
  for(const bad of [{denyOidc:true},{denySigner:true},{redirect:true}]){
    const f=fake(bad),signer=create({env,fetcher:f.fetcher});
    await assert.rejects(signer.assertReady({
      sha:SHA,publicKeySha256:PIN,
      scope:'FRMS_QA_999013_4_CASES_4_JOURNEYS'}),
      /FRMS_QA_EXTERNAL_SIGNER_DENIED/);
    assert.equal(f.calls.some(c=>c.url.endsWith('/sign')),false);
  }
});
test('single-run workflow holds staging mutex and never exposes an inline private signing key',()=>{
  const yaml=readFileSync(new URL('../../.github/workflows/staging-frms-qa-private-transaction.yml',
    import.meta.url),'utf8');
  assert.match(yaml,/workflow_dispatch:/);
  assert.match(yaml,/group: airtrust-staging-mutations-and-scorm-qa/);
  assert.match(yaml,/cancel-in-progress: false/);
  assert.match(yaml,/environment: staging/);
  assert.match(yaml,/id-token: write/);
  assert.match(yaml,/FRMS_QA_PREPARE_GRANT_ID:.*inputs.prepare_grant_id/);
  assert.match(yaml,/FRMS_QA_PREPARE_EXPECTED_SHA:.*inputs.expected_main_sha/);
  assert.match(yaml,/node ops\/frms-qa-repair\/run-protected-private-transaction.mjs/);
  assert.doesNotMatch(yaml,/FRMS_QA_APPROVAL_PRIVATE_KEY_PEM:/);
  assert.doesNotMatch(yaml,/\b(?:d1 execute|wrangler deploy --env production)\b/);
  assert.equal((yaml.match(/\n  frms-(?:queue-apply|d1-readonly-postcondition):\n/g)||[]).length,2);
  assert.match(yaml,/needs: \[frms-queue-apply\]/);
  assert.match(yaml,/apply_validation:.*steps.queue_apply.outputs.apply_validation/);
  assert.match(yaml,/FRMS_QA_APPLY_STAGE_RESULT:.*needs.frms-queue-apply.outputs.apply_validation/);
  assert.match(yaml,/run: node ops\/frms-qa-repair\/run-protected-private-d1-readback.mjs/);
  // A Worker token and D1 migration token must never coexist on one runner.
  const queueJob=yaml.split('  frms-queue-apply:')[1].split('  frms-d1-readonly-postcondition:')[0];
  const d1Job=yaml.split('  frms-d1-readonly-postcondition:')[1];
  assert.match(queueJob,/secrets.CLOUDFLARE_WORKER_API_TOKEN/);
  assert.doesNotMatch(queueJob,/secrets.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
  assert.match(d1Job,/secrets.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
  assert.doesNotMatch(d1Job,/secrets.CLOUDFLARE_WORKER_API_TOKEN/);
});
test('wrong SHA, public pin, receipt or tenant fails before any OIDC',async()=>{
  const f=fake(),signer=create({env,fetcher:f.fetcher});
  await assert.rejects(signer.assertReady({sha:'0'.repeat(40),
    publicKeySha256:PIN,scope:'FRMS_QA_999013_4_CASES_4_JOURNEYS'}),
    /FRMS_QA_EXTERNAL_SIGNER_DENIED/);
  await assert.rejects(signer.signReceipt({sha:SHA,receipt:{...receipt,tenantId:6},
    receiptId:'8'.repeat(64),publicKeySha256:PIN}),
    /FRMS_QA_EXTERNAL_SIGNER_DENIED/);
  await assert.rejects(signer.signReceipt({sha:SHA,receipt,
    receiptId:'bad',publicKeySha256:PIN}),
    /FRMS_QA_EXTERNAL_SIGNER_DENIED/);
  assert.equal(f.calls.length,0);
});
