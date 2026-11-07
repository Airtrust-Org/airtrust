/**
 * Read-only, staging-only Actions integration probe. Never prints a bookmark,
 * Cloudflare API token, HMAC key, MAC, or private resource content.
 * The bridge key is disposable and never deployed: this tests a real GET and
 * local HMAC verification only, NOT provenance attestation or Worker readiness.
 */
import {randomBytes} from 'node:crypto';
import {captureTrustedRunnerRecoveryHandoff}
  from './trusted-runner-bookmark-acquisition.mjs';
import {verifyRecoveryHandoff} from './recovery-handoff-prototype.mjs';
import {TARGET} from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';

const denied=()=>{throw Error('QA_STAGING_BOOKMARK_LOCAL_PROOF_DENIED');};

export async function proveBookmarkLocally({env=process.env,fetcher=fetch,
  now=new Date()}={}){
  if(env.GITHUB_ACTIONS!=='true'||
     env.GITHUB_REPOSITORY!=='Airtrust-Org/airtrust'||
     env.GITHUB_REF!=='refs/heads/main'||
     !/^[0-9a-f]{40}$/.test(env.GITHUB_SHA||'')||
     env.FRMS_QA_BOOKMARK_READONLY_CONFIRM!=='FRMS_QA_BOOKMARK_GET_HMAC_LOCAL_READONLY'||
     !/^[1-9][0-9]{7,13}$/.test(String(env.GITHUB_RUN_ID))||
     !Number.isSafeInteger(Number(env.GITHUB_RUN_ATTEMPT))||
     Number(env.GITHUB_RUN_ATTEMPT)<1||
     !/^[0-9a-f]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID||'')||
     !env.CLOUDFLARE_WORKER_API_TOKEN||
     !/^[0-9a-f]{64}$/.test(env.FRMS_QA_CALLER_KEY_HEX||'')||
     !(now instanceof Date)||!Number.isFinite(+now))denied();
  // Ephemeral proof key exists ONLY during this one runner job. It is not a
  // replacement for a separately controlled, persistent bridge trust anchor.
  const bridgeKeyHex=randomBytes(32).toString('hex');
  const callerNonce=randomBytes(32).toString('hex');
  let proof;
  try{
    proof=await captureTrustedRunnerRecoveryHandoff({
      accountId:env.CLOUDFLARE_ACCOUNT_ID,
      apiToken:env.CLOUDFLARE_WORKER_API_TOKEN,
      bridgeKeyHex,callerKeyHex:env.FRMS_QA_CALLER_KEY_HEX,
      callerNonce,operation:'prepare',releaseSha:env.GITHUB_SHA,
      runId:env.GITHUB_RUN_ID,runAttempt:Number(env.GITHUB_RUN_ATTEMPT),
      now,fetcher,
    });
    // Ephemeral local nonce ledger is never a substitute for a Durable Object
    // in any real runner->Worker bridge.
    const used=new Map();
    const storage={transaction:async cb=>cb({
      get:async k=>used.get(k),put:async(k,v)=>{used.set(k,v);},
    })};
    const result=await verifyRecoveryHandoff({
      proof,keyHex:bridgeKeyHex,storage,now,
      expected:{
        accountId:env.CLOUDFLARE_ACCOUNT_ID,releaseSha:env.GITHUB_SHA,
        operation:'prepare',runId:env.GITHUB_RUN_ID,
        runAttempt:Number(env.GITHUB_RUN_ATTEMPT),callerNonce,
      },
    });
    if(result.dbId!==TARGET.db_id||used.size!==1)denied();
    return {verdict:'FRMS_QA_BOOKMARK_GET_HMAC_LOCAL_READONLY_VERIFIED',
      writes:0,workerDeployed:false,runtimeTokenInstalled:false,
      operationalCaller:false,independentEd25519Approval:false};
  }catch{denied();}
}
if(import.meta.url==='file://'+process.argv[1]){
  proveBookmarkLocally().then(result=>{
    console.log(JSON.stringify(result));
  }).catch(()=>{
    // Errors from fetch or Cloudflare must not leak bearer tokens or bookmarks.
    console.error('QA_STAGING_BOOKMARK_LOCAL_PROOF_DENIED');
    process.exitCode=1;
  });
}
