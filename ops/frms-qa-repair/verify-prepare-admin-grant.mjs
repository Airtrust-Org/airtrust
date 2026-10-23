/**
 * Read-only GitHub administrative F0 grant verifier for FRMS prepare-only.
 * No grant issuance, secret access, Cloudflare calls, D1/R2 writes or Worker RPC.
 * Future operational use requires a trusted deployment of this verifier,
 * a protected caller, serial staging mutex and durable one-use grant ledger.
 */
import {TARGET} from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';
import {EXPECTED} from './verify-readiness.mjs';

const REPO='Airtrust-Org/airtrust',ISSUE=776;
const WORKFLOW='.github/workflows/staging-frms-qa-private-prepare.yml';
const WORKFLOW_REF=REPO+'/'+WORKFLOW+'@refs/heads/main';
const MUTEX='airtrust-staging-mutations-and-scorm-qa';
const SCOPE='FRMS_QA_999013_4_CASES_4_JOURNEYS';
const PLAN_SHA='38a81ed05821919d87b424ddfc7b731bfc8d7d759dadebbb6a21d11edb349ed3';
const GATES=['lint','build-content-gates','worker-typecheck','frontend-coverage',
  'worker-tests-1','worker-tests-2','lms-smoke','public-e2e'];
const SHA=/^[0-9a-f]{40}$/, POS=/^[1-9][0-9]{0,15}$/;
const USER=/^[a-zA-Z0-9-]{1,39}$/;
const deny=()=>{throw Error('FRMS_QA_PREPARE_ADMIN_GRANT_DENIED');};
const exact=(obj,reference)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
  Object.keys(obj).sort().join('|')===Object.keys(reference).sort().join('|')&&
  Object.entries(reference).every(([k,v])=>obj[k]===v);

export function exactPreparePlan({sha}={}){
  if(!SHA.test(sha||''))deny();
  return {
    schema:'AIRTRUST_FRMS_QA_PREPARE_GRANT_V1',
    repository:REPO,coordination_issue:ISSUE,frms_issue:1426,
    phase:'prepare',release_sha:sha,environment:'staging',
    scope:SCOPE,tenant_id:999013,d1_uuid:TARGET.db_id,
    d1_name:TARGET.db_name,reviewed_plan_sha256:PLAN_SHA,
    worker:EXPECTED.worker,r2_bucket:EXPECTED.bucket,
    r2_prefix:EXPECTED.prefix,global_mutex:MUTEX,
    workflow_path:WORKFLOW,
    operation:'ENCRYPTED_PREIMAGE_PREPARE_ONLY',
    d1_writes_authorized:0,apply_authorized:false,
    worker_deploy_authorized:false,production_authorized:false,
    recovery_required:true,
  };
}

/** The issue comment itself must be a NEW, unedited, exact admin document. */
export function assertPrepareGrantBody(body,plan){
  const prefix='AIRTRUST_FRMS_QA_PREPARE_GRANT_V1\n';
  if(typeof body!=='string'||!body.startsWith(prefix))deny();
  let grant;
  try{grant=JSON.parse(body.slice(prefix.length));}catch{deny();}
  if(!exact(grant,plan))deny();
}

/** Host-pinned HTTPS GET only; never logs GitHub token or any API response. */
export function githubPrepareReadOnlyApi({token,fetcher=fetch}={}){
  if(typeof token!=='string'||!token.trim()||typeof fetcher!=='function')deny();
  return async path=>{
    const prefix='repos/'+REPO+'/';
    const suffix=typeof path==='string'&&path.startsWith(prefix)?
      path.slice(prefix.length):'';
    const checkNames=GATES.map(encodeURIComponent).join('|');
    const allow=suffix==='branches/main'||
      /^actions\/runs\/[1-9][0-9]{7,13}$/.test(suffix)||
      /^issues\/comments\/[1-9][0-9]{0,15}$/.test(suffix)||
      /^collaborators\/[a-zA-Z0-9-]{1,39}\/permission$/.test(suffix)||
      new RegExp('^commits/[a-f0-9]{40}/check-runs\\?check_name=('+
        checkNames+')&filter=latest&per_page=100$').test(suffix);
    if(!allow)deny();
    let response,data;
    try{
      response=await fetcher('https://api.github.com/'+path,{
        method:'GET',redirect:'manual',
        headers:{Authorization:'Bearer '+token,
          Accept:'application/vnd.github+json',
          'X-GitHub-Api-Version':'2022-11-28'},
        signal:AbortSignal.timeout(15000),
      });
      if(response?.status!==200||response.redirected)deny();
      data=await response.json();
    }catch{deny();}
    if(!data||typeof data!=='object'||Array.isArray(data))deny();
    return data;
  };
}

/**
 * Intended for a F0-controlled GitHub Actions runner only. A forged env or
 * injected api callback is NOT authentication. The trusted runner must own
 * the GitHub token and pin the workflow SHA, mutex and caller implementation.
 *
 * Run ID cannot be known when the admin writes the authorization comment;
 * instead verify run identity through authenticated GitHub Actions GET.
 */
export async function verifyPrepareAdminGrant({
  env={},api,now=Date.now(),
}={}){
  const sha=env.GITHUB_SHA,grantId=String(env.FRMS_QA_PREPARE_GRANT_ID||''),
    runId=String(env.GITHUB_RUN_ID||''),attempt=Number(env.GITHUB_RUN_ATTEMPT);
  if(env.GITHUB_ACTIONS!=='true'||
     env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_REPOSITORY!==REPO||
     env.GITHUB_WORKFLOW_REF!==WORKFLOW_REF||
     env.FRMS_QA_PREPARE_CONFIRM!=='AIRTRUST_FRMS_QA_PREPARE_ONLY_F0_APPROVED'||
     env.FRMS_QA_PREPARE_EXPECTED_SHA!==sha||
     !SHA.test(sha||'')||!POS.test(grantId)||!POS.test(runId)||
     !Number.isSafeInteger(attempt)||attempt<1||
     !USER.test(env.GITHUB_ACTOR||'')||
     !Number.isFinite(now)||typeof api!=='function')deny();
  const plan=exactPreparePlan({sha});
  let main,run,comment;
  try{
    [main,run,comment]=await Promise.all([
      api('repos/'+REPO+'/branches/main'),
      api('repos/'+REPO+'/actions/runs/'+runId),
      api('repos/'+REPO+'/issues/comments/'+grantId),
    ]);
  }catch{deny();}
  if(main?.commit?.sha!==sha||
     run?.id!==Number(runId)||run?.head_sha!==sha||
     run?.head_branch!=='main'||run?.event!=='workflow_dispatch'||
     run?.path!==WORKFLOW||run?.run_attempt!==attempt||
     run?.actor?.login!==env.GITHUB_ACTOR||
     !['queued','in_progress','waiting','requested'].includes(run?.status))
    deny();
  if(comment?.id!==Number(grantId)||
     comment?.issue_url!=='https://api.github.com/repos/'+REPO+'/issues/'+ISSUE||
     comment.created_at!==comment.updated_at||
     !USER.test(comment?.user?.login||''))deny();
  const age=now-Date.parse(comment.created_at);
  if(!Number.isFinite(age)||age<0||age>2*3600000)deny();
  assertPrepareGrantBody(comment.body,plan);
  const admins=new Set([comment.user.login,env.GITHUB_ACTOR]);
  let responses;
  try{
    responses=await Promise.all([
      ...[...admins].map(login=>api('repos/'+REPO+'/collaborators/'+login+'/permission')),
      ...GATES.map(name=>api('repos/'+REPO+'/commits/'+sha+
        '/check-runs?check_name='+encodeURIComponent(name)+'&filter=latest&per_page=100')),
    ]);
  }catch{deny();}
  const perms=responses.slice(0,admins.size),
    gates=responses.slice(admins.size);
  if(!perms.every(p=>p?.permission==='admin')||
     !gates.every((group,index)=>group&&Array.isArray(group.check_runs)&&
       group.check_runs.some(c=>c.name===GATES[index]&&
         c.head_sha===sha&&c.status==='completed'&&
         c.conclusion==='success'&&c.app?.slug==='github-actions')))
    deny();
  return Object.freeze({
    schema:'AIRTRUST_FRMS_QA_PREPARE_GRANT_VERIFIED_V1',
    status:'VERIFIED_BY_INDEPENDENT_GITHUB_ADMIN_CHECK',
    sha,dbId:TARGET.db_id,tenantId:999013,
    grantId,runId,runAttempt:attempt,
  });
}
