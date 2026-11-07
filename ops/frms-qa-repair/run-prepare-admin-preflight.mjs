/**
 * FRMS read-only Actions control-plane entrypoint. No Cloudflare calls,
 * no R2/D1 writes, no private service-binding RPC and no grant issuance.
 * A passing result only authenticates a fresh, exact F0 prepare grant.
 */
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {
  verifyPrepareAdminGrant, githubPrepareReadOnlyApi,
} from './verify-prepare-admin-grant.mjs';

export async function runPrepareAdminPreflight({env=process.env,api}={}){
  if(typeof api!=='function'||!env.GITHUB_TOKEN)
    throw Error('FRMS_QA_PREPARE_PREFLIGHT_DENIED');
  const verified=await verifyPrepareAdminGrant({env,api});
  if(verified.status!=='VERIFIED_BY_INDEPENDENT_GITHUB_ADMIN_CHECK'||
     verified.schema!=='AIRTRUST_FRMS_QA_PREPARE_GRANT_VERIFIED_V1')
    throw Error('FRMS_QA_PREPARE_PREFLIGHT_DENIED');
  return Object.freeze({
    verdict:'FRMS_QA_PREPARE_ADMIN_GRANT_READONLY_VERIFIED',
    sha:verified.sha,tenantId:verified.tenantId,dbId:verified.dbId,
    workerRpcExecuted:false,d1Writes:0,r2Writes:0,applyAuthorized:false,
    deploymentExecuted:false,
  });
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  try{
    const api=githubPrepareReadOnlyApi({token:process.env.GITHUB_TOKEN});
    const evidence=await runPrepareAdminPreflight({api});
    // Never output grant body, comment metadata, user data or GitHub token.
    console.log(JSON.stringify(evidence));
  }catch{
    console.error('FRMS_QA_PREPARE_PREFLIGHT_DENIED');
    process.exitCode=1;
  }
}
