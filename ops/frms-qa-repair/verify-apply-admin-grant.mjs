/**
 * Protected-runner-only, GET-only verification of a separate FRMS F0 apply grant.
 * A signed Ed25519 manifest is required by the Worker AND an independently
 * authenticated unedited administrator comment is required by this producer.
 * Neither proof authorizes Cloudflare writes until the staging transaction
 * workflow, global mutex and independent signer are actually provisioned.
 */
import {createHash} from 'node:crypto';
import {TARGET,buildReviewPlan} from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';
import {githubPrepareReadOnlyApi} from './verify-prepare-admin-grant.mjs';

const REPO='Airtrust-Org/airtrust',ISSUE=776;
const WORKFLOW='.github/workflows/staging-frms-qa-private-transaction.yml';
const REF=REPO+'/'+WORKFLOW+'@refs/heads/main';
const SHA=/^[0-9a-f]{40}$/,HEX64=/^[0-9a-f]{64}$/;
const POS=/^[1-9][0-9]{5,13}$/,USER=/^[A-Za-z0-9-]{1,39}$/;
const PLAN_SHA='38a81ed05821919d87b424ddfc7b731bfc8d7d759dadebbb6a21d11edb349ed3';
const GATES=['lint','build-content-gates','worker-typecheck','frontend-coverage',
  'worker-tests-1','worker-tests-2','lms-smoke','public-e2e'];
const FIELDS=['authority','coordinationIssue','scope','sha','environment','dbId',
  'tenantId','planSha256','authorizedIds','receiptSha256','preimageSha256',
  'artifactSha256','recoveryBookmark','nonce','issuedAt','expiresAt'];
const fail=()=>{throw Error('FRMS_QA_APPLY_ADMIN_GRANT_DENIED');};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).sort().join('|')===keys.slice().sort().join('|');
const validTime=v=>typeof v==='string'&&v.endsWith('Z')&&Number.isFinite(Date.parse(v));
const days=Array.from({length:30},(_,i)=>({day:new Date(Date.parse('2026-09-14T00:00:00Z')+i*86400000).toISOString().slice(0,10),
  jornadas:i===29?'0':'5-9'}));
const reviewed=buildReviewPlan(days);
if(reviewed.sql_sha256!==PLAN_SHA)fail();
const allowedIds=reviewed.operations.map(op=>op.id);
const hash=s=>createHash('sha256').update(s).digest('hex');

export function exactApplyGrantPlan({sha,manifest,receiptId,signatureBase64}={}){
  const signed=Buffer.from(String(signatureBase64||''),'base64');
  if(!SHA.test(sha||'')||!exact(manifest,FIELDS)||
     manifest.authority!=='AIRTRUST_RELEASE_COORDINATION'||
     manifest.coordinationIssue!==ISSUE||
     manifest.scope!=='FRMS_QA_999013_4_CASES_4_JOURNEYS'||
     manifest.sha!==sha||manifest.environment!=='staging'||
     manifest.dbId!==TARGET.db_id||manifest.tenantId!==999013||
     manifest.planSha256!==PLAN_SHA||
     !Array.isArray(manifest.authorizedIds)||
     manifest.authorizedIds.length!==allowedIds.length||
     !manifest.authorizedIds.every((id,i)=>id===allowedIds[i])||
     !HEX64.test(receiptId||'')||manifest.receiptSha256!==receiptId||
     !HEX64.test(manifest.preimageSha256||'')||
     !HEX64.test(manifest.artifactSha256||'')||
     !HEX64.test(manifest.nonce||'')||
     !/^[A-Za-z0-9-]{1,160}$/.test(manifest.recoveryBookmark||'')||
     !validTime(manifest.issuedAt)||!validTime(manifest.expiresAt)||
     Date.parse(manifest.expiresAt)<=Date.parse(manifest.issuedAt)||
     Date.parse(manifest.expiresAt)-Date.parse(manifest.issuedAt)>900000||
     signed.length!==64||signed.toString('base64')!==signatureBase64)fail();
  return Object.freeze({
    schema:'AIRTRUST_FRMS_QA_APPLY_GRANT_V1',repository:REPO,
    coordination_issue:ISSUE,frms_issue:1426,phase:'apply',
    release_sha:sha,environment:'staging',tenant_id:999013,
    d1_uuid:TARGET.db_id,reviewed_plan_sha256:PLAN_SHA,
    authorized_ids:allowedIds,
    receipt_sha256:receiptId,preimage_sha256:manifest.preimageSha256,
    artifact_sha256:manifest.artifactSha256,
    manifest_sha256:hash(JSON.stringify(manifest)),
    signature_sha256:hash(signed),manifest_nonce:manifest.nonce,
    global_mutex:'airtrust-staging-mutations-and-scorm-qa',
    workflow_path:WORKFLOW,apply_authorized:true,d1_batch_exact_rows:8,
    production_authorized:false,
  });
}

export async function verifyApplyAdminGrant({env={},manifest,receiptId,
  signatureBase64,fetcher=fetch,now=Date.now()}={}){
  const sha=env.GITHUB_SHA,grantId=String(env.FRMS_QA_APPLY_GRANT_ID||''),
    runId=String(env.GITHUB_RUN_ID||''),attempt=Number(env.GITHUB_RUN_ATTEMPT);
  if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_WORKFLOW_REF!==REF||env.FRMS_QA_APPLY_CONFIRM!=='AIRTRUST_FRMS_QA_APPLY_F0_APPROVED'||
     env.FRMS_QA_APPLY_EXPECTED_SHA!==sha||
     !SHA.test(sha||'')||!POS.test(grantId)||!POS.test(runId)||
     !Number.isSafeInteger(attempt)||attempt<1||!USER.test(env.GITHUB_ACTOR||'')||
     !Number.isFinite(now)||typeof env.GITHUB_TOKEN!=='string'||!env.GITHUB_TOKEN.trim()||
     typeof fetcher!=='function')fail();
  const plan=exactApplyGrantPlan({sha,manifest,receiptId,signatureBase64});
  if(now<Date.parse(manifest.issuedAt)-60000||now>Date.parse(manifest.expiresAt))fail();
  const api=githubPrepareReadOnlyApi({token:env.GITHUB_TOKEN,fetcher});
  let main,run,comment;
  try{
    [main,run,comment]=await Promise.all([
      api('repos/'+REPO+'/branches/main'),
      api('repos/'+REPO+'/actions/runs/'+runId),
      api('repos/'+REPO+'/issues/comments/'+grantId),
    ]);
  }catch{fail();}
  if(main?.commit?.sha!==sha||run?.id!==Number(runId)||
     run?.head_sha!==sha||run?.head_branch!=='main'||
     run?.event!=='workflow_dispatch'||run?.path!==WORKFLOW||
     run?.run_attempt!==attempt||run?.actor?.login!==env.GITHUB_ACTOR||
     !['queued','in_progress','waiting','requested'].includes(run?.status)||
     comment?.id!==Number(grantId)||
     comment?.issue_url!=='https://api.github.com/repos/'+REPO+'/issues/'+ISSUE||
     comment.created_at!==comment.updated_at||!USER.test(comment?.user?.login||''))fail();
  const age=now-Date.parse(comment.created_at);
  if(!Number.isFinite(age)||age<0||age>2*3600000||
     typeof comment.body!=='string'||
     !comment.body.startsWith('AIRTRUST_FRMS_QA_APPLY_GRANT_V1\n'))fail();
  let actual;
  try{actual=JSON.parse(comment.body.slice('AIRTRUST_FRMS_QA_APPLY_GRANT_V1\n'.length));}
  catch{fail();}
  if(!exact(actual,Object.keys(plan))||
     Object.entries(plan).some(([key,value])=>
       JSON.stringify(actual[key])!==JSON.stringify(value)))fail();
  const admins=[...new Set([comment.user.login,env.GITHUB_ACTOR])];
  let responses;
  try{
    responses=await Promise.all([
      ...admins.map(login=>api('repos/'+REPO+'/collaborators/'+login+'/permission')),
      ...GATES.map(name=>api('repos/'+REPO+'/commits/'+sha+
        '/check-runs?check_name='+encodeURIComponent(name)+'&filter=latest&per_page=100')),
    ]);
  }catch{fail();}
  if(!responses.slice(0,admins.length).every(x=>x?.permission==='admin')||
     !responses.slice(admins.length).every((group,i)=>
       Array.isArray(group?.check_runs)&&group.check_runs.some(c=>
         c.name===GATES[i]&&c.head_sha===sha&&c.status==='completed'&&
         c.conclusion==='success'&&c.app?.slug==='github-actions')))fail();
  return Object.freeze({status:'VERIFIED_BY_INDEPENDENT_GITHUB_ADMIN_CHECK',
    schema:'AIRTRUST_FRMS_QA_APPLY_GRANT_VERIFIED_V1',
    sha,dbId:TARGET.db_id,tenantId:999013,grantId,runId,runAttempt:attempt});
}
