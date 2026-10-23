// GitHub Actions protected staging only. No Cloudflare mutation until the
// exact current-main admin grant, actor, workflow identity and eight gates PASS.
import {readFile} from 'node:fs/promises';
import {verifyQueueProvisionAdminGrant,ensurePrivateQueues} from
  './provision-private-queues.mjs';

try{
  if(process.argv.length!==2)throw Error('FRMS_QA_QUEUE_PROVISION_DENIED');
  const config=await readFile(new URL('./wrangler.caller.staging.toml',import.meta.url),'utf8');
  const verified=await verifyQueueProvisionAdminGrant({
    env:process.env,callerConfig:config});
  if(verified.status!=='QUEUE_PROVISION_ADMIN_GRANT_VERIFIED'||
     verified.sha!==process.env.GITHUB_SHA||
     !process.env.CLOUDFLARE_WORKER_API_TOKEN)throw Error('FRMS_QA_QUEUE_PROVISION_DENIED');
  const result=await ensurePrivateQueues({
    accountId:verified.accountId,token:process.env.CLOUDFLARE_WORKER_API_TOKEN});
  console.log(JSON.stringify({verdict:result.verdict,queueNamesPresent:result.queueNamesPresent,
    queueNamesExpected:result.queueNamesExpected,queuesCreated:result.queuesCreated,
    retentionUpdates:result.retentionUpdates,httpPullCreated:result.httpPullCreated,
    maxQueueRetentionSeconds:result.maxQueueRetentionSeconds,
    queueHttpPullConfigured:result.queueHttpPullConfigured,
    d1Writes:0,r2Writes:0,workerDeploys:0,
    productionWrites:0,remainingApproval:'PRIVATE_CALLER_DEPLOY_AND_ED25519_SIGNER'}));
}catch{
  console.error('FRMS_QA_PRIVATE_QUEUES_PROVISION_FAILED_CLOSED');
  process.exitCode=1;
}
