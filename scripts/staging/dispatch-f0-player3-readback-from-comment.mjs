#!/usr/bin/env node
/**
 * Cloud-only, issue-command dispatcher for the existing protected, read-only
 * Player3 QA workflow. Does not hold staging secrets or access D1/R2.
 * Run on GitHub trusted main only; never dispatch production or a second run.
 */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const REPO='Airtrust-Org/airtrust';
export const PREFIX='AIRTRUST_F0_PLAYER3_READBACK_V1 ';
export const WORKFLOW='staging-player3-existing-learner-readback.yml';
export const GATES=Object.freeze([
  'lint','build-content-gates','worker-typecheck','frontend-coverage',
  'worker-tests-1','worker-tests-2','lms-smoke','public-e2e',
  'lms-scorm-browser-e2e','🧪 Check PR',
]);
const HEX40=/^[a-f0-9]{40}$/;
const HEX64=/^[a-f0-9]{64}$/;
const fail=code=>{throw Error('PLAYER3_CLOUD_READBACK_'+code);};
const check=(ok,code)=>{if(!ok)fail(code);};

export function parseRequest(event,ctx){
  check(ctx.repo===REPO&&ctx.ref==='refs/heads/main'&&
    ctx.eventName==='issue_comment'&&HEX40.test(ctx.mainSha||''),
    'TRUSTED_MAIN_EVENT_REQUIRED');
  check(event?.action==='created'&&event?.issue?.number===776&&
    !event.issue.pull_request&&event.repository?.full_name===REPO&&
    event.comment?.user?.login===ctx.actor&&
    event.comment?.created_at===event.comment?.updated_at&&
    /^[a-zA-Z0-9-]{1,39}$/.test(ctx.actor||''),
    'EXACT_UNEDITED_ADMIN_COMMENT_REQUIRED');
  const body=event.comment.body;
  check(typeof body==='string'&&
    /^AIRTRUST_F0_PLAYER3_READBACK_V1 [a-f0-9]{40}$/.test(body),
    'COMMAND_FORMAT_INVALID');
  return body.slice(PREFIX.length);
}

export function assertCandidate({pr,sha,checks,version}){
  check(pr?.number===1389&&pr.state==='open'&&pr.draft===true&&
    pr.base?.ref==='main'&&pr.head?.sha===sha&&
    pr.head?.repo?.full_name===REPO&&pr.head?.repo?.fork===false,
    'F4_HEAD_OR_REVIEW_SCOPE_CHANGED');
  check(checks?.total_count<=100&&
    Array.isArray(checks?.check_runs),'CI_CHECKS_INVALID');
  for(const name of GATES){
    const entries=checks.check_runs.filter(x=>x.name===name);
    check(entries.length===1&&entries[0].status==='completed'&&
      entries[0].conclusion==='success'&&
      entries[0].app?.slug==='github-actions',
      'CI_GATE_NOT_GREEN_'+name.replace(/[^a-zA-Z0-9]/g,'_'));
  }
  check(version?.environment==='staging'&&version.sourceSha===sha&&
    HEX64.test(version.releaseManifestSha256||'')&&
    HEX64.test(version.workerBundleSha256||''),
    'LIVE_STAGING_RELEASE_MISMATCH');
}

export function activeRunDecision(runs,mainSha,now){
  check(Array.isArray(runs?.workflow_runs)&&runs.workflow_runs.length<=25,
    'RUN_INVENTORY_UNAVAILABLE');
  for(const run of runs.workflow_runs){
    if(run.event!=='workflow_dispatch'||run.head_branch!=='main')continue;
    const time=Date.parse(run.created_at);
    check(Number.isFinite(time),'RUN_TIMESTAMP_INVALID');
    if(now-time<0||now-time>4*60*60*1000)continue;
    if(['queued','in_progress','waiting','pending','requested'].includes(run.status)||
       run.conclusion==='success')
      return 'SKIP_RECENT_ACTIVE_OR_SUCCESS';
    if(run.head_sha===mainSha&&run.conclusion!=='success')
      return 'SKIP_SAME_TRUSTED_MAIN_FAILED_RUN';
  }
  return 'DISPATCH_ALLOWED';
}

async function main(){
  const e=process.env;
  check(!!e.GITHUB_TOKEN&&!!e.GITHUB_EVENT_PATH,
    'GITHUB_CONTEXT_MISSING');
  const event=JSON.parse(readFileSync(e.GITHUB_EVENT_PATH,'utf8'));
  const sha=parseRequest(event,{
    repo:e.GITHUB_REPOSITORY,ref:e.GITHUB_REF,eventName:e.GITHUB_EVENT_NAME,
    mainSha:e.GITHUB_SHA,actor:e.GITHUB_ACTOR,
  });
  const headers={
    Authorization:'Bearer '+e.GITHUB_TOKEN,
    Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
  };
  const base='https://api.github.com/repos/'+REPO;
  async function get(path){
    const response=await fetch(base+path,{
      headers,signal:AbortSignal.timeout(17000),
    });
    check(response.ok,'GITHUB_READ_FAILED_'+response.status);
    return response.json();
  }
  const current=await get('/git/ref/heads/main');
  check(current.object?.sha===e.GITHUB_SHA,'TRUSTED_MAIN_MOVED');
  const permission=await get('/collaborators/'+encodeURIComponent(e.GITHUB_ACTOR)+'/permission');
  check(permission.permission==='admin','ADMIN_REQUIRED');
  const [pr,checks,workflow,runs,liveResponse]=await Promise.all([
    get('/pulls/1389'),
    get('/commits/'+sha+'/check-runs?per_page=100'),
    get('/actions/workflows/'+WORKFLOW),
    get('/actions/workflows/'+WORKFLOW+'/runs?per_page=25'),
    fetch('https://airtrust-api-staging.airtrust.workers.dev/api/version',{
      signal:AbortSignal.timeout(17000),
    }),
  ]);
  check(workflow?.state==='active'&&
    workflow.path==='.github/workflows/'+WORKFLOW,
    'TRUSTED_READBACK_WORKFLOW_UNAVAILABLE');
  check(liveResponse.ok,'STAGING_VERSION_HTTP');
  let live;try{live=(await liveResponse.json()).data;}
  catch{fail('STAGING_VERSION_JSON');}
  assertCandidate({pr,sha,checks,version:live});
  const decision=activeRunDecision(runs,e.GITHUB_SHA,Date.now());
  if(decision!=='DISPATCH_ALLOWED'){
    console.log('PLAYER3_CLOUD_READBACK_'+decision);
    return;
  }
  const result=await fetch(base+'/actions/workflows/'+WORKFLOW+'/dispatches',{
    method:'POST',headers:{...headers,'Content-Type':'application/json'},
    body:JSON.stringify({ref:'main',inputs:{
      confirmation:'AIRTRUST_PLAYER3_READBACK_ONLY',release_sha:sha,
    }}),signal:AbortSignal.timeout(17000),
  });
  check(result.status===204,'WORKFLOW_DISPATCH_NOT_ACCEPTED_'+result.status);
  console.log('PLAYER3_CLOUD_READBACK_GOVERNED_DISPATCH_ACCEPTED');
  console.log('PLAYER3_CLOUD_READBACK_STAGING_REVIEW_STILL_REQUIRED');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{
    const m=String(error?.message??'');
    console.error(m.startsWith('PLAYER3_CLOUD_READBACK_')?
      m:'PLAYER3_CLOUD_READBACK_FAILED_CLOSED');
    process.exitCode=1;
  });
}
