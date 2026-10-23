/**
 * Inactive staging transport contract. The ONLY real producer is a protected
 * GitHub runner after independent authenticated F0 grant verification.
 * A queue message is not an admin grant by itself; its HMAC attests the
 * trusted runner, not Cloudflare permission or authority to deploy.
 * No Cloudflare API calls, HTTP repair routes, D1/R2 writes or deployment here.
 */
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {githubPrepareReadOnlyApi,verifyPrepareAdminGrant} from './verify-prepare-admin-grant.mjs';
import {signPrivateCaller,authorizePrivateCaller} from './caller-auth.mjs';
import {durablePrepareGrantLedger} from './durable-prepare-grant-ledger.mjs';
import {TARGET} from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';

const QUEUE_SCHEMA='AIRTRUST_FRMS_QA_QUEUE_PREPARE_V1';
const SHA=/^[a-f0-9]{40}$/,HEX64=/^[a-f0-9]{64}$/,GRANT=/^[1-9][0-9]{5,13}$/;
const deny=()=>{throw Error('FRMS_QA_PRIVATE_QUEUE_PREPARE_DENIED');};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).sort().join('|')===keys.slice().sort().join('|');
const digest=(hex,body)=>createHmac('sha256',Buffer.from(hex,'hex'))
  .update(JSON.stringify(body)).digest('hex');
const DATA_FIELDS=['schema','sha','dbId','tenantId','grantId','runId',
  'runAttempt','issuedAt','expiresAt','callerAuth'];

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
    const body={schema:QUEUE_SCHEMA,sha:verified.sha,dbId:TARGET.db_id,
      tenantId:999013,grantId:String(verified.grantId),
      runId:verified.runId,runAttempt:verified.runAttempt,
      issuedAt,expiresAt,callerAuth};
    return Object.freeze({...body,mac:digest(key,body)});
  }catch{deny();}
}

/** Queue consumer must run behind a private Cloudflare service binding. */
export async function consumeTrustedQueuePrepare({message,env={},storage,binding,
  now=Date.now()}={}){
  const key=env.CALLER_KEY_HEX;
  if(env.ENVIRONMENT!=='staging'||env.D1_ID!==TARGET.db_id||
     !SHA.test(env.RELEASE_SHA||'')||!HEX64.test(key||'')||
     createHash('sha256').update(Buffer.from(key,'hex')).digest('hex')!==
       env.CALLER_KEY_SHA256||
     !storage||typeof storage.transaction!=='function'||
     !binding||typeof binding.prepare!=='function'||!Number.isFinite(now))deny();
  if(!exact(message,[...DATA_FIELDS,'mac'])||
     !HEX64.test(message.mac||''))deny();
  const body=Object.fromEntries(DATA_FIELDS.map(k=>[k,message[k]]));
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
      const response=await binding.prepare({callerAuth:body.callerAuth});
      if(!response||!HEX64.test(response.receiptId||'')||
        response.receipt?.dbId!==TARGET.db_id||
        response.receipt?.tenantId!==999013||response.receipt?.writes!==0)
        deny();
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
