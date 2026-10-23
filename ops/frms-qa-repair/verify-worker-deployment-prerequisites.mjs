// FRMS private staging Worker deployment prerequisite audit — absolutely no remote writes.
// This script does not inspect or print credential values, recover API tokens,
// issue an approval, grant permissions, or authorize deployment.
import {createPublicKey} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const HEX64=/^[a-f0-9]{64}$/;
const ACCOUNT=/^[a-f0-9]{32}$/;
const present=x=>typeof x==='string'&&x.trim().length>0;
const status=x=>present(x)?'PRESENT_SCOPE_NOT_ATTESTED':'MISSING';

export function inspectPrivateWorkerPrerequisites(env={}){
  const checks={
    accountId:ACCOUNT.test(env.CLOUDFLARE_ACCOUNT_ID||'')?'FORMAT_VALID':'MISSING_OR_INVALID',
    metadataReadToken:status(env.CLOUDFLARE_FRMS_QA_READ_API_TOKEN),
    workerDeployToken:status(env.CLOUDFLARE_FRMS_QA_WORKER_DEPLOY_API_TOKEN),
    runtimeD1ReadToken:status(env.FRMS_QA_D1_READ_TOKEN),
    callerHmacKey:HEX64.test(env.FRMS_QA_CALLER_KEY_HEX||'')?'FORMAT_VALID':'MISSING_OR_INVALID',
    preimageAesKey:HEX64.test(env.FRMS_QA_PREIMAGE_KEY_HEX||'')?'FORMAT_VALID':'MISSING_OR_INVALID',
    keySeparation:HEX64.test(env.FRMS_QA_CALLER_KEY_HEX||'')&&
      HEX64.test(env.FRMS_QA_PREIMAGE_KEY_HEX||'')&&
      env.FRMS_QA_CALLER_KEY_HEX!==env.FRMS_QA_PREIMAGE_KEY_HEX?'DISTINCT':'MISSING_OR_NOT_DISTINCT',
    publicApprovalKey:'MISSING',
  };
  if(present(env.FRMS_QA_APPROVAL_PUBLIC_KEY_PEM)){
    try{
      checks.publicApprovalKey=createPublicKey(env.FRMS_QA_APPROVAL_PUBLIC_KEY_PEM)
        .asymmetricKeyType==='ed25519'?'ED25519_FORMAT_VALID':'INVALID_KEY_TYPE';
    }catch{checks.publicApprovalKey='INVALID_PEM';}
  }
  const formatReady=checks.accountId==='FORMAT_VALID'&&
    checks.callerHmacKey==='FORMAT_VALID'&&checks.preimageAesKey==='FORMAT_VALID'&&
    checks.keySeparation==='DISTINCT'&&
    checks.publicApprovalKey==='ED25519_FORMAT_VALID'&&
    checks.metadataReadToken==='PRESENT_SCOPE_NOT_ATTESTED'&&
    checks.workerDeployToken==='PRESENT_SCOPE_NOT_ATTESTED'&&
    checks.runtimeD1ReadToken==='PRESENT_SCOPE_NOT_ATTESTED';
  return {
    contract:'FRMS_PRIVATE_WORKER_STAGING_PREFLIGHT_V1',
    verdict:formatReady?'INPUTS_PRESENT_EXTERNAL_AUTHORIZATION_REQUIRED':'BLOCKED_MISSING_OR_INVALID_INPUT',
    checks,
    // Never treat GET success as proof of D1 Read-only; D1 Write also allows GET.
    pendingIndependentEvidence:[
      'D1_RUNTIME_TOKEN_READ_ONLY_SCOPE',
      'ED25519_INDEPENDENT_SIGNING_AUTHORITY',
      'EXACT_F0_WORKER_PHASE_GRANT',
      'AUTHORIZED_PRIVATE_SERVICE_BINDING_CALLER',
    ],
    tokenValuesExposed:false,
    tokenCreated:false,
    cloudflareWrites:0,
    deploymentExecuted:false,
  };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  const result=inspectPrivateWorkerPrerequisites(process.env);
  console.log(JSON.stringify(result));
  // Missing inputs are a valid finding in this read-only diagnostic, not
  // a reason to weaken the guarded worker deployment contract.
}
