/**
 * OFFLINE SECURITY PROTOTYPE ONLY — NOT CONNECTED TO PRIVATE WORKER, NOT A DEPLOY PATH.
 * A trusted staging runner may capture a real D1 Time Travel bookmark using its
 * existing secret inside ephemeral Actions, then authenticate the claim below.
 * HMAC proves the trusted runner *claimed* a bookmark; it does not establish
 * Cloudflare provenance on its own. Deployment needs independent provenance,
 * caller transport, reviewed F0 grant and the separate Ed25519 apply signature.
 * No Cloudflare credentials or network APIs are accepted by this module.
 */
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {TARGET} from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';

const FAIL='QA_RECOVERY_BRIDGE_DENIED';
const PREFIX='AIRTRUST_FRMS_QA_STAGING_TIME_TRAVEL_V1\n';
const HEX64=/^[0-9a-f]{64}$/;
const HEX40=/^[0-9a-f]{40}$/;
const ACCOUNT=/^[0-9a-f]{32}$/;
const FIELDS=['accountId','bookmark','callerNonce','capturedAt','dbId','expiresAt',
  'issuedAt','nonce','operation','releaseSha','runAttempt','runId','source','tenantId'];
const reject=()=>{throw new Error(FAIL);};
const utc=x=>typeof x==='string'&&x.endsWith('Z')&&Number.isFinite(Date.parse(x));
const stamp=t=>t instanceof Date?t.getTime():NaN;
const str=x=>typeof x==='string'&&x.length>0&&x.length<=160&&
  /^[a-zA-Z0-9-]+$/.test(x);

function contract(c,now){
  if(!c||typeof c!=='object'||Array.isArray(c)||
     Object.keys(c).sort().join('|')!==FIELDS.slice().sort().join('|')||
     !ACCOUNT.test(c.accountId)||c.dbId!==TARGET.db_id||
     c.tenantId!==999013||!HEX40.test(c.releaseSha)||
     !['prepare','apply'].includes(c.operation)||
     !HEX64.test(c.nonce)||!HEX64.test(c.callerNonce)||
     c.nonce===c.callerNonce||!str(c.bookmark)||
     c.source!=='CLOUDFLARE_D1_TIME_TRAVEL_GET'||
     !/^[1-9][0-9]{7,13}$/.test(String(c.runId))||
     !Number.isSafeInteger(c.runAttempt)||c.runAttempt<1||
     !utc(c.capturedAt)||!utc(c.issuedAt)||!utc(c.expiresAt))
    reject();
  const captured=Date.parse(c.capturedAt),issued=Date.parse(c.issuedAt),
    expires=Date.parse(c.expiresAt);
  // The bookmark must be captured and signed for this invocation, not
  // recycled as a stale recovery point or submitted by the RPC caller.
  if(captured>now+10000||now-captured>90000||
     issued<captured||issued>now+10000||issued<now-90000||
     expires<=now||expires<issued||expires-issued>90000)reject();
}
function mac(key,claims){
  return createHmac('sha256',Buffer.from(key,'hex'))
    .update(PREFIX).update(JSON.stringify(claims)).digest('hex');
}
/** Controlled runner mock / future approved caller only.
 * Never call until a separately trusted Cloudflare GET has been attested. */
export function signRecoveryHandoff({keyHex,accountId,bookmark,callerNonce,
  operation,releaseSha,runId,runAttempt=1,now=new Date(),capturedAt=now}){
  if(!HEX64.test(keyHex||'')||!Number.isFinite(stamp(now))||
     !Number.isFinite(stamp(capturedAt)))reject();
  const claims={
    accountId,bookmark,callerNonce,capturedAt:capturedAt.toISOString(),
    dbId:TARGET.db_id,expiresAt:new Date(+now+90000).toISOString(),
    issuedAt:now.toISOString(),nonce:randomBytes(32).toString('hex'),
    operation,releaseSha,runAttempt,runId:String(runId),
    source:'CLOUDFLARE_D1_TIME_TRAVEL_GET',tenantId:999013,
  };
  contract(claims,+now);
  return {claims,mac:mac(keyHex,claims)};
}
/** Verification adapter prototype: fail-closed, replay-denied, not wired to
 * prepare()/apply(). Calls only the test's injected transactional storage. */
export async function verifyRecoveryHandoff({proof,keyHex,expected,storage,
  now=new Date()}){
  if(!HEX64.test(keyHex||'')||!Number.isFinite(stamp(now))||
     !storage||typeof storage.transaction!=='function'||
     !proof||typeof proof!=='object'||Array.isArray(proof)||
     Object.keys(proof).sort().join('|')!=='claims|mac'||!HEX64.test(proof.mac||''))
    reject();
  const c=proof.claims;
  contract(c,+now);
  if(!expected||c.accountId!==expected.accountId||
     c.releaseSha!==expected.releaseSha||
     c.operation!==expected.operation||
     c.runId!==String(expected.runId)||
     c.runAttempt!==expected.runAttempt||
     c.callerNonce!==expected.callerNonce)reject();
  const a=Buffer.from(proof.mac,'hex'),b=Buffer.from(mac(keyHex,c),'hex');
  if(a.length!==b.length||!timingSafeEqual(a,b))reject();
  let fresh=false;
  try{
    fresh=await storage.transaction(async tx=>{
      const key='recovery-handoff-nonce:'+c.nonce;
      if((await tx.get(key))!==undefined)return false;
      await tx.put(key,{sha:c.releaseSha,operation:c.operation,runId:c.runId,
        issuedAt:c.issuedAt});
      return true;
    });
  }catch{reject();}
  if(!fresh)reject();
  return {dbId:c.dbId,bookmark:c.bookmark,capturedAt:c.capturedAt};
}
