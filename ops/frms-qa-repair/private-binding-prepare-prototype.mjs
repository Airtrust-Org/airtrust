/**
 * OFFLINE CONTROL-PLANE PROTOTYPE: separate, private, prepare-only RPC caller.
 * Never deploy or expose a public transport from this module. The upstream
 * verifier MUST independently authenticate the GitHub admin's fresh exact F0
 * grant, current SHA, execution identity, and mutex. An injected callback's
 * return value alone is NOT independent proof of that authentication.
 * No Cloudflare token, Time Travel bookmark or signer key crosses this RPC.
 */
import {signPrivateCaller} from './caller-auth.mjs';
import {TARGET} from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';

const deny=()=>{throw Error('QA_PRIVATE_CALLER_TRANSPORT_DENIED');};
const HEX40=/^[0-9a-f]{40}$/,HEX64=/^[0-9a-f]{64}$/;
const EXACT=['status','schema','sha','dbId','tenantId','grantId','runId','runAttempt'];
export async function prepareViaPrivateServiceBinding({
  env={},binding,independentGrantVerifier,grantLedger,
}={}){
  const sha=env.GITHUB_SHA,runId=String(env.GITHUB_RUN_ID||''),
    attempt=Number(env.GITHUB_RUN_ATTEMPT);
  if(env.GITHUB_ACTIONS!=='true'||
     env.GITHUB_REPOSITORY!=='Airtrust-Org/airtrust'||
     env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.FRMS_QA_PREPARE_CONFIRM!=='AIRTRUST_FRMS_QA_PREPARE_ONLY_F0_APPROVED'||
     !HEX40.test(sha||'')||
     !/^[1-9][0-9]{7,13}$/.test(runId)||
     !Number.isSafeInteger(attempt)||attempt<1||
     !HEX64.test(env.FRMS_QA_CALLER_KEY_HEX||'')||
     !/^[1-9][0-9]{5,13}$/.test(String(env.FRMS_QA_PREPARE_GRANT_ID||''))||
     !binding||typeof binding.prepare!=='function'||
     !grantLedger||typeof grantLedger.transaction!=='function'||
     typeof independentGrantVerifier!=='function')deny();
  const grantId=String(env.FRMS_QA_PREPARE_GRANT_ID);
  let verified;
  try{
    verified=await independentGrantVerifier({
      repository:'Airtrust-Org/airtrust',
      issue:776,frmsIssue:1426,
      sha,dbId:TARGET.db_id,tenantId:999013,
      phase:'prepare',grantId,runId,runAttempt:attempt,
    });
  }catch{deny();}
  // A validated marker is necessary but NOT sufficient without a trusted
  // implementation of the external verifier, outside this pure module.
  if(!verified||typeof verified!=='object'||Array.isArray(verified)||
     Object.keys(verified).sort().join('|')!==EXACT.slice().sort().join('|')||
     verified.schema!=='AIRTRUST_FRMS_QA_PREPARE_GRANT_VERIFIED_V1'||
     verified.status!=='VERIFIED_BY_INDEPENDENT_GITHUB_ADMIN_CHECK'||
     verified.sha!==sha||verified.dbId!==TARGET.db_id||
     verified.tenantId!==999013||String(verified.grantId)!==grantId||
     verified.runId!==runId||verified.runAttempt!==attempt)deny();
  // A grant is single-use, even when a fresh HMAC caller nonce is minted.
  // Mark it spent before contacting a remote binding. A failed invocation
  // stays quarantined until independent reconciliation, never auto-retry.
  let acquired=false;
  try{
    acquired=await grantLedger.transaction(async tx=>{
      const scope='frms-qa-prepare-grant:'+sha+':'+grantId;
      if(await tx.get(scope))return false;
      await tx.put(scope,{runId,runAttempt:attempt,sha,phase:'prepare'});
      return true;
    });
  }catch{deny();}
  if(acquired!==true)deny();
  let result;
  try{
    const callerAuth=signPrivateCaller({
      keyHex:env.FRMS_QA_CALLER_KEY_HEX,operation:'prepare',
      sha,runId,runAttempt:attempt,
    });
    // The private service binding, never an HTTP address, chooses the target.
    // The caller supplies no SQL, target ID, bookmark, receipt or signature.
    result=await binding.prepare({callerAuth});
  }catch{deny();}
  if(!result||typeof result!=='object'||typeof result.receiptId!=='string'||
     !HEX64.test(result.receiptId)||result.receipt?.dbId!==TARGET.db_id||
     result.receipt?.tenantId!==999013||result.receipt?.writes!==0)deny();
  return result; // private caller only; never log receipt or bookmark
}
