/**
 * GET-only Cloudflare Queue inventory for preexisting staging credentials.
 * This never retrieves token values, leases or messages, and cannot infer
 * Queues Write/ack scope from a successful metadata GET.
 * Authorized use: staging Actions GET-only diagnostic, not provisioning.
 */
const ACCOUNT=/^[a-f0-9]{32}$/;
const QUEUES=['airtrust-frms-qa-private-prepare-staging',
  'airtrust-frms-qa-private-results-staging'];
const ORIGIN='https://api.cloudflare.com/client/v4';

export async function probeExistingQueueMetadata({accountId,token,fetcher=fetch}={}){
  const denied=Object.freeze({verdict:'CLOUDFLARE_QUEUE_READ_NOT_ATTESTED',
    queueNamesPresent:0,queueNamesExpected:2,writePermissionAttested:false,
    queueMessagesRead:0,queueMessagesWritten:0,cloudflareWrites:0});
  if(!ACCOUNT.test(accountId||'')||typeof token!=='string'||!token.trim()||
     typeof fetcher!=='function')return denied;
  try{
    const res=await fetcher(ORIGIN+'/accounts/'+accountId+'/queues?per_page=100',{
      method:'GET',redirect:'manual',
      headers:{Authorization:'Bearer '+token,Accept:'application/json'},
      signal:AbortSignal.timeout(15000),
    });
    if(res?.status!==200||res.redirected===true)return denied;
    const body=await res.json();
    if(body?.success!==true||!Array.isArray(body.result)||
       body.result.length>100||body.result_info?.total_count>100)return denied;
    if(body.result.some(q=>!q||typeof q.queue_name!=='string'))return denied;
    const names=new Set(body.result.map(q=>q.queue_name));
    const present=QUEUES.filter(n=>names.has(n)).length;
    return Object.freeze({verdict:present===2?
      'EXPECTED_QUEUE_NAMES_FOUND_GET_ONLY':'QUEUE_NAMES_NOT_YET_PROVISIONED',
      queueNamesPresent:present,queueNamesExpected:2,
      writePermissionAttested:false,queueMessagesRead:0,
      queueMessagesWritten:0,cloudflareWrites:0});
  }catch{return denied;}
}
