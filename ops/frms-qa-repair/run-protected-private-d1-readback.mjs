/**
 * Protected D1-only final postcondition job in the SAME workflow-level mutex.
 * No Worker/Queue credential exists in this job. It MUST follow a successful
 * apply-stage job and never interprets its Queue reply as physical acceptance.
 */
import {readbackReviewedF0} from './private-transaction-readback.mjs';

const SHA=/^[0-9a-f]{40}$/;
const deny=()=>{throw Error('FRMS_QA_POSTCONDITION_DENIED');};
export function validateD1PostconditionEntry(env={}){
  if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.GITHUB_REPOSITORY!=='Airtrust-Org/airtrust'||
     env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_WORKFLOW_REF!==
       'Airtrust-Org/airtrust/.github/workflows/staging-frms-qa-private-transaction.yml@refs/heads/main'||
     !SHA.test(env.GITHUB_SHA||'')||
     env.FRMS_QA_EXPECTED_APPLY_SHA!==env.GITHUB_SHA||
     env.FRMS_QA_APPLY_STAGE_RESULT!==
       'APPLY_REPORTED_PENDING_INDEPENDENT_READBACK'||
     !/^[0-9a-f]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID||'')||
     !env.CLOUDFLARE_D1_MIGRATION_API_TOKEN||
     env.CLOUDFLARE_WORKER_API_TOKEN||
     env.FRMS_QA_CALLER_KEY_HEX||env.FRMS_QA_APPROVAL_PRIVATE_KEY_PEM||
     env.FRMS_QA_D1_READ_TOKEN)deny();
  return Object.freeze({sha:env.GITHUB_SHA,
    phase:'d1-readonly-postcondition',d1Writes:0});
}

if(import.meta.url===new URL('file://'+process.argv[1]).href){
  try{
    if(process.argv.length!==2)deny();
    validateD1PostconditionEntry(process.env);
    const result=await readbackReviewedF0({
      env:process.env,sha:process.env.GITHUB_SHA});
    if(result.verdict!=='READONLY_ACCEPTANCE_READY'||
       result.valid!==4||result.writes!==0)deny();
    console.log(JSON.stringify({verdict:'STAGING_FRMS_F0_4_OF_4_READONLY_VERIFIED',
      valid:4,writes:0,tenantId:999013,sha:result.sha,
      productionAuthorized:false}));
  }catch{
    console.error('FRMS_QA_POSTCONDITION_FAILED_CLOSED_RECONCILE_MANUALLY');
    process.exitCode=1;
  }
}
