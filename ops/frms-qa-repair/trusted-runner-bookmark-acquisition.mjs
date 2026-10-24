/**
 * TRUSTED RUNNER LIBRARY PROTOTYPE — NO WORKFLOW DISPATCH, NO DEPLOY, NO RUNTIME.
 * A future separately governed Actions runner may obtain one real Time Travel
 * bookmark with an existing staging token, then create an HMAC handoff.
 * The token never becomes a Worker binding or a field of the returned proof.
 * An HMAC proves only a runner assertion, NOT an independently verified Cloudflare
 * receipt or authorization to prepare/apply.
 */
import {TARGET} from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';
import {signRecoveryHandoff} from './recovery-handoff-prototype.mjs';

const HEX64=/^[0-9a-f]{64}$/;
const HEX40=/^[0-9a-f]{40}$/;
const ACCOUNT=/^[0-9a-f]{32}$/;
const fail=()=>{throw Error('QA_RECOVERY_ACQUISITION_DENIED');};
const expectedDb=TARGET.db_id;

export async function captureTrustedRunnerRecoveryHandoff({
  accountId,apiToken,bridgeKeyHex,callerKeyHex,callerNonce,
  operation,releaseSha,runId,runAttempt=1,now=new Date(),
  fetcher=fetch,
}={}){
  // Reject malformed/mixed scope before touching the network.
  if(!ACCOUNT.test(accountId||'')||
     typeof apiToken!=='string'||!apiToken.trim()||
     !HEX64.test(bridgeKeyHex||'')||
     !HEX64.test(callerKeyHex||'')||
     bridgeKeyHex===callerKeyHex||
     !HEX64.test(callerNonce||'')||
     !HEX40.test(releaseSha||'')||
     !['prepare','apply'].includes(operation)||
     !/^[1-9][0-9]{7,13}$/.test(String(runId))||
     !Number.isSafeInteger(runAttempt)||runAttempt<1||
     !(now instanceof Date)||!Number.isFinite(+now)||
     typeof fetcher!=='function')fail();
  const url='https://api.cloudflare.com/client/v4/accounts/'+accountId+
    '/d1/database/'+expectedDb+'/time_travel/bookmark';
  let response,body;
  try{
    response=await fetcher(url,{
      method:'GET',redirect:'manual',headers:{
        Authorization:'Bearer '+apiToken,Accept:'application/json'},
      signal:AbortSignal.timeout(15000),
    });
    if(response?.ok!==true||response.redirected===true||response.status!==200)
      fail();
    body=await response.json();
  }catch{fail();}
  // Never accept an arbitrary bookmark supplied as a workflow input.
  // Cloudflare's documented envelope must be successful and bounded.
  const bookmark=body?.result?.bookmark;
  if(body?.success!==true||!body.result||
     typeof bookmark!=='string'||bookmark.length<1||bookmark.length>160||
     !/^[a-zA-Z0-9-]+$/.test(bookmark))fail();
  try{
    // The trusted runner captures its own time after the completed GET.
    // The HMAC signing key must be distinct from the existing caller key.
    return signRecoveryHandoff({
      keyHex:bridgeKeyHex,accountId,bookmark,callerNonce,
      operation,releaseSha,runId,runAttempt,now,capturedAt:now,
    });
  }catch{fail();}
}
