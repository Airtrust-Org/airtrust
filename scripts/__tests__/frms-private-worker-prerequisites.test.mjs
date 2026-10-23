import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {inspectPrivateWorkerPrerequisites as inspect} from '../../ops/frms-qa-repair/verify-worker-deployment-prerequisites.mjs';

const key=generateKeyPairSync('ed25519').publicKey.export({format:'pem',type:'spki'});
const valid=()=>({
  CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),
  CLOUDFLARE_FRMS_QA_READ_API_TOKEN:'synthetic-api-token',
  CLOUDFLARE_FRMS_QA_WORKER_DEPLOY_API_TOKEN:'synthetic-deploy-token',
  FRMS_QA_D1_READ_TOKEN:'synthetic-read-token',
  FRMS_QA_CALLER_KEY_HEX:'a'.repeat(64),
  FRMS_QA_PREIMAGE_KEY_HEX:'b'.repeat(64),
  FRMS_QA_APPROVAL_PUBLIC_KEY_PEM:key,
});
test('all supplied fields still require independent signing authority and scope checks',()=>{
  const r=inspect(valid());
  assert.equal(r.verdict,'INPUTS_PRESENT_EXTERNAL_AUTHORIZATION_REQUIRED');
  assert.equal(r.checks.publicApprovalKey,'ED25519_FORMAT_VALID');
  assert.equal(r.checks.runtimeD1ReadToken,'PRESENT_SCOPE_NOT_ATTESTED');
  assert.equal(r.deploymentExecuted,false);
  assert.equal(r.cloudflareWrites,0);
  assert.equal(r.pendingIndependentEvidence.length,4);
});
test('absence of runtime and signing keys is reported without secret values',()=>{
  const e=valid();delete e.FRMS_QA_D1_READ_TOKEN;delete e.FRMS_QA_APPROVAL_PUBLIC_KEY_PEM;
  const r=inspect(e);
  assert.equal(r.verdict,'BLOCKED_MISSING_OR_INVALID_INPUT');
  assert.equal(r.checks.runtimeD1ReadToken,'MISSING');
  assert.equal(r.checks.publicApprovalKey,'MISSING');
  assert.equal(JSON.stringify(r).includes('synthetic'),false);
});
test('non-Ed25519 key and malformed data never count as ready',()=>{
  const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const e={...valid(),FRMS_QA_APPROVAL_PUBLIC_KEY_PEM:publicKey.export({format:'pem',type:'spki'})};
  assert.equal(inspect(e).checks.publicApprovalKey,'INVALID_KEY_TYPE');
  assert.equal(inspect({...e,FRMS_QA_APPROVAL_PUBLIC_KEY_PEM:'bad'}).checks.publicApprovalKey,'INVALID_PEM');
  assert.equal(inspect({...valid(),FRMS_QA_PREIMAGE_KEY_HEX:'short'}).verdict,'BLOCKED_MISSING_OR_INVALID_INPUT');
});
test('a broad pre-existing Worker token does not replace dedicated runtime and signer inputs',()=>{
  const e=valid();
  delete e.FRMS_QA_D1_READ_TOKEN;
  delete e.FRMS_QA_APPROVAL_PUBLIC_KEY_PEM;
  delete e.CLOUDFLARE_FRMS_QA_WORKER_DEPLOY_API_TOKEN;
  e.CLOUDFLARE_WORKER_API_TOKEN='synthetic-broad-worker-token';
  const r=inspect(e);
  assert.equal(r.checks.runtimeD1ReadToken,'MISSING');
  assert.equal(r.checks.workerDeployToken,'MISSING');
  assert.equal(r.checks.publicApprovalKey,'MISSING');
  assert.equal(r.verdict,'BLOCKED_MISSING_OR_INVALID_INPUT');
});

test('caller HMAC and AES preimage keys must be distinct without disclosing either',()=>{
  const e=valid();e.FRMS_QA_PREIMAGE_KEY_HEX=e.FRMS_QA_CALLER_KEY_HEX;
  const r=inspect(e);
  assert.equal(r.checks.keySeparation,'MISSING_OR_NOT_DISTINCT');
  assert.equal(r.verdict,'BLOCKED_MISSING_OR_INVALID_INPUT');
  assert.equal(JSON.stringify(r).includes(e.FRMS_QA_CALLER_KEY_HEX),false);
});
