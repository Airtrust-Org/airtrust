/**
 * OFFLINE CONTROL-PLANE ASSEMBLY ONLY. Not an Actions entrypoint and not a
 * deployed private transport. Nothing here issues an approval or connects the
 * GitHub runner to Cloudflare. In a future separately authorized runner, own
 * the entire invocation, token and private binding in a trusted process.
 *
 * The trusted GitHub GET adapter is constructed here; callers cannot inject a
 * fabricated VERIFIED result as their own "independent" attestation.
 * The fetcher argument exists only to exercise fail-closed tests with synthetic
 * GitHub fixtures; NEVER source it from workflow_dispatch inputs.
 */
import {
  githubPrepareReadOnlyApi,verifyPrepareAdminGrant,
} from './verify-prepare-admin-grant.mjs';
import {prepareViaPrivateServiceBinding} from './private-binding-prepare-prototype.mjs';

const deny=()=>{throw Error('FRMS_QA_TRUSTED_PREPARE_ADMISSION_DENIED');};

export async function runTrustedPrepareAdmission({
  env={},binding,grantLedger,fetcher=fetch,
}={}){
  // The GITHUB_TOKEN belongs to a protected GitHub Actions context. Never
  // forward it to the Worker RPC or store it in the DO grant ledger.
  if(!env||env.GITHUB_ACTIONS!=='true'||
    typeof env.GITHUB_TOKEN!=='string'||!env.GITHUB_TOKEN.trim()||
    typeof fetcher!=='function'||
    !binding||typeof binding.prepare!=='function'||
    !grantLedger||typeof grantLedger.transaction!=='function')deny();
  try{
    const api=githubPrepareReadOnlyApi({token:env.GITHUB_TOKEN,fetcher});
    const independentGrantVerifier=async()=>{
      // The verified result comes from a pinned, authenticated GitHub API,
      // never from an untrusted caller-supplied verifier callback.
      return verifyPrepareAdminGrant({env,api});
    };
    const receipt=await prepareViaPrivateServiceBinding({
      env,binding,grantLedger,independentGrantVerifier,
    });
    // No receipt, bookmark, token, R2 path or approval signature in result.
    // Receipt custody requires a future independently authorized transport.
    if(receipt.receipt?.writes!==0)deny();
    return Object.freeze({
      status:'FRMS_QA_PRIVATE_PREPARE_RECEIPT_VALIDATED',
      sha:env.GITHUB_SHA,tenantId:999013,d1Writes:0,
      receiptValidated:true,physicalR2ReadbackConfirmed:false,
      applyAuthorized:false,productionAuthorized:false,
    });
  }catch{deny();}
}
