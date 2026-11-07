/**
 * Independent FRMS approval authority: HTTPS-only, OIDC-authenticated
 * request/response adapter for the SAME staging Actions transaction job.
 * This module DOES NOT create keys, issue administrator grants, sign anything
 * itself, or store Cloudflare/GitHub credentials in the signer. The server
 * must validate the GitHub OIDC claims and independently authorize each
 * receipt and exact new apply grant. Ed25519 verification remains in the
 * transaction controller.
 */
import {createHash} from 'node:crypto';

const REPO='Airtrust-Org/airtrust';
const SHA=/^[a-f0-9]{40}$/,HEX64=/^[a-f0-9]{64}$/;
const GRANT=/^[1-9][0-9]{5,13}$/;
const deny=()=>{throw Error('FRMS_QA_EXTERNAL_SIGNER_DENIED');};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).sort().join('|')===keys.slice().sort().join('|');

function signerOrigin({origin,originSha256}){
  if(typeof origin!=='string'||origin.length>240||
     !HEX64.test(originSha256||''))deny();
  let url;
  try{url=new URL(origin);}catch{deny();}
  if(url.protocol!=='https:'||url.port||url.username||url.password||
     url.pathname!=='/'||url.search||url.hash||
     url.hostname==='localhost'||url.hostname.endsWith('.localhost')||
     url.hostname.endsWith('.local')||url.hostname.endsWith('.internal')||
     /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname)||
     url.hostname.includes(':')||url.hostname.length<6||
     createHash('sha256').update(url.origin).digest('hex')!==originSha256)
    deny();
  return url.origin;
}

async function actionOidc({env,fetcher,audience}){
  const url=env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const token=env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if(env.GITHUB_ACTIONS!=='true'||
     env.GITHUB_REPOSITORY!==REPO||
     env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     !SHA.test(env.GITHUB_SHA||'')||
     typeof token!=='string'||!token||
     typeof url!=='string'||url.length>900)deny();
  let endpoint;
  try{endpoint=new URL(url);}catch{deny();}
  if(endpoint.protocol!=='https:'||
     !/^(?:pipelines|vstoken)\.actions\.githubusercontent\.com$/.test(endpoint.hostname)||
     !endpoint.pathname||endpoint.username||endpoint.password||
     endpoint.hash)deny();
  endpoint.searchParams.set('audience',audience);
  let res,payload;
  try{
    res=await fetcher(endpoint.toString(),{
      method:'GET',redirect:'manual',
      headers:{Authorization:'Bearer '+token,Accept:'application/json'},
      signal:AbortSignal.timeout(15000),
    });
    if(res?.status!==200||res.redirected===true)deny();
    payload=await res.json();
  }catch{deny();}
  const jwt=payload?.value;
  if(typeof jwt!=='string'||jwt.length>10000||
     !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt))deny();
  return jwt;
}

export function independentFrmsSigner({env={},fetcher=fetch}={}){
  if(typeof fetcher!=='function'||!HEX64.test(env.FRMS_QA_APPROVAL_PUBLIC_KEY_SHA256||'')||
     env.GITHUB_WORKFLOW_REF!==
       REPO+'/.github/workflows/staging-frms-qa-private-transaction.yml@refs/heads/main')
    deny();
  const origin=signerOrigin({
    origin:env.FRMS_QA_SIGNER_ORIGIN,
    originSha256:env.FRMS_QA_SIGNER_ORIGIN_SHA256,
  });
  const pin=env.FRMS_QA_APPROVAL_PUBLIC_KEY_SHA256;
  const audience='airtrust-frms-qa-signing-staging';
  const submit=async (path,body)=>{
    const jwt=await actionOidc({env,fetcher,audience});
    let response,data;
    try{
      response=await fetcher(origin+'/api/frms-qa/v1/'+path,{
        method:'POST',redirect:'manual',
        headers:{Authorization:'Bearer '+jwt,'Content-Type':'application/json',
          Accept:'application/json'},
        body:JSON.stringify(body),signal:AbortSignal.timeout(15000),
      });
      if(response?.status!==200||response.redirected===true)deny();
      data=await response.json();
    }catch{deny();}
    if(!data||typeof data!=='object'||Array.isArray(data))deny();
    return data;
  };
  return Object.freeze({
    async assertReady({sha,publicKeySha256,scope}={}){
      if(sha!==env.GITHUB_SHA||!SHA.test(sha||'')||
         publicKeySha256!==pin||
         scope!=='FRMS_QA_999013_4_CASES_4_JOURNEYS')deny();
      const outcome=await submit('ready',{
        sha,publicKeySha256,scope,tenantId:999013,
        githubRunId:env.GITHUB_RUN_ID,
        githubRunAttempt:env.GITHUB_RUN_ATTEMPT,
      });
      if(!exact(outcome,['status','sha','publicKeySha256'])||
         outcome.status!=='INDEPENDENT_SIGNER_READY'||
         outcome.sha!==sha||outcome.publicKeySha256!==pin)deny();
      return outcome;
    },
    async signReceipt({sha,receipt,receiptId,publicKeySha256}={}){
      if(sha!==env.GITHUB_SHA||!SHA.test(sha||'')||
         publicKeySha256!==pin||!HEX64.test(receiptId||'')||
         !receipt||typeof receipt!=='object'||Array.isArray(receipt)||
         receipt.environment!=='staging'||receipt.tenantId!==999013||
         receipt.writes!==0)deny();
      const payload=await submit('sign',{
        sha,receipt,receiptId,publicKeySha256,tenantId:999013,
        githubRunId:env.GITHUB_RUN_ID,
        githubRunAttempt:env.GITHUB_RUN_ATTEMPT,
      });
      if(!exact(payload,['manifest','signatureBase64','applyGrantId'])||
         !GRANT.test(String(payload.applyGrantId||''))||
         typeof payload.signatureBase64!=='string'||
         payload.signatureBase64.length>120||
         !payload.manifest||typeof payload.manifest!=='object')deny();
      return payload;
    },
  });
}
