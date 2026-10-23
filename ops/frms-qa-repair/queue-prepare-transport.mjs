/**
 * Inactive staging transport contract. The ONLY real producer is a protected
 * GitHub runner after independent authenticated F0 grant verification.
 * A queue message is not an admin grant by itself; its HMAC attests the
 * trusted runner, not Cloudflare permission or authority to deploy.
 * No Cloudflare API calls, HTTP repair routes, D1/R2 writes or deployment here.
 */
import {createCipheriv,createDecipheriv,createHmac,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {githubPrepareReadOnlyApi,verifyPrepareAdminGrant} from './verify-prepare-admin-grant.mjs';
import {signPrivateCaller,authorizePrivateCaller} from './caller-auth.mjs';
import {durablePrepareGrantLedger} from './durable-prepare-grant-ledger.mjs';
import {deriveRecoveryBridgeKey} from './recovery-handoff-prototype.mjs';
import {captureTrustedRunnerRecoveryHandoff} from './trusted-runner-bookmark-acquisition.mjs';
import {TARGET} from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';

const QUEUE_SCHEMA='AIRTRUST_FRMS_QA_QUEUE_PREPARE_V1';
const SHA=/^[a-f0-9]{40}$/,HEX64=/^[a-f0-9]{64}$/,GRANT=/^[1-9][0-9]{5,13}$/;
const deny=()=>{throw Error('FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED');};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).sort().join('|')===keys.slice().sort().join('|');
const digest=(hex,body)=>createHmac('sha256',Buffer.from(hex,'hex'))
  .update(JSON.stringify(body)).digest('hex');
const payloadKey=hex=>createHmac('sha256',Buffer.from(hex,'hex'))
  .update('AIRTRUST_FRMS_QA_QUEUE_PAYLOAD_AES_GCM_V1').digest();
const sealPayload=(hex,value)=>{
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',payloadKey(hex),iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
  return {version:1,iv:iv.toString('base64'),
    ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
};
const openPayload=(hex,envelope)=>{
  if(!exact(envelope,['version','iv','ciphertext','tag'])||envelope.version!==1)deny();
  const iv=Buffer.from(envelope.iv,'base64'),ciphertext=Buffer.from(envelope.ciphertext,'base64'),
    tag=Buffer.from(envelope.tag,'base64');
  if(iv.length!==12||!ciphertext.length||tag.length!==16||
     iv.toString('base64')!==envelope.iv||ciphertext.toString('base64')!==envelope.ciphertext||
     tag.toString('base64')!==envelope.tag)deny();
  try{
    const decipher=createDecipheriv('aes-256-gcm',payloadKey(hex),iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8'));
  }catch{deny();}
};
const DATA_FIELDS=['schema','sha','dbId','tenantId','grantId','runId',
  'runAttempt','issuedAt','expiresAt','callerAuth','payloadEnvelope'];
const APPLY_SCHEMA='AIRTRUST_FRMS_QA_QUEUE_APPLY_V1';
const APPLY_FIELDS=['schema','sha','dbId','tenantId','grantId','runId',
  'runAttempt','issuedAt','expiresAt','callerAuth','payloadEnvelope'];
const APPLY_PAYLOAD_FIELDS=['manifest','receiptId','signatureBase64','recoveryProof'];
const MANIFEST_FIELDS=['authority','coordinationIssue','scope','sha',
  'environment','dbId','tenantId','planSha256','authorizedIds',
  'receiptSha256','preimageSha256','artifactSha256','recoveryBookmark',
  'nonce','issuedAt','expiresAt'];

/** Runner-owned GitHub token is NEVER forwarded to the queue or Worker. */
export async function createTrustedQueuePrepareMessage({env={},fetcher=fetch,now=Date.now()}={}){
  const key=env.FRMS_QA_CALLER_KEY_HEX;
  if(!HEX64.test(key||'')||typeof env.GITHUB_TOKEN!=='string'||
    !env.GITHUB_TOKEN.trim()||!Number.isFinite(now))deny();
  try{
    const api=githubPrepareReadOnlyApi({token:env.GITHUB_TOKEN,fetcher});
    const verified=await verifyPrepareAdminGrant({env,api,now});
    if(verified.status!=='VERIFIED_BY_INDEPENDENT_GITHUB_ADMIN_CHECK'||
       verified.sha!==env.GITHUB_SHA||verified.dbId!==TARGET.db_id||
       verified.tenantId!==999013||!GRANT.test(String(verified.grantId)))deny();
    const issuedAt=new Date(now).toISOString();
    const expiresAt=new Date(now+90000).toISOString();
    const callerAuth=signPrivateCaller({keyHex:key,operation:'prepare',
      sha:verified.sha,runId:verified.runId,
      runAttempt:verified.runAttempt,now:new Date(now)});
    const recoveryProof=await captureTrustedRunnerRecoveryHandoff({
      accountId:env.CLOUDFLARE_ACCOUNT_ID,
      apiToken:env.CLOUDFLARE_WORKER_API_TOKEN,
      bridgeKeyHex:deriveRecoveryBridgeKey(key),callerKeyHex:key,
      callerNonce:callerAuth.claims.nonce,operation:'prepare',
      releaseSha:verified.sha,runId:verified.runId,
      runAttempt:verified.runAttempt,now:new Date(now),fetcher,
    });
    const body={schema:QUEUE_SCHEMA,sha:verified.sha,dbId:TARGET.db_id,
      tenantId:999013,grantId:String(verified.grantId),
      runId:verified.runId,runAttempt:verified.runAttempt,
      issuedAt,expiresAt,callerAuth,
      payloadEnvelope:sealPayload(key,{recoveryProof})};
    return Object.freeze({...body,mac:digest(key,body)});
  }catch{deny();}
}

/** Build an apply capability only after an independent authority has signed
 * the exact prepare receipt. The private key and GitHub token never travel. */
export async function createTrustedQueueApplyMessage({env={},manifest,receiptId,
  signatureBase64,fetcher=fetch,now=Date.now()}={}){
  const key=env.FRMS_QA_CALLER_KEY_HEX;
  const grantId=String(env.FRMS_QA_APPLY_GRANT_ID||'');
  const runId=String(env.GITHUB_RUN_ID||'');
  const runAttempt=Number(env.GITHUB_RUN_ATTEMPT);
  if(!HEX64.test(key||'')||!SHA.test(env.GITHUB_SHA||'')||
    !/^[0-9a-f]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID||'')||
    typeof env.CLOUDFLARE_WORKER_API_TOKEN!=='string'||
    !env.CLOUDFLARE_WORKER_API_TOKEN.trim()||
    !/^[1-9][0-9]{5,13}$/.test(grantId)||
    !/^[1-9][0-9]{7,13}$/.test(runId)||
    !Number.isSafeInteger(runAttempt)||runAttempt<1||
    !HEX64.test(receiptId||'')||!Number.isFinite(now)||
    !exact(manifest,MANIFEST_FIELDS)||
    manifest.authority!=='AIRTRUST_RELEASE_COORDINATION'||
    manifest.coordinationIssue!==776||
    manifest.scope!=='FRMS_QA_999013_4_CASES_4_JOURNEYS'||
    manifest.sha!==env.GITHUB_SHA||manifest.environment!=='staging'||
    manifest.dbId!==TARGET.db_id||manifest.tenantId!==999013||
    manifest.planSha256!=='38a81ed05821919d87b424ddfc7b731bfc8d7d759dadebbb6a21d11edb349ed3'||
    !Array.isArray(manifest.authorizedIds)||manifest.authorizedIds.length!==8||
    !HEX64.test(manifest.receiptSha256||'')||
    !HEX64.test(manifest.preimageSha256||'')||
    !HEX64.test(manifest.artifactSha256||'')||
    !/^[A-Za-z0-9-]{1,160}$/.test(manifest.recoveryBookmark||'')||
    !HEX64.test(manifest.nonce||'')||manifest.receiptSha256!==receiptId)deny();
  const issued=Date.parse(manifest.issuedAt),expires=Date.parse(manifest.expiresAt);
  const signature=Buffer.from(String(signatureBase64||''),'base64');
  if(!Number.isFinite(issued)||!Number.isFinite(expires)||
    expires<=issued||expires-issued>900000||now<issued-60000||now>expires||
    signature.length!==64||signature.toString('base64')!==signatureBase64)deny();
  const issuedAt=new Date(now).toISOString();
  const expiresAt=new Date(now+90000).toISOString();
  const callerAuth=signPrivateCaller({keyHex:key,operation:'apply',
    sha:env.GITHUB_SHA,runId,runAttempt,now:new Date(now)});
  const recoveryProof=await captureTrustedRunnerRecoveryHandoff({
    accountId:env.CLOUDFLARE_ACCOUNT_ID,
    apiToken:env.CLOUDFLARE_WORKER_API_TOKEN,
    bridgeKeyHex:deriveRecoveryBridgeKey(key),callerKeyHex:key,
    callerNonce:callerAuth.claims.nonce,operation:'apply',
    releaseSha:env.GITHUB_SHA,runId,runAttempt,now:new Date(now),fetcher,
  });
  const body={schema:APPLY_SCHEMA,sha:env.GITHUB_SHA,dbId:TARGET.db_id,
    tenantId:999013,grantId,runId,runAttempt,issuedAt,expiresAt,callerAuth,
    payloadEnvelope:sealPayload(key,{manifest,receiptId,signatureBase64,recoveryProof})};
  return Object.freeze({...body,mac:digest(key,body)});
}

/** Queue consumer must run behind a private Cloudflare service binding. */
export async function consumeTrustedQueuePrepare({message,env={},storage,binding,
  responseQueue,now=Date.now()}={}){
  const key=env.CALLER_KEY_HEX;
  if(env.ENVIRONMENT!=='staging'||env.D1_ID!==TARGET.db_id||
     !SHA.test(env.RELEASE_SHA||'')||!HEX64.test(key||'')||
     createHash('sha256').update(Buffer.from(key,'hex')).digest('hex')!==
       env.CALLER_KEY_SHA256||
     !storage||typeof storage.transaction!=='function'||
     !binding||typeof binding.prepare!=='function'||
     (env.REQUIRE_PRIVATE_RESPONSE==='true'&&typeof responseQueue?.send!=='function')||
     !Number.isFinite(now))deny();
  if(!exact(message,[...DATA_FIELDS,'mac'])||
     !HEX64.test(message.mac||''))deny();
  const body=Object.fromEntries(DATA_FIELDS.map(k=>[k,message[k]]));
  let payload;
  try{payload=openPayload(key,body.payloadEnvelope);}catch{deny();}
  if(!exact(payload,['recoveryProof']))deny();
  const recoveryProof=payload?.recoveryProof;
  const expected=Buffer.from(digest(key,body),'hex');
  const actual=Buffer.from(message.mac,'hex');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))deny();
  const from=Date.parse(body.issuedAt),to=Date.parse(body.expiresAt);
  if(body.schema!==QUEUE_SCHEMA||body.sha!==env.RELEASE_SHA||
    body.dbId!==TARGET.db_id||body.tenantId!==999013||
    !GRANT.test(body.grantId)||!Number.isSafeInteger(body.runAttempt)||
    body.runAttempt<1||typeof body.runId!=='string'||
    body.runId!==body.callerAuth?.claims?.runId||
    body.runAttempt!==body.callerAuth?.claims?.runAttempt||
    body.sha!==body.callerAuth?.claims?.sha||
    body.callerAuth?.claims?.operation!=='prepare'||
    recoveryProof?.claims?.operation!=='prepare'||
    recoveryProof?.claims?.callerNonce!==body.callerAuth?.claims?.nonce||
    recoveryProof?.claims?.releaseSha!==body.sha||
    recoveryProof?.claims?.runId!==body.runId||
    recoveryProof?.claims?.runAttempt!==body.runAttempt||
    !Number.isFinite(from)||!Number.isFinite(to)||to-from!==90000||
    now<from-30000||now>to)deny();
  // The private caller DO must be ONE consistent instance for every run.
  // Both nonce and grant are reserved durably before invoking REPAIR.
  try{
    await authorizePrivateCaller({auth:body.callerAuth,operation:'prepare',
      env,storage,now:new Date(now)});
    const ledger=durablePrepareGrantLedger(storage);
    const grantKey='frms-qa-prepare-grant:'+body.sha+':'+body.grantId;
    const acquired=await ledger.transaction(async tx=>{
      if((await tx.get(grantKey))!==undefined)return false;
      await tx.put(grantKey,{sha:body.sha,phase:'prepare',
        runId:body.runId,runAttempt:body.runAttempt});
      return true;
    });
    if(acquired!==true)deny();
    const outcomeKey='outcome:'+grantKey;
    let status='INDETERMINATE';
    try{
      const response=await binding.prepare({callerAuth:body.callerAuth,recoveryProof});
      if(!response||!HEX64.test(response.receiptId||'')||
        response.receipt?.dbId!==TARGET.db_id||
        response.receipt?.tenantId!==999013||response.receipt?.writes!==0)
        deny();
      if(responseQueue?.send){
        const reply={schema:'AIRTRUST_FRMS_QA_PRIVATE_REPLY_V1',operation:'prepare',
          sha:body.sha,grantId:body.grantId,runId:body.runId,
          runAttempt:body.runAttempt,requestNonce:body.callerAuth.claims.nonce,
          payloadEnvelope:sealPayload(key,{receiptId:response.receiptId,
            receipt:response.receipt})};
        await responseQueue.send({...reply,mac:digest(key,reply)},
          {contentType:'json'});
      }
      status='RECEIPT_VALIDATED';
    }finally{
      // Never persist the recovery bookmark, encrypted preimage or raw receipt.
      await storage.put(outcomeKey,{status,sha:body.sha,grantId:body.grantId,
        runId:body.runId,runAttempt:body.runAttempt});
    }
    // Even a valid RPC is not a physical independent staging readback.
    return Object.freeze({status,sha:body.sha,grantId:body.grantId,
      d1Writes:0,physicalR2ReadbackConfirmed:false,applyAuthorized:false});
  }catch{deny();}
}

/** Apply transport is private Worker RPC only. A manifest nonce and queue grant
 * are both burned before RPC; unknown outcomes are quarantined, never retried. */
export async function consumeTrustedQueueApply({message,env={},storage,binding,
  responseQueue,now=Date.now()}={}){
  const key=env.CALLER_KEY_HEX;
  if(env.ENVIRONMENT!=='staging'||env.D1_ID!==TARGET.db_id||
     !SHA.test(env.RELEASE_SHA||'')||!HEX64.test(key||'')||
     createHash('sha256').update(Buffer.from(key,'hex')).digest('hex')!==
       env.CALLER_KEY_SHA256||!storage||typeof storage.transaction!=='function'||
     !binding||typeof binding.apply!=='function'||
     (env.REQUIRE_PRIVATE_RESPONSE==='true'&&typeof responseQueue?.send!=='function')||
     !Number.isFinite(now))deny();
  if(!exact(message,[...APPLY_FIELDS,'mac'])||message.schema!==APPLY_SCHEMA||
     !HEX64.test(message.mac||''))deny();
  const body=Object.fromEntries(APPLY_FIELDS.map(k=>[k,message[k]]));
  const expected=Buffer.from(digest(key,body),'hex');
  const actual=Buffer.from(message.mac,'hex');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))deny();
  let payload;
  try{payload=openPayload(key,body.payloadEnvelope);}catch{deny();}
  if(!exact(payload,APPLY_PAYLOAD_FIELDS))deny();
  const {manifest:m,receiptId,signatureBase64,recoveryProof}=payload;
  const from=Date.parse(body.issuedAt),to=Date.parse(body.expiresAt);
  const signature=Buffer.from(String(signatureBase64||''),'base64');
  if(body.sha!==env.RELEASE_SHA||body.dbId!==TARGET.db_id||
     body.tenantId!==999013||!GRANT.test(body.grantId)||
     !/^[1-9][0-9]{7,13}$/.test(String(body.runId))||
     !Number.isSafeInteger(body.runAttempt)||body.runAttempt<1||
     !HEX64.test(receiptId||'')||!exact(m,MANIFEST_FIELDS)||
     m.sha!==body.sha||m.dbId!==body.dbId||m.tenantId!==body.tenantId||
     m.environment!=='staging'||m.authority!=='AIRTRUST_RELEASE_COORDINATION'||
     m.coordinationIssue!==776||m.scope!=='FRMS_QA_999013_4_CASES_4_JOURNEYS'||
     !HEX64.test(m.nonce||'')||!HEX64.test(m.receiptSha256||'')||
     !Number.isFinite(Date.parse(m.issuedAt))||!Number.isFinite(Date.parse(m.expiresAt))||
     Date.parse(m.expiresAt)<=Date.parse(m.issuedAt)||
     Date.parse(m.expiresAt)-Date.parse(m.issuedAt)>900000||
     signature.length!==64||signature.toString('base64')!==signatureBase64||
     !Number.isFinite(from)||!Number.isFinite(to)||to-from!==90000||
     now<from-30000||now>to||
     body.runId!==body.callerAuth?.claims?.runId||
     body.runAttempt!==body.callerAuth?.claims?.runAttempt||
     body.sha!==body.callerAuth?.claims?.sha||
     body.callerAuth?.claims?.operation!=='apply')deny();
  if(recoveryProof?.claims?.operation!=='apply'||
     recoveryProof?.claims?.callerNonce!==body.callerAuth?.claims?.nonce||
     recoveryProof?.claims?.releaseSha!==body.sha||
     recoveryProof?.claims?.runId!==body.runId||
     recoveryProof?.claims?.runAttempt!==body.runAttempt)deny();
  const grantKey='frms-qa-apply-grant:'+body.sha+':'+body.grantId;
  const manifestKey='frms-qa-apply-manifest:'+body.sha+':'+m.nonce;
  try{
    await authorizePrivateCaller({auth:body.callerAuth,operation:'apply',env,storage,
      now:new Date(now)});
    const reserved=await storage.transaction(async tx=>{
      if((await tx.get(grantKey))!==undefined||
         (await tx.get(manifestKey))!==undefined)return false;
      await tx.put(grantKey,{sha:body.sha,phase:'apply',runId:body.runId,
        runAttempt:body.runAttempt});
      await tx.put(manifestKey,{sha:body.sha,phase:'apply',grantId:body.grantId});
      return true;
    });
    if(reserved!==true)deny();
    let status='INDETERMINATE';
    let outcome;
    try{
      outcome=await binding.apply({callerAuth:body.callerAuth,
        recoveryProof,manifest:m,receiptId,signatureBase64});
      if(outcome?.status!=='QA_STAGING_REPAIR_VALIDATED'||outcome?.valid!==4||
         outcome?.updatedRows!==8||outcome?.sha!==body.sha)deny();
      if(responseQueue?.send){
        const reply={schema:'AIRTRUST_FRMS_QA_PRIVATE_REPLY_V1',operation:'apply',
          sha:body.sha,grantId:body.grantId,runId:body.runId,
          runAttempt:body.runAttempt,requestNonce:body.callerAuth.claims.nonce,
          payloadEnvelope:sealPayload(key,{status:'APPLY_VALIDATED',valid:4,updatedRows:8})};
        await responseQueue.send({...reply,mac:digest(key,reply)},
          {contentType:'json'});
      }
      status='APPLY_VALIDATED';
    }finally{
      await storage.put('outcome:'+grantKey,{status,sha:body.sha,
        grantId:body.grantId,runId:body.runId,runAttempt:body.runAttempt});
    }
    return Object.freeze({status,sha:body.sha,grantId:body.grantId,
      valid:4,updatedRows:8});
  }catch{deny();}
}

/** Trusted runner verifies reply provenance and correlation before using a
 * prepare receipt to construct the independently signed apply manifest. */
export function verifyPrivateQueueReply({reply,keyHex,expected}={}){
  if(!HEX64.test(keyHex||'')||!expected||!reply||typeof reply!=='object'||
     Array.isArray(reply)||!HEX64.test(reply.mac||''))deny();
  const body=Object.fromEntries(Object.entries(reply).filter(([key])=>key!=='mac'));
  if(!exact(body,['schema','operation','sha','grantId','runId','runAttempt',
    'requestNonce','payloadEnvelope']))deny();
  const want=Buffer.from(digest(keyHex,body),'hex');
  const got=Buffer.from(reply.mac,'hex');
  if(got.length!==want.length||!timingSafeEqual(got,want)||
     body.schema!=='AIRTRUST_FRMS_QA_PRIVATE_REPLY_V1'||
     body.sha!==expected.sha||body.runId!==String(expected.runId)||
     body.runAttempt!==expected.runAttempt||
     body.requestNonce!==expected.requestNonce||
     !SHA.test(body.sha||'')||!GRANT.test(body.grantId||'')||
     !/^[1-9][0-9]{7,13}$/.test(String(body.runId))||
     !['prepare','apply'].includes(body.operation))deny();
  const payload=openPayload(keyHex,body.payloadEnvelope);
  if(body.operation==='prepare'&&(!exact(payload,['receiptId','receipt'])||
     !HEX64.test(payload.receiptId||'')||
     payload.receipt?.dbId!==TARGET.db_id||payload.receipt?.tenantId!==999013||
     payload.receipt?.writes!==0||payload.receipt?.environment!=='staging'||
     !HEX64.test(payload.receipt?.preimageSha256||'')||
     !HEX64.test(payload.receipt?.artifactSha256||'')||
     !String(payload.receipt?.recoveryBookmark||'').trim()))deny();
  if(body.operation==='apply'&&(payload.status!=='APPLY_VALIDATED'||
     payload.valid!==4||payload.updatedRows!==8))deny();
  return Object.freeze({...body,...payload});
}
