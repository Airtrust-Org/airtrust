/**
 * SANITIZED GET-ONLY audit of a PREEXISTING Cloudflare staging API token.
 * No token issuance/rotation, permission writes, policy content or IDs printed.
 * Even a narrow result is a candidate for independent security review, never
 * authorization to store a bearer credential in the FRMS private Worker.
 */
const FAIL='TOKEN_POLICY_METADATA_UNAVAILABLE';
const ACCOUNT=/^[0-9a-f]{32}$/;
const H32=/^[0-9a-f]{32}$/;
const ORIGIN='https://api.cloudflare.com/client/v4';
const fixedAccount=(id)=>'com.cloudflare.api.account.'+id;

async function getJson(path,token,fetcher){
  try{
    const response=await fetcher(ORIGIN+path,{
      method:'GET',redirect:'manual',
      headers:{Authorization:'Bearer '+token,Accept:'application/json'},
      signal:AbortSignal.timeout(15000),
    });
    if(response?.status!==200||response.redirected)return null;
    const body=await response.json();
    return body?.success===true&&body.result&&typeof body.result==='object'
      ? body.result:null;
  }catch{return null;}
}

function readOnlyScopeCandidate(policies,accountId){
  if(!Array.isArray(policies)||!policies.length)return 'POLICY_NOT_ATTESTED';
  let hasD1=false;
  for(const policy of policies){
    if(!policy||policy.effect!=='allow')return 'POLICY_NOT_ATTESTED';
    const groups=policy.permission_groups;
    if(!Array.isArray(groups)||!groups.length)return 'POLICY_NOT_ATTESTED';
    // Cloudflare's published permission name is exactly "D1 Read"; any
    // other permission (even unrelated Read) requires independent review.
    if(groups.some(g=>typeof g?.name!=='string'||g.name!=='D1 Read'))
      return 'NON_EXCLUSIVE_D1_READ_POLICY';
    const resources=policy.resources;
    if(!resources||typeof resources!=='object'||Array.isArray(resources))return 'POLICY_NOT_ATTESTED';
    if(Object.keys(resources).length!==1||
       !Object.hasOwn(resources,fixedAccount(accountId))||
       resources[fixedAccount(accountId)]!=='*')
      return 'UNVERIFIED_ACCOUNT_RESOURCE_SCOPE';
    hasD1=true;
  }
  return hasD1?'D1_READ_ONLY_CANDIDATE_REQUIRES_INDEPENDENT_ATTESTATION':'POLICY_NOT_ATTESTED';
}

/** GET-only, no attempts to query arbitrary IDs or any token value. */
export async function probeExistingTokenPolicy({
  accountId,token,kind,fetcher=fetch,
}={}){
  if(!ACCOUNT.test(accountId||'')||
     typeof token!=='string'||!token.trim()||
     !['worker','d1_backup'].includes(kind)||typeof fetcher!=='function')
    return {verdict:'INPUTS_NOT_AVAILABLE',writes:0,usableForPrivateWorker:false};
  for(const prefix of ['/accounts/'+accountId+'/tokens','/user/tokens']){
    const verified=await getJson(prefix+'/verify',token,fetcher);
    if(!verified||!H32.test(verified.id??''))continue;
    if(verified.status!=='active')
      return {verdict:'TOKEN_NOT_ACTIVE',writes:0,usableForPrivateWorker:false};
    const policy=await getJson(prefix+'/'+verified.id,token,fetcher);
    const verdict=policy&&policy.id===verified.id?
      readOnlyScopeCandidate(policy.policies,accountId):FAIL;
    // Deliberately don't return IDs, policy objects, group names, expiry
    // timestamps, resource names, account ID or the bearer token.
    return {verdict,writes:0,usableForPrivateWorker:false};
  }
  return {verdict:'TOKEN_VERIFY_UNAVAILABLE',writes:0,usableForPrivateWorker:false};
}
