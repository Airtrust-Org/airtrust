/**
 * Executes only inside the single protected staging workflow mutex.
 * Never prints receipt contents, manifest, recovery bookmark, token or signed
 * payload. Does not generate signing keys or self-issue GitHub admin grants.
 */
import {appendFileSync} from 'node:fs';
import {independentFrmsSigner} from './external-approval-signer.mjs';
import {runProtectedPrivateTransaction} from './private-transaction-runner.mjs';

const deny=()=>{throw Error('FRMS_QA_TRANSACTION_ENTRY_DENIED');};
export function validatePrivateTransactionEntry(env={}){
  if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.GITHUB_REPOSITORY!=='Airtrust-Org/airtrust'||
     env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_WORKFLOW_REF!==
       'Airtrust-Org/airtrust/.github/workflows/staging-frms-qa-private-transaction.yml@refs/heads/main'||
     !/^[0-9a-f]{40}$/.test(env.GITHUB_SHA||'')||
     env.FRMS_QA_PREPARE_EXPECTED_SHA!==env.GITHUB_SHA||
     env.FRMS_QA_PREPARE_CONFIRM!=='AIRTRUST_FRMS_QA_PREPARE_ONLY_F0_APPROVED'||
     !/^[1-9][0-9]{0,15}$/.test(env.FRMS_QA_PREPARE_GRANT_ID||'')||
     !/^[0-9a-f]{64}$/.test(env.FRMS_QA_APPROVAL_PUBLIC_KEY_SHA256||'')||
     !/^[0-9a-f]{64}$/.test(env.FRMS_QA_CALLER_KEY_HEX||'')||
     !env.CLOUDFLARE_WORKER_API_TOKEN||
     env.CLOUDFLARE_D1_MIGRATION_API_TOKEN||
     env.FRMS_QA_TRANSACTION_PHASE!=='queue-apply'||
     !env.FRMS_QA_APPROVAL_PUBLIC_KEY_PEM||
     !env.FRMS_QA_SIGNER_ORIGIN||
     !env.FRMS_QA_SIGNER_ORIGIN_SHA256||
     !env.GITHUB_TOKEN||
     !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||
     !env.ACTIONS_ID_TOKEN_REQUEST_URL||
     env.FRMS_QA_APPROVAL_PRIVATE_KEY_PEM||
     env.FRMS_QA_D1_READ_TOKEN)deny();
  return Object.freeze({stage:'AUTHORIZED_ENTRY_CONDITIONS_PRESENT',
    sha:env.GITHUB_SHA,phase:'single_mutex_transaction',
    productionAuthorized:false});
}

if(import.meta.url===new URL('file://'+process.argv[1]).href){
  try{
    if(process.argv.length!==2)deny();
    validatePrivateTransactionEntry(process.env);
    const signer=independentFrmsSigner({env:process.env});
    const result=await runProtectedPrivateTransaction({env:process.env,signer,
      completionMode:'apply-stage',
      sleep:()=>new Promise(resolve=>setTimeout(resolve,1000))});
    if(result.verdict!=='APPLY_REPORTED_PENDING_INDEPENDENT_READBACK'||
       result.d1ReadbackComplete!==false||result.sha!==process.env.GITHUB_SHA)
      deny();
    // The following D1-only job starts only after a successful Queue job
    // output. GitHub workflow concurrency remains held across both jobs.
    const path=process.env.GITHUB_OUTPUT;
    if(typeof path!=='string'||!path.trim())deny();
    appendFileSync(path,'apply_validation=APPLY_REPORTED_PENDING_INDEPENDENT_READBACK\n');
    console.log(JSON.stringify({verdict:result.verdict,sha:result.sha,
      tenantId:999013,d1ReadbackComplete:false,productionAuthorized:false}));
  }catch{
    console.error('FRMS_QA_TRANSACTION_FAILED_CLOSED_NEEDS_MANUAL_RECONCILIATION');
    process.exitCode=1;
  }
}
