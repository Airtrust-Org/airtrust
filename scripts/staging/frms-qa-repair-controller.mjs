// source_reference: AirTrust #1426, #776; reviewed CAS #1564; atomic library #1573.
// operational_decision: staging QA controller contract, no transport/deploy/apply workflow.
// dry_run_required: inject controlled adapters; no credentials or D1 access in this file.
// rollback_plan_required: AES-GCM preimage, D1 Time Travel and separate inverse CAS approval.
import {createHash, createPublicKey, verify as verifySignature, createDecipheriv} from 'node:crypto';
import {validateQaPreimage, encryptQaPreimage, executeQaAtomicRepair} from './frms-qa-cases-atomic-executor.mjs';
import {assertReviewPlan, TARGET} from './frms-qa-cases-repair-plan.mjs';

const SCOPE='FRMS_QA_999013_4_CASES_4_JOURNEYS';
const LOCK='airtrust-staging-mutations-and-scorm-qa';
const HEX40=/^[0-9a-f]{40}$/;
const HEX64=/^[0-9a-f]{64}$/;
const SHA_PLAN='38a81ed05821919d87b424ddfc7b731bfc8d7d759dadebbb6a21d11edb349ed3';
const fail=message=>{throw new Error(message);};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const ids=plan=>plan.operations.map(op=>op.id);
const exact=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
const validTime=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&/Z$/.test(v);
const identity=x=>({tenantId:x?.tenantId,dbId:x?.dbId,crewCount:x?.crewCount,
  usersFingerprint:x?.usersFingerprint,untouchedFingerprint:x?.untouchedFingerprint});
const verifyIdentity=x=>{
  if(x?.tenantId!==999013||x.dbId!==TARGET.db_id||x.crewCount!==14||
     !HEX64.test(String(x.usersFingerprint||''))||
     !HEX64.test(String(x.untouchedFingerprint||'')))
    fail('QA_IDENTITY_FINGERPRINT_REQUIRED');
  return identity(x);
};
const snapshotMatch=(x,y)=>JSON.stringify(identity(x))===JSON.stringify(identity(y));
const verifyReceiptScope=(receipt,plan,now)=>{
  if(receipt?.environment!=='staging'||receipt.dbId!==TARGET.db_id||
     receipt.tenantId!==999013||receipt.planSha256!==SHA_PLAN||
     !exact(receipt.authorizedIds,ids(plan))||receipt.writes!==0||
     !HEX64.test(String(receipt.preimageSha256||''))||
     !HEX64.test(String(receipt.artifactSha256||''))||
     !String(receipt.artifactReference||'').trim()||
     !String(receipt.recoveryBookmark||'').trim()||
     !validTime(receipt.recoveryCapturedAt)||
     !validTime(receipt.artifactExpiresAt))
    fail('QA_RECEIPT_SCOPE_OR_INTEGRITY_REJECTED');
  const preparedAt=Date.parse(receipt.recoveryCapturedAt);
  const expiresAt=Date.parse(receipt.artifactExpiresAt);
  // The independently captured recovery bookmark may precede receipt storage by up to 5 minutes.
  if(preparedAt>+now+300000||expiresAt<=+now||
     expiresAt<=preparedAt||expiresAt>preparedAt+86400000+300000)
    fail('QA_RECEIPT_SCOPE_OR_INTEGRITY_REJECTED');
  verifyIdentity(receipt.identity);
};
const requireAdapters=(a,names)=>{for(const n of names)if(typeof a?.[n]!=='function')fail('QA_ADAPTER_REQUIRED_'+n);};
const planGuard=plan=>{
  assertReviewPlan(plan);
  const actualDigest=digest(plan.operations.map(op=>op.sql.trim()).join(';\n')+';\n');
  if(actualDigest!==SHA_PLAN||plan.sql_sha256!==SHA_PLAN||plan.operations.length!==8||plan.target.db_id!==TARGET.db_id)
    fail('QA_REVIEW_DIGEST_MISMATCH');
};
const assertRows=(plan,rows)=>{
  validateQaPreimage(plan,rows);
  for(const [i,row] of rows.entries()){
    const old=row.original;
    if(row.table==='frms_jornada'){
      if(old.empresa_id!==999013||old.registrado_por!=='QA_FRMS_UX'||
         old.origem!=='MANUAL'||
         old.observacao!=='CENARIO SINTETICO - SEM VALIDADE OPERACIONAL'||
         old.deleted_at!==null||!(Number(old.duracao_jornada_minutos)>0))
        fail('QA_JOURNEY_PREIMAGE_DRIFT_'+i);
    }else if(row.table==='frms_alerta'){
      if(old.jornada_id!==null||Number(old.resolvido)!==0||
         old.deleted_at!==null||old.resolvido_em!==null||
         old.resolvido_por!==null||Number(old.visualizado)!==0||
         old.visualizado_em!==null||old.visualizado_por!==null||
         Number(old.valor_atual_min)!==620||Number(old.valor_limite_min)!==540||
         Number(old.percentual_atingido)!==112)
        fail('QA_CASE_PREIMAGE_DRIFT_'+i);
    }else fail('QA_PREIMAGE_TABLE_REJECTED');
  }
};

/** Collect immutable review evidence using a READ-ONLY staging adapter.
 * Caller must use a protected work environment and may not log these rows.
 * The encrypted artifact must have a short retention and private ACL. */
export async function prepareQaEvidence({plan,adapters,key,now=new Date()}){
  planGuard(plan);
  requireAdapters(adapters,['acquireLock','readScope','captureTimeTravel','storeProtected',
    'audit','releaseLock']);
  const lock=await adapters.acquireLock(LOCK);
  if(!lock?.held)fail('QA_EXCLUSIVE_LOCK_REQUIRED');
  try{
    const snapshot=await adapters.readScope({tenantId:999013,ids:ids(plan)});
    verifyIdentity(snapshot);
    assertRows(plan,snapshot.rows);
    const recovery=await adapters.captureTimeTravel(TARGET.db_id);
    if(recovery?.dbId!==TARGET.db_id||!String(recovery.bookmark||'').trim()||
       !validTime(recovery.capturedAt)||Math.abs(+now-Date.parse(recovery.capturedAt))>300000)
      fail('QA_REAL_RECOVERY_BOOKMARK_REQUIRED');
    const encrypted=encryptQaPreimage({plan,rows:snapshot.rows,key});
    const stored=await adapters.storeProtected(encrypted);
    if(!stored?.restricted||stored?.sha256!==encrypted.sha256||
       !String(stored.reference||'').trim()||!(stored.expiresAt)||
       !validTime(stored.expiresAt)||Date.parse(stored.expiresAt)<=+now||
       Date.parse(stored.expiresAt)>(+now+86400000))
      fail('QA_PROTECTED_ARTIFACT_REQUIRED');
    const receipt={
      environment:'staging',dbId:TARGET.db_id,tenantId:999013,planSha256:plan.sql_sha256,
      authorizedIds:ids(plan),preimageSha256:encrypted.plaintextSha256,
      artifactSha256:encrypted.sha256,artifactReference:stored.reference,
      artifactExpiresAt:stored.expiresAt,recoveryBookmark:recovery.bookmark,
      recoveryCapturedAt:recovery.capturedAt,identity:identity(snapshot),writes:0,
    };
    await adapters.audit({event:'FRMS_QA_PREPARED_READONLY',planSha256:plan.sql_sha256,
      tenantId:999013,writes:0,preimageSha256:receipt.preimageSha256});
    return receipt;
  }finally{await adapters.releaseLock(lock);}
}

/** Verify a centrally issued Ed25519-signed, SHA- and plan-specific approval.
 * A caller-controlled boolean/issue comment is NOT authorization.
 * The public key fingerprint must be pinned independently by the workflow. */
export function verifyQaApproval({manifest,signatureBase64,publicKeyPem,
  trustedPublicKeySha256,receipt,plan,sha,now=new Date()}){
  planGuard(plan);
  verifyReceiptScope(receipt,plan,now);
  if(!HEX40.test(String(sha||''))||!HEX64.test(String(trustedPublicKeySha256||''))||
     !publicKeyPem||!signatureBase64||!manifest)fail('QA_TRUST_ANCHOR_REQUIRED');
  const key=createPublicKey(publicKeyPem).export({type:'spki',format:'der'});
  if(digest(key)!==trustedPublicKeySha256)fail('QA_UNTRUSTED_APPROVAL_KEY');
  const verified=verifySignature(null,Buffer.from(JSON.stringify(manifest)),
    publicKeyPem,Buffer.from(signatureBase64,'base64'));
  if(!verified)fail('QA_APPROVAL_SIGNATURE_INVALID');
  if(!validTime(manifest.issuedAt)||!validTime(manifest.expiresAt)||
     +now<Date.parse(manifest.issuedAt)-60000||+now>Date.parse(manifest.expiresAt)||
     Date.parse(manifest.expiresAt)<Date.parse(manifest.issuedAt)||
     Date.parse(manifest.expiresAt)-Date.parse(manifest.issuedAt)>900000||
     !HEX64.test(String(manifest.nonce||''))||
     manifest.authority!=='AIRTRUST_RELEASE_COORDINATION'||
     manifest.coordinationIssue!==776||manifest.scope!==SCOPE||
     manifest.sha!==sha||manifest.environment!=='staging'||
     manifest.dbId!==TARGET.db_id||manifest.tenantId!==999013||
     manifest.planSha256!==SHA_PLAN||
     !exact(manifest.authorizedIds,ids(plan))||
     manifest.receiptSha256!==digest(JSON.stringify(receipt))||
     manifest.preimageSha256!==receipt?.preimageSha256||
     manifest.artifactSha256!==receipt.artifactSha256||
     manifest.recoveryBookmark!==receipt.recoveryBookmark)
    fail('QA_APPROVAL_SCOPE_OR_TTL_REJECTED');
  return true;
}

export function decryptStoredQaPreimage({plan,receipt,encrypted,key}){
  planGuard(plan);
  if(!Buffer.isBuffer(key)||key.length!==32||encrypted?.format!=='AES-256-GCM'||
     digest(Buffer.from(String(encrypted.ciphertext||''),'base64'))!==receipt.artifactSha256)
    fail('QA_ENCRYPTED_PREIMAGE_INTEGRITY_FAILURE');
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(encrypted.iv,'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.tag,'base64'));
  const rows=JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext,'base64')),
    decipher.final()]).toString('utf8'));
  if(validateQaPreimage(plan,rows)!==receipt.preimageSha256)
    fail('QA_PREIMAGE_HASH_CHANGED');
  assertRows(plan,rows);
  return rows;
}

/** Orchestration requires trusted, private adapters; no remote route is provided.
 * Independent workflow must pin the key, SHA, staging environment and locking.
 * Authorization permits ONLY this fixed 8-row synthetic operation.
 * Audit is written before execution; nonce reservation prevents replay. */
export async function executeApprovedQaStagingRepair({plan,receipt,manifest,
  signatureBase64,publicKeyPem,trustedPublicKeySha256,sha,adapters,key,now=new Date()}){
  planGuard(plan);
  requireAdapters(adapters,['acquireLock','releaseLock','readScope','readProtected',
    'reserveNonce','audit','captureTimeTravel','getDb','postcheck']);
  verifyQaApproval({plan,receipt,manifest,signatureBase64,publicKeyPem,
    trustedPublicKeySha256,sha,now});
  const lock=await adapters.acquireLock(LOCK);
  if(!lock?.held)fail('QA_EXCLUSIVE_LOCK_REQUIRED');
  let applied=false;
  try{
    const scoped=await adapters.readScope({tenantId:999013,ids:ids(plan)});
    verifyIdentity(scoped);
    if(!snapshotMatch(scoped,receipt.identity))fail('QA_QA_IDENTITY_CHANGED');
    const saved=await adapters.readProtected(receipt.artifactReference);
    const rows=decryptStoredQaPreimage({plan,receipt,encrypted:saved,key});
    if(validateQaPreimage(plan,scoped.rows)!==receipt.preimageSha256)
      fail('QA_PREIMAGE_DRIFT_SINCE_REVIEW');
    const bookmark=await adapters.captureTimeTravel(TARGET.db_id);
    if(bookmark?.dbId!==TARGET.db_id||!String(bookmark.bookmark||'').trim()||
       !validTime(bookmark.capturedAt)||Math.abs(+now-Date.parse(bookmark.capturedAt))>300000)
      fail('QA_FRESH_RECOVERY_REQUIRED');
    const reserved=await adapters.reserveNonce({nonce:manifest.nonce,sha,scope:SCOPE});
    if(reserved!==true)fail('QA_REPLAY_OR_LEDGER_REJECTED');
    await adapters.audit({event:'FRMS_QA_WRITE_INTENT',sha,planSha256:SHA_PLAN,
      scope:SCOPE,preimageSha256:receipt.preimageSha256,recoveryBookmark:bookmark.bookmark});
    const context={
      environment:'staging',sha,d1Id:TARGET.db_id,tenantId:999013,
      approval:{approved:true,sha,dbId:TARGET.db_id,tenantId:999013,scope:SCOPE,
        planSha256:SHA_PLAN,preimageSha256:receipt.preimageSha256,
        authorizedIds:ids(plan),reference:'AIRTRUST-STAGING-SIGNED-'+manifest.nonce},
      recovery:{dbId:TARGET.db_id,timeTravelBookmark:bookmark.bookmark},
      artifact:{encryptedAndStored:true,restrictedReference:receipt.artifactReference,
        sha256:receipt.artifactSha256},
    };
    const db=await adapters.getDb(TARGET.db_id);
    await executeQaAtomicRepair({db,plan,preimage:rows,context});
    applied=true;
    const after=await adapters.postcheck({tenantId:999013,ids:ids(plan)});
    if(after?.valid!==4||after?.crewCount!==14||after?.tenantId!==999013||
       after?.dbId!==TARGET.db_id||
       after?.usersFingerprint!==receipt.identity.usersFingerprint||
       after?.untouchedFingerprint!==receipt.identity.untouchedFingerprint)
      fail('QA_POSTCONDITION_FAILED_RECOVERY_REQUIRED');
    await adapters.audit({event:'FRMS_QA_REPAIR_VALIDATED',sha,planSha256:SHA_PLAN,
      valid:4,updatedRows:8,tenantId:999013});
    return {status:'QA_STAGING_REPAIR_VALIDATED',valid:4,updatedRows:8,
      planSha256:SHA_PLAN,sha};
  }catch(error){
    // After a successful batch, never pretend a failed postcheck rolled it back.
    const raw=String(error?.message??'');
    const safeReason=/^QA_[A-Z0-9_]+$/.test(raw)?raw:'QA_EXECUTION_FAILED';
    try{await adapters.audit({event:applied?'FRMS_QA_POSTCHECK_FAILED_REQUIRES_COMPENSATION':
      'FRMS_QA_BLOCKED_BEFORE_APPLY',sha,planSha256:SHA_PLAN,reason:safeReason});}
    catch{/* retain original failure; persistent controller must alert separately */}
    throw error;
  }finally{await adapters.releaseLock(lock);}
}
