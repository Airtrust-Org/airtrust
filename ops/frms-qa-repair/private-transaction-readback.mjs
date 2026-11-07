/**
 * Fixed FRMS F0 staging D1 SELECT-only acceptance adapter.
 * Reuses the existing reviewed-four-case inspector; does not introduce SQL,
 * shell interpolation, R2, Worker RPC, restore or schema mutation.
 * This function runs only in the same Actions job/mutex that owns the apply.
 */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {TARGET} from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';

const REPO='Airtrust-Org/airtrust';
const SHA=/^[0-9a-f]{40}$/;
const PREFIX='FRMS_QA_REVIEWED_FIXED_STATUS_ONLY=';
const deny=()=>{throw Error('FRMS_QA_TRANSACTION_READBACK_DENIED');};
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const script=resolve(root,'scripts/staging/inspect-frms-ux-cases.mjs');

export function verifyReviewedFourCaseOutput({
  output,sha,dbId=TARGET.db_id,tenantId=999013,
}={}){
  if(typeof output!=='string'||output.length>14000||!SHA.test(sha||'')||
     dbId!==TARGET.db_id||tenantId!==999013)deny();
  const matching=output.split(/\r?\n/).filter(x=>x.startsWith(PREFIX));
  if(matching.length!==1)deny();
  let body;
  try{body=JSON.parse(matching[0].slice(PREFIX.length));}catch{deny();}
  if(!body||body.tenant_id!==999013||body.evaluated!==4||
     body.valid!==4||body.writes!==0||
     body.verdict!=='READONLY_ACCEPTANCE_READY'||
     !Array.isArray(body.cases)||body.cases.length!==4||
     new Set(body.cases.map(x=>x.case_id)).size!==4||
     ![1,2,3,4].every(n=>body.cases.some(x=>
       x.case_id==='qa-frms-ux-case-'+n&&x.status==='VALID')))
    deny();
  return Object.freeze({verdict:'READONLY_ACCEPTANCE_READY',
    valid:4,writes:0,tenantId:999013,dbId:TARGET.db_id,sha});
}

/**
 * Dependency injection allows negative tests without a Cloudflare connection.
 * A real runner uses Node.spawnSync and never reveals the inspector stdout.
 */
export async function readbackReviewedF0({
  env={},sha,dbId=TARGET.db_id,tenantId=999013,
  execute=spawnSync,
}={}){
  if(!SHA.test(sha||'')||sha!==env.GITHUB_SHA||
     env.GITHUB_ACTIONS!=='true'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_REPOSITORY!==REPO||
     env.GITHUB_WORKFLOW_REF!==
       REPO+'/.github/workflows/staging-frms-qa-private-transaction.yml@refs/heads/main'||
     !env.CLOUDFLARE_ACCOUNT_ID||
     !/^[0-9a-f]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID)||
     !env.CLOUDFLARE_D1_MIGRATION_API_TOKEN||
     typeof execute!=='function'||dbId!==TARGET.db_id||tenantId!==999013)
    deny();
  // The inspector independently verifies the D1 UUID and only emits fixed
  // SELECTs restricted to 4 synthetic QA IDs and tenant 999013.
  let execution;
  try{
    execution=execute(process.execPath,[script,'--reviewed-fixed-status-only'],{
      cwd:root,timeout:120000,encoding:'utf8',maxBuffer:65536,
      env:{...env,
        STAGING_D1_NAME:TARGET.db_name,STAGING_D1_ID:TARGET.db_id,
        FRMS_QA_FIXED_STATUS_ONLY:'FRMS_QA_REVIEWED_4CASE_STATUS_READONLY',
        FRMS_QA_EXPECTED_MAIN_SHA:sha,
        CONFIRM_FRMS_QA_CASES_INSPECT:'AIRTRUST_STAGING_FRMS_CASES_READONLY',
        CLOUDFLARE_API_TOKEN:env.CLOUDFLARE_D1_MIGRATION_API_TOKEN,
        SOURCE_AGGREGATE_SHA:'',SANITIZED_AGGREGATE_PATH:'',
      },
    });
  }catch{deny();}
  if(execution?.status!==0||execution.error||
     typeof execution.stdout!=='string')deny();
  return verifyReviewedFourCaseOutput({
    output:execution.stdout,sha,dbId,tenantId});
}
