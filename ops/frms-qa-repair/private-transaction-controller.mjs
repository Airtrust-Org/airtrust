/**
 * Single-run, mutex-scoped F0 prepare -> external Ed25519 signer -> apply ->
 * independent readback protocol. INACTIVE until a protected GitHub Actions
 * wrapper supplies a verified private Queue client, independent signing
 * adapter and staging read-only QA adapter. None is created by this module.
 *
 * The GitHub concurrency mutex MUST surround this entire awaited call.
 * Never split these phases across independent dispatches/Jobs.
 * No automatic replay of Queue publish or D1 apply, even on ambiguous result.
 */
import {createHash,createPublicKey,verify as verifySignature} from 'node:crypto';
import {TARGET} from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';
import {exactApplyGrantPlan} from './verify-apply-admin-grant.mjs';

const REPO='Airtrust-Org/airtrust',WORKFLOW=
  '.github/workflows/staging-frms-qa-private-transaction.yml';
const SHA=/^[a-f0-9]{40}$/,HEX64=/^[a-f0-9]{64}$/,GRANT=/^[1-9][0-9]{5,13}$/;
const DENIED='FRMS_QA_PRIVATE_TRANSACTION_DENIED';
const fail=()=>{throw Error(DENIED);};
const match=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&
  Object.keys(x).sort().join('|')===keys.slice().sort().join('|');
const fingerprint=key=>createHash('sha256').update(
  key.export({format:'der',type:'spki'})).digest('hex');
const receiptHash=receipt=>createHash('sha256').update(
  JSON.stringify(receipt)).digest('hex');
const requestCorrelation=(message,operation)=>{
  if(!message||!match(message,['schema','sha','dbId','tenantId','grantId',
    'runId','runAttempt','issuedAt','expiresAt','callerAuth',
    'payloadEnvelope','mac'])||message.schema!==
      'AIRTRUST_FRMS_QA_QUEUE_'+operation.toUpperCase()+'_V1'||
     message.tenantId!==999013||message.dbId!==TARGET.db_id||
     !GRANT.test(message.grantId||'')||
     !HEX64.test(message.callerAuth?.claims?.nonce||''))fail();
  return Object.freeze({
    operation,sha:message.sha,runId:String(message.runId),
    runAttempt:message.runAttempt,grantId:message.grantId,
    requestNonce:message.callerAuth.claims.nonce,
  });
};

export function assertIndependentSignerAnchor({publicKeyPem,publicKeySha256}={}){
  if(typeof publicKeyPem!=='string'||!HEX64.test(publicKeySha256||''))fail();
  let key;
  try{
    key=createPublicKey(publicKeyPem);
    if(key.asymmetricKeyType!=='ed25519'||fingerprint(key)!==publicKeySha256)
      fail();
  }catch{fail();}
  return Object.freeze({fingerprint:publicKeySha256,type:'ed25519'});
}

async function oneReply({queue,keyHex,expected,now,sleep,maxPolls}){
  // HTTP pull is short polling; an empty pull is not a receipt.
  // The reply has a 90-second TTL and the global mutex stays held while
  // polling. Never extend that TTL by waiting for additional attempts.
  const started=now();
  for(let attempt=0;attempt<maxPolls;attempt++){
    const current=now();
    if(!Number.isFinite(current)||current<started-30000||
       current-started>=90000)fail();
    const answer=await queue.consumeExpectedReply({
      keyHex,expected,now:current});
    if(answer!==null&&answer!==undefined)return answer;
    if(attempt+1<maxPolls)await sleep();
  }
  fail();
}

/**
 * Boundary requirements for the caller:
 * - producer.prepare/apply are the exact modules which validate GitHub grants;
 * - queue is privateQueueRunnerApi pinned to account, queue, key and SHA;
 * - signer is a separately attested external authority, NOT Actions or Worker;
 * - readback is read-only, tenant/DB pinned, run from the same lock owner.
 * These dependencies are deliberately absent in production until authorized.
 */
export async function coordinatePrivateF0Transaction({
  env={},publicKeyPem,publicKeySha256,producer,queue,signer,
  readback,now=Date.now,sleep=async()=>{},maxPolls=40,
}={}){
  if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_WORKFLOW_REF!==REPO+'/'+WORKFLOW+'@refs/heads/main'||
     !SHA.test(env.GITHUB_SHA||'')||
     !HEX64.test(env.FRMS_QA_CALLER_KEY_HEX||'')||
     typeof now!=='function'||typeof sleep!=='function'||
     !Number.isSafeInteger(maxPolls)||maxPolls<1||maxPolls>40||
     typeof producer?.prepare!=='function'||typeof producer?.apply!=='function'||
     typeof queue?.pushSigned!=='function'||
     typeof queue?.consumeExpectedReply!=='function'||
     typeof signer?.assertReady!=='function'||typeof signer?.signReceipt!=='function'||
     typeof readback!=='function')fail();
  assertIndependentSignerAnchor({publicKeyPem,publicKeySha256});
  // An independent remote signer must be READY *before* prepare can create
  // a private R2 preimage; never create orphan preimages awaiting authority.
  const readiness=await signer.assertReady({sha:env.GITHUB_SHA,
    publicKeySha256,scope:'FRMS_QA_999013_4_CASES_4_JOURNEYS'});
  if(!match(readiness,['status','sha','publicKeySha256'])||
     readiness.status!=='INDEPENDENT_SIGNER_READY'||
     readiness.sha!==env.GITHUB_SHA||
     readiness.publicKeySha256!==publicKeySha256)fail();

  // From the first Queue publish onward, UNKNOWN means quarantine, NOT retry.
  const prep=await producer.prepare();
  const prepMatch=requestCorrelation(prep,'prepare');
  if(prepMatch.sha!==env.GITHUB_SHA||
     prepMatch.grantId!==String(env.FRMS_QA_PREPARE_GRANT_ID||''))fail();
  await queue.pushSigned(prep);
  const receiptReply=await oneReply({queue,keyHex:env.FRMS_QA_CALLER_KEY_HEX,
    expected:prepMatch,now,sleep,maxPolls});
  const {receipt,receiptId}=receiptReply||{};
  if(!receipt||receipt.dbId!==TARGET.db_id||receipt.tenantId!==999013||
     receipt.writes!==0||receipt.environment!=='staging'||
     !HEX64.test(receiptId||'')||receiptHash(receipt)!==receiptId)fail();

  // The signer must return both the signed manifest and the NEW admin apply
  // grant reference created independently *after* seeing this receipt.
  const signed=await signer.signReceipt({
    sha:env.GITHUB_SHA,receipt,receiptId,publicKeySha256});
  if(!match(signed,['manifest','signatureBase64','applyGrantId'])||
     !GRANT.test(String(signed.applyGrantId||'')))fail();
  const {manifest,signatureBase64}=signed;
  exactApplyGrantPlan({sha:env.GITHUB_SHA,manifest,
    receiptId,signatureBase64});
  if(manifest.preimageSha256!==receipt.preimageSha256||
     manifest.artifactSha256!==receipt.artifactSha256||
     manifest.recoveryBookmark!==receipt.recoveryBookmark)fail();
  let trustedSignature;
  try{
    trustedSignature=verifySignature(null,Buffer.from(JSON.stringify(manifest)),
      publicKeyPem,Buffer.from(signatureBase64,'base64'));
  }catch{fail();}
  if(trustedSignature!==true)fail();

  // producer.apply MUST independently GET-verify the fresh exact admin grant;
  // the independent Ed25519 signature does not replace GitHub authorization.
  const application=await producer.apply({
    manifest,receiptId,signatureBase64,
    applyGrantId:String(signed.applyGrantId)});
  const applyMatch=requestCorrelation(application,'apply');
  if(applyMatch.sha!==env.GITHUB_SHA||
     applyMatch.grantId!==String(signed.applyGrantId))fail();
  await queue.pushSigned(application);
  const applied=await oneReply({queue,keyHex:env.FRMS_QA_CALLER_KEY_HEX,
    expected:applyMatch,now,sleep,maxPolls});
  if(applied?.status!=='APPLY_VALIDATED'||applied.valid!==4||
     applied.updatedRows!==8)fail();

  // Queue confirmation alone is never independent physical D1 readback.
  const final=await readback({sha:env.GITHUB_SHA,dbId:TARGET.db_id,
    tenantId:999013,expectedValid:4});
  if(!match(final,['verdict','valid','writes','tenantId','dbId','sha'])||
     final.verdict!=='READONLY_ACCEPTANCE_READY'||final.valid!==4||
     final.writes!==0||final.tenantId!==999013||
     final.dbId!==TARGET.db_id||final.sha!==env.GITHUB_SHA)fail();
  return Object.freeze({verdict:'STAGING_FRMS_F0_4_OF_4_READONLY_VERIFIED',
    valid:4,updatedRows:8,sha:env.GITHUB_SHA,tenantId:999013,
    productionAuthorized:false});
}
