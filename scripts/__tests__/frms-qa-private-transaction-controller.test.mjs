// Fully synthetic single-run staging transaction. No Queue HTTP, GitHub
// permissions, Cloudflare network, private signer or D1/R2 persistence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {buildReviewPlan} from '../staging/frms-qa-cases-repair-plan.mjs';
import {coordinatePrivateF0Transaction as transact,
  assertIndependentSignerAnchor} from
  '../../ops/frms-qa-repair/private-transaction-controller.mjs';

const SHA='a'.repeat(40),KEY='b'.repeat(64),GRANT='6374211122';
const APPLY_GRANT='6374211133',RUN='40019815631',NONCE1='c'.repeat(64),
  NONCE2='d'.repeat(64);
const DB='bf9963f4-eb12-439b-a830-20bbf577ac22',NOW=Date.parse('2026-10-23T20:00:00Z');
const RECEIPT={environment:'staging',dbId:DB,tenantId:999013,writes:0,
  preimageSha256:'e'.repeat(64),artifactSha256:'f'.repeat(64),
  recoveryBookmark:'synthetic-private-bookmark'};
const RECEIPT_ID=createHash('sha256').update(JSON.stringify(RECEIPT)).digest('hex');
const ids=buildReviewPlan(Array.from({length:30},(_,i)=>({
  day:new Date(Date.parse('2026-09-14T00:00:00Z')+i*86400000).toISOString().slice(0,10),
  jornadas:i===29?'0':'5-9'}))).operations.map(x=>x.id);
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const publicKeyPem=publicKey.export({format:'pem',type:'spki'});
const publicKeySha256=createHash('sha256').update(
  publicKey.export({format:'der',type:'spki'})).digest('hex');
const env={
  GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_REPOSITORY:'Airtrust-Org/airtrust',GITHUB_REF:'refs/heads/main',
  GITHUB_WORKFLOW_REF:'Airtrust-Org/airtrust/.github/workflows/staging-frms-qa-private-transaction.yml@refs/heads/main',
  GITHUB_SHA:SHA,FRMS_QA_CALLER_KEY_HEX:KEY,FRMS_QA_PREPARE_GRANT_ID:GRANT,
};
const message=(operation,grantId,nonce)=>({
  schema:'AIRTRUST_FRMS_QA_QUEUE_'+operation.toUpperCase()+'_V1',
  sha:SHA,dbId:DB,tenantId:999013,grantId,runId:RUN,runAttempt:1,
  issuedAt:new Date(NOW).toISOString(),expiresAt:new Date(NOW+90000).toISOString(),
  callerAuth:{claims:{nonce}},payloadEnvelope:{version:1},
  mac:'1'.repeat(64),
});
function manifest(receipt=RECEIPT,receiptId=RECEIPT_ID){
  return {
    authority:'AIRTRUST_RELEASE_COORDINATION',coordinationIssue:776,
    scope:'FRMS_QA_999013_4_CASES_4_JOURNEYS',sha:SHA,environment:'staging',
    dbId:DB,tenantId:999013,
    planSha256:'38a81ed05821919d87b424ddfc7b731bfc8d7d759dadebbb6a21d11edb349ed3',
    authorizedIds:ids,receiptSha256:receiptId,
    preimageSha256:receipt.preimageSha256,artifactSha256:receipt.artifactSha256,
    recoveryBookmark:receipt.recoveryBookmark,nonce:'2'.repeat(64),
    issuedAt:new Date(NOW).toISOString(),expiresAt:new Date(NOW+300000).toISOString(),
  };
}
const signManifest=m=>sign(null,Buffer.from(JSON.stringify(m)),privateKey).toString('base64');
function fixture(changes={}){
  const calls=[];
  const receipt={...RECEIPT,...changes.receipt};
  const receiptId=changes.receiptId||createHash('sha256').update(
    JSON.stringify(receipt)).digest('hex');
  const signBody=manifest(receipt,receiptId);
  const {signerReady,signReturn,applyReturn,readbackReturn,replyReturn}=changes;
  const signer={
    assertReady:async()=>{calls.push('signer-ready');
      return signerReady===undefined?{status:'INDEPENDENT_SIGNER_READY',
        sha:SHA,publicKeySha256}:signerReady;},
    signReceipt:async()=>{calls.push('external-sign');
      return signReturn===undefined?{manifest:signBody,
        signatureBase64:signManifest(signBody),applyGrantId:APPLY_GRANT}:signReturn;},
  };
  const producer={
    prepare:async()=>{calls.push('verify-prepare-grant');return message('prepare',GRANT,NONCE1);},
    apply:async({applyGrantId})=>{calls.push('verify-apply-grant');
      assert.equal(applyGrantId,APPLY_GRANT);
      return applyReturn||message('apply',APPLY_GRANT,NONCE2);},
  };
  const queue={
    pushSigned:async(m)=>{calls.push('queue-push:'+m.schema.split('_').at(-2));},
    consumeExpectedReply:async({expected})=>{
      calls.push('queue-pull:'+expected.operation);
      if(replyReturn!==undefined)return replyReturn;
      return expected.operation==='prepare'?
        {receipt,receiptId}:{status:'APPLY_VALIDATED',valid:4,updatedRows:8};
    },
  };
  const readback=async()=>{calls.push('independent-readonly-4of4');
    return readbackReturn===undefined?
      {verdict:'READONLY_ACCEPTANCE_READY',valid:4,writes:0,
        tenantId:999013,dbId:DB,sha:SHA}:readbackReturn;};
  return {calls,signer,producer,queue,readback};
}
async function run(f,changes={}){
  return transact({env:{...env,...changes.env},publicKeyPem,
    publicKeySha256,producer:f.producer,queue:f.queue,signer:f.signer,
    readback:f.readback,now:()=>NOW,maxPolls:1,...changes.options});
}
test('independent public key is Ed25519 and exact SPKI SHA pinned',()=>{
  assert.equal(assertIndependentSignerAnchor({publicKeyPem,publicKeySha256}).type,'ed25519');
  assert.throws(()=>assertIndependentSignerAnchor({
    publicKeyPem,publicKeySha256:'0'.repeat(64)}),
  /FRMS_QA_PRIVATE_TRANSACTION_DENIED/);
});
test('single awaited run retains order from prepare to independent 4/4 readback',async()=>{
  const f=fixture(),r=await run(f);
  assert.deepEqual(f.calls,[
    'signer-ready','verify-prepare-grant','queue-push:PREPARE','queue-pull:prepare',
    'external-sign','verify-apply-grant','queue-push:APPLY','queue-pull:apply',
    'independent-readonly-4of4',
  ]);
  assert.deepEqual(r,{verdict:'STAGING_FRMS_F0_4_OF_4_READONLY_VERIFIED',
    valid:4,updatedRows:8,sha:SHA,tenantId:999013,productionAuthorized:false});
  assert.equal(JSON.stringify(r).includes(RECEIPT.recoveryBookmark),false);
});
test('missing independent signer readiness blocks before any Queue push or preimage',async()=>{
  const f=fixture({signerReady:{status:'UNAVAILABLE',sha:SHA,publicKeySha256}});
  await assert.rejects(run(f),/FRMS_QA_PRIVATE_TRANSACTION_DENIED/);
  assert.deepEqual(f.calls,['signer-ready']);
});
test('bad runner/branch, wrong pin, unexpected workflow or missing signer blocks',async()=>{
  for(const bad of [
    {env:{GITHUB_REF:'refs/heads/dev'}},
    {env:{GITHUB_WORKFLOW_REF:'Airtrust-Org/airtrust/.github/workflows/other.yml@refs/heads/main'}},
    {env:{FRMS_QA_CALLER_KEY_HEX:''}},
    {options:{publicKeySha256:'0'.repeat(64)}},
    {options:{signer:null}},
    {options:{maxPolls:1000}},
  ]){
    const f=fixture();
    await assert.rejects(run(f,bad),/FRMS_QA_PRIVATE_TRANSACTION_DENIED/);
    assert.equal(f.calls.length,0);
  }
});
test('invalid signed manifest cannot publish any apply message',async()=>{
  const changed=manifest();
  changed.receiptSha256='0'.repeat(64);
  const f=fixture({signReturn:{manifest:changed,signatureBase64:signManifest(changed),
    applyGrantId:APPLY_GRANT}});
  await assert.rejects(run(f),/FRMS_QA_APPLY_ADMIN_GRANT_DENIED|FRMS_QA_PRIVATE_TRANSACTION_DENIED/);
  assert.deepEqual(f.calls.slice(-1),['external-sign']);
});
test('tampered signature and signer grant mismatch fail before apply',async()=>{
  const m=manifest();
  for(const signReturn of [
    {manifest:m,signatureBase64:Buffer.alloc(64).toString('base64'),
      applyGrantId:APPLY_GRANT},
    {manifest:m,signatureBase64:signManifest(m),applyGrantId:'0'},
  ]){
    const f=fixture({signReturn});
    await assert.rejects(run(f),/FRMS_QA_PRIVATE_TRANSACTION_DENIED/);
    assert.equal(f.calls.includes('verify-apply-grant'),false);
  }
});
test('Queue missing reply never retries a message nor starts apply',async()=>{
  const f=fixture({replyReturn:null});
  await assert.rejects(run(f),/FRMS_QA_PRIVATE_TRANSACTION_DENIED/);
  assert.deepEqual(f.calls,[
    'signer-ready','verify-prepare-grant','queue-push:PREPARE','queue-pull:prepare',
  ]);
});
test('reported Queue apply validation is insufficient when physical readback fails',async()=>{
  const f=fixture({readbackReturn:{verdict:'READONLY_ACCEPTANCE_READY',
    valid:3,writes:0,tenantId:999013,dbId:DB,sha:SHA}});
  await assert.rejects(run(f),/FRMS_QA_PRIVATE_TRANSACTION_DENIED/);
  assert.equal(f.calls.at(-1),'independent-readonly-4of4');
});
