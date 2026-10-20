#!/usr/bin/env node
// Cloud-only F0 staging entrypoint. The only effect is dispatching the existing
// protected official deploy-staging.yml, never applying migrations or production.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const REPO='Airtrust-Org/airtrust';
export const PR=1389;
export const PREFIX='AIRTRUST_F0_PLAYER3_STAGING_V1 ';
export const GATES=[
  'lint','build-content-gates','worker-typecheck','frontend-coverage',
  'worker-tests-1','worker-tests-2','lms-smoke','public-e2e',
  'lms-scorm-browser-e2e','🧪 Check PR'
];
export const TRUSTED_DELTA_FILES=new Set([
  '.github/workflows/staging-player3-synthetic-qa.yml',
  '.github/workflows/cloudflare-credential-doctor.yml',
  'scripts/staging/player3-qa-trusted-executor.mjs',
  'scripts/staging/player3-qa-r2-object-miss.mjs',
  'scripts/__tests__/player3-qa-r2-object-miss.test.mjs',
  'scripts/__tests__/player3-staging-governance.test.mjs',
  'scripts/__tests__/player3-qa-pages-propagation.test.mjs',
  'docs/lms/PLAYER3_QA_TRUSTED_STAGING_RUNBOOK.md',
  '.github/workflows/f0-player3-staging-issueops.yml',
  '.github/workflows/ci.yml',
  '.github/workflows/deploy-staging.yml',
  'scripts/staging/f0-delegated-staging-attestation.mjs',
  'scripts/__tests__/f0-delegated-staging-attestation.test.mjs',
  'scripts/staging/dispatch-f0-player3-staging-from-comment.mjs',
  'scripts/__tests__/f0-player3-staging-issueops.test.mjs'
]);
export function parseRequest(event,{actor,ref,repo,sha}) {
  if(repo!==REPO||ref!=='refs/heads/main')
    throw Error('F0_CLOUD_DISPATCH_REPO_OR_BRANCH_DENIED');
  if(event?.action!=='created'||event?.issue?.number!==776||
     event?.issue?.pull_request||event?.repository?.full_name!==REPO||
     event?.comment?.user?.login!==actor||!actor)
    throw Error('F0_CLOUD_DISPATCH_UNTRUSTED_COMMENT');
  const body=event.comment.body;
  if(typeof body!=='string'||!/^AIRTRUST_F0_PLAYER3_STAGING_V1 [0-9a-f]{40}$/.test(body))
    throw Error('F0_CLOUD_DISPATCH_COMMAND_INVALID');
  if(!/^[0-9a-f]{40}$/.test(sha||''))
    throw Error('F0_CLOUD_DISPATCH_MAIN_SHA_INVALID');
  return body.slice(PREFIX.length);
}
export function assertGates(checkRuns) {
  if(!Array.isArray(checkRuns))throw Error('F0_CLOUD_DISPATCH_CHECKS_ABSENT');
  for(const gate of GATES) {
    const found=checkRuns.filter(c=>c.name===gate);
    if(found.length!==1 || found[0].status!=='completed' ||
       found[0].conclusion!=='success'||found[0].app?.slug!=='github-actions')
      throw Error('F0_CLOUD_DISPATCH_REQUIRED_GATE_NOT_GREEN:'+gate);
  }
}
export function assertReviewedDelta(comparison) {
  if(comparison?.status!=='diverged' && comparison?.status!=='ahead')
    throw Error('F0_CLOUD_DISPATCH_UNEXPECTED_COMPARISON');
  if(!Number.isInteger(comparison.ahead_by)||comparison.ahead_by<0||
     comparison.ahead_by>15||!Array.isArray(comparison.files))
    throw Error('F0_CLOUD_DISPATCH_DELTA_UNBOUNDED');
  for(const f of comparison.files) {
    if(!TRUSTED_DELTA_FILES.has(f.filename))
      throw Error('F0_CLOUD_DISPATCH_RUNTIME_MAIN_DRIFT_DENIED');
  }
}
export function releaseInputs(sha,commentId) {
  if(!/^[0-9a-f]{40}$/.test(sha)||!Number.isSafeInteger(commentId) || commentId<1)
    throw Error('F0_CLOUD_DISPATCH_INVALID_INPUT');
  return {
    confirmation:'AIRTRUST_STAGING',pr_number:String(PR),release_sha:sha,
    deploy_worker:'true',deploy_frontend:'true',apply_migrations:'false',
    approved_migrations:'',run_smoke:'true',run_full_smoke:'false',
    release_reason:'F0 Player3 synthetic QA staging runtime, issue 776 comment '+commentId+
      ', no migrations or production'
  };
}
async function main(){
  const e=process.env;
  const event=JSON.parse(readFileSync(e.GITHUB_EVENT_PATH,'utf8'));
  const releaseSha=parseRequest(event,{actor:e.GITHUB_ACTOR,ref:e.GITHUB_REF,
    repo:e.GITHUB_REPOSITORY,sha:e.GITHUB_SHA});
  if(!e.GITHUB_TOKEN)throw Error('F0_CLOUD_DISPATCH_TOKEN_MISSING');
  const api='https://api.github.com/repos/'+REPO;
  const headers={
    Authorization:'Bearer '+e.GITHUB_TOKEN,
    Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28'
  };
  const get=async(path)=>{
    const r=await fetch(api+path,{headers,signal:AbortSignal.timeout(18000)});
    if(!r.ok)throw Error('F0_CLOUD_DISPATCH_READ_API_DENIED_'+r.status);
    return r.json();
  };
  // A comment that queues while main changes cannot release on stale trust.
  const mainRef=await get('/git/ref/heads/main');
  if(mainRef.object?.sha!==e.GITHUB_SHA)
    throw Error('F0_CLOUD_DISPATCH_TRUSTED_MAIN_MOVED');
  const perm=await get('/collaborators/'+encodeURIComponent(e.GITHUB_ACTOR)+'/permission');
  if(perm.permission!=='admin')
    throw Error('F0_CLOUD_DISPATCH_ADMIN_REQUIRED');
  const pr=await get('/pulls/'+PR);
  if(pr.state!=='open'||pr.head?.sha!==releaseSha||
     pr.base?.ref!=='main'||pr.head?.repo?.full_name!==REPO||
     pr.head?.repo?.fork)
    throw Error('F0_CLOUD_DISPATCH_F4_HEAD_OR_SCOPE_CHANGED');
  // Review the delta since the F4 candidate so staging does not silently
  // revert a production-facing fix introduced in main after its split.
  const diff=await get('/compare/'+releaseSha+'...'+e.GITHUB_SHA);
  assertReviewedDelta(diff);
  const checks=await get('/commits/'+releaseSha+'/check-runs?per_page=100');
  if(checks.total_count>100)throw Error('F0_CLOUD_DISPATCH_CHECKS_PAGINATED');
  assertGates(checks.check_runs);
  const workflow=await get('/actions/workflows/deploy-staging.yml');
  if(workflow.state!=='active'||workflow.path!=='.github/workflows/deploy-staging.yml')
    throw Error('F0_CLOUD_DISPATCH_OFFICIAL_WORKFLOW_UNAVAILABLE');
  // Dispatch, not deploy: the original official workflow independently checks
  // SHA, gates, Cloudflare tokens, protected environment and shared mutex.
  const response=await fetch(api+'/actions/workflows/deploy-staging.yml/dispatches',{
    method:'POST',headers:{...headers,'Content-Type':'application/json'},
    body:JSON.stringify({ref:'main',inputs:releaseInputs(releaseSha,event.comment.id)}),
    signal:AbortSignal.timeout(18000)
  });
  if(response.status!==204)
    throw Error('F0_CLOUD_DISPATCH_OFFICIAL_DISPATCH_REJECTED_'+response.status);
  console.log('F0_CLOUD_STAGING_OFFICIAL_DISPATCH_ACCEPTED');
  console.log('F0_CLOUD_STAGING_RELEASE_SHA='+releaseSha);
  console.log('F0_CLOUD_STAGING_APPROVAL_AND_SMOKE_STILL_REQUIRED');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(e=>{
    console.error(String(e?.message||'').startsWith('F0_')?e.message:
      'F0_CLOUD_DISPATCH_FAILED_CLOSED');
    process.exitCode=1;
  });
