#!/usr/bin/env node
/**
 * Governed F0 staging-only transition for TWO existing, disposable QA
 * learners: NAO_INICIADO -> EM_ANDAMENTO via authenticated Worker route.
 * No migration, direct SQL writes, invented grades or completion.
 * Every invocation requires a fresh unedited administrator grant and a
 * separate staging environment review. Partial success fails closed.
 */
import {pathToFileURL} from 'node:url';
import {appendFileSync} from 'node:fs';
import {
  API,REPO,TENANT,COURSE,LEARNERS,GATES,roster,
  assertClaims,assertOwnSnapshot,assertModuleSession,
} from './player3-qa-existing-learner-readback.mjs';

export const CONFIRM='AIRTRUST_PLAYER3_QA_START_EXISTING_V1';
export const EXPLANATION='tenant=999006 course=327 learners=2 staging-only';
const sha40=/^[0-9a-f]{40}$/;
const sha64=/^[0-9a-f]{64}$/;
const err=code=>{throw Error('PLAYER3_QA_START_'+code)};
const guard=(v,code)=>{if(!v)err(code)};
const repoUrl='https://api.github.com/repos/'+REPO;
const jsonHeaders={Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28'};
const safeCode=payload=>/^[A-Z][A-Z0-9_]{2,80}$/.test(payload?.code??'')?
  payload.code:'UNCLASSIFIED';

export function assertGrant(grant,permission,actor,releaseSha,now=Date.now()){
  guard(sha40.test(releaseSha)&&
    grant?.body===CONFIRM+' '+releaseSha+' '+EXPLANATION&&
    grant?.issue_url===repoUrl+'/issues/776'&&
    grant?.user?.login===actor&&permission==='admin'&&
    grant?.created_at===grant?.updated_at&&
    Number.isFinite(Date.parse(grant?.created_at))&&
    now-Date.parse(grant.created_at)>=0&&
    now-Date.parse(grant.created_at)<=4*60*60*1000,
    'FRESH_EXACT_ADMIN_ISSUE_776_GRANT_REQUIRED');
}
export function assertRuntime({pr,checks,version,sha}){
  guard(pr?.number===1389&&pr.state==='open'&&pr.draft===true&&
    pr.base?.ref==='main'&&pr.head?.sha===sha&&
    pr.head?.repo?.full_name===REPO&&!pr.head.repo.fork,
    'PR_1389_CANDIDATE_CHANGED');
  guard(checks?.total_count<=100&&Array.isArray(checks?.check_runs),
    'GATE_PAYLOAD_INVALID');
  for(const name of GATES){
    const one=checks.check_runs.filter(c=>c.name===name);
    guard(one.length===1&&one[0].status==='completed'&&
      one[0].conclusion==='success'&&one[0].app?.slug==='github-actions',
      'NOT_GREEN_'+name.replace(/[^A-Za-z0-9]/g,'_'));
  }
  guard(version?.environment==='staging'&&version?.sourceSha===sha&&
    sha64.test(version.workerBundleSha256||'')&&
    sha64.test(version.releaseManifestSha256||''),
    'STAGING_LIVE_PROVENANCE_MISMATCH');
}
export function assertFresh(rows){
  guard(Array.isArray(rows)&&rows.length===2,'TWO_EXACT_QA_LEARNERS_REQUIRED');
  const cycleIds=new Set(),enrollmentIds=new Set(),employeeIds=new Set();
  for(const label of LEARNERS){
    const row=rows.find(x=>x.email===label.email);
    guard(row&&row.empresa_id===TENANT&&row.curso_id===COURSE&&
      row.status==='NAO_INICIADO'&&row.ciclo_status==='NAO_INICIADO'&&
      row.ciclo_atual===1&&row.edition_status==='PUBLISHED'&&
      Number.isSafeInteger(row.matricula_id)&&row.matricula_id>0&&
      Number.isSafeInteger(row.ciclo_id)&&row.ciclo_id>0&&
      Number.isSafeInteger(row.funcionario_id)&&row.funcionario_id>0&&
      sha64.test(row.edition_sha256||''),
      'LEARNER_NOT_FRESH_OR_NOT_PINNED');
    cycleIds.add(row.ciclo_id);
    enrollmentIds.add(row.matricula_id);
    employeeIds.add(row.funcionario_id);
  }
  guard(cycleIds.size===2&&enrollmentIds.size===2&&employeeIds.size===2,
    'LEARNER_IDENTITIES_NOT_DISTINCT');
}
export function assertStarted(rows,before){
  guard(rows.length===2,'AFTER_STATE_MISSING');
  for(const original of before){
    const current=rows.find(x=>x.email===original.email);
    guard(current&&current.status==='EM_ANDAMENTO'&&
      current.ciclo_status==='EM_ANDAMENTO'&&
      current.ciclo_atual===1&&
      current.matricula_id===original.matricula_id&&
      current.ciclo_id===original.ciclo_id&&
      current.funcionario_id===original.funcionario_id&&
      current.edition_sha256===original.edition_sha256,
      'ATOMIC_START_NOT_PERSISTED');
  }
}
async function gh(path){
  const r=await fetch(repoUrl+path,{headers:{
    ...jsonHeaders,Authorization:'Bearer '+process.env.GITHUB_TOKEN,
  },signal:AbortSignal.timeout(15000)});
  guard(r.ok,'GITHUB_READ_'+r.status);
  return r.json();
}
async function post(path,token,body){
  const r=await fetch(API+path,{method:'POST',headers:{
    Accept:'application/json','Content-Type':'application/json',
    ...(token?{Authorization:'Bearer '+token}:{})},
    body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  let data;try{data=await r.json()}catch{err('POST_INVALID_JSON')}
  guard(r.ok&&data?.success===true&&data?.data,
    'POST_HTTP_'+r.status+'_CODE_'+safeCode(data));
  return {status:r.status,...data.data};
}
async function get(path,token){
  const r=await fetch(API+path,{headers:{
    Accept:'application/json',Authorization:'Bearer '+token},
    signal:AbortSignal.timeout(20000)});
  let data;try{data=await r.json()}catch{err('GET_INVALID_JSON')}
  guard(r.ok&&data?.success===true&&data?.data,
    'GET_HTTP_'+r.status+'_CODE_'+safeCode(data));
  return data.data;
}
export async function checkedGuard(env=process.env,client={gh,fetch}){
  guard(env.GITHUB_EVENT_NAME==='workflow_dispatch'&&
    env.GITHUB_REF==='refs/heads/main'&&
    env.GITHUB_REPOSITORY===REPO&&
    env.PLAYER3_QA_START_CONFIRMATION===CONFIRM&&
    sha40.test(env.PLAYER3_QA_RELEASE_SHA||'')&&
    /^[1-9][0-9]{0,18}$/.test(env.PLAYER3_QA_START_GRANT_ID||'')&&
    !!env.GITHUB_TOKEN&&
    /^[A-Za-z0-9-]+$/.test(env.GITHUB_ACTOR||''),
    'TRUSTED_MAIN_DISPATCH_REQUIRED');
  const [main,comment,permission,pr,checks,versionResponse]=await Promise.all([
    client.gh('/git/ref/heads/main'),
    client.gh('/issues/comments/'+env.PLAYER3_QA_START_GRANT_ID),
    client.gh('/collaborators/'+encodeURIComponent(env.GITHUB_ACTOR)+'/permission'),
    client.gh('/pulls/1389'),
    client.gh('/commits/'+env.PLAYER3_QA_RELEASE_SHA+'/check-runs?per_page=100'),
    client.fetch(API+'/api/version',{signal:AbortSignal.timeout(15000)}),
  ]);
  guard(main?.object?.sha===env.GITHUB_SHA,'TRUSTED_MAIN_CHANGED');
  assertGrant(comment,permission?.permission,env.GITHUB_ACTOR,
    env.PLAYER3_QA_RELEASE_SHA);
  guard(versionResponse.ok,'VERSION_HTTP');
  let version;try{version=(await versionResponse.json()).data}
  catch{err('VERSION_JSON_INVALID')}
  assertRuntime({pr,checks,version,sha:env.PLAYER3_QA_RELEASE_SHA});
  console.log('PLAYER3_QA_START_EXACT_GRANT_GREEN_CI_LIVE_SHA_CONFIRMED');
}
export async function applyStart(before,client={post,get},passwords={
  chromium:process.env.PLAYER3_QA_CHROMIUM_PASSWORD,
  webkit:process.env.PLAYER3_QA_WEBKIT_PASSWORD,
}){
  assertFresh(before);
  guard(passwords.chromium&&passwords.webkit&&
    passwords.chromium!==passwords.webkit,
    'DISTINCT_STAGING_QA_SECRETS_REQUIRED');
  const sessions=[];
  for(const label of LEARNERS){
    const row=before.find(x=>x.email===label.email);
    const auth=await client.post('/api/auth/login',null,{
      email:label.email,password:passwords[label.browser],
    });
    guard(typeof auth.accessToken==='string','NO_AUTH_TOKEN');
    assertClaims(auth.accessToken,row);
    sessions.push({label,row,token:auth.accessToken});
  }
  guard(sessions[0].token!==sessions[1].token,'SAME_BEARER_DENIED');
  // Both students' actual snapshots must be empty before any mutation.
  for(const s of sessions){
    const d=await client.get('/api/lms/native/matriculas/'+s.row.matricula_id+
      '/etapas/qa-evidencias',s.token);
    assertOwnSnapshot(d,s.row);
    guard(d.completed_unit_ids.length===0&&d.attempts.length===0,
      'PREEXISTING_EVIDENCE_REQUIRES_MANUAL_REVIEW');
  }
  for(const s of sessions){
    const d=await client.post('/api/lms/native/matriculas/'+s.row.matricula_id+
      '/iniciar',s.token,{});
    guard(d.status===201&&d.state==='STARTED'&&
      d.ciclo_id===s.row.ciclo_id&&
      d.edition_sha256===s.row.edition_sha256&&
      d.completion_supported===false,'WORKER_START_RECEIPT_INVALID');
    console.log('PLAYER3_QA_WORKER_ATOMIC_START_PASS:'+s.label.browser);
    // In case of failure in learner 2, NEVER fake rollback nor replay.
  }
  for(const s of sessions){
    const d=await client.get('/api/lms/native/matriculas/'+s.row.matricula_id+
      '/etapas/qa-evidencias',s.token);
    assertOwnSnapshot(d,{...s.row,status:'EM_ANDAMENTO'});
    guard(d.attempts.length===0&&d.completed_unit_ids.length===0,
      'START_WROTE_UNAUTHORIZED_GRADE_OR_LESSON');
    const modular=await client.get('/api/lms/native/matriculas/'+s.row.matricula_id+
      '/etapas/sessao',s.token);
    assertModuleSession(modular,s.row);
    guard(modular.allOfficialStagesPassed===false&&
      modular.stages.every(stage=>stage.attempts===0&&stage.passed===false),
      'START_WROTE_UNAUTHORIZED_STAGE_EVIDENCE');
    console.log('PLAYER3_QA_STARTED_LEARNER_EMPTY_MODULAR_SESSION_PASS:'+s.label.browser);
  }
}
async function main(mode){
  if(mode==='guard'){await checkedGuard();return;}
  if(mode==='preflight'){
    await checkedGuard();
    guard(!!process.env.CLOUDFLARE_API_TOKEN&&
      !!process.env.CLOUDFLARE_ACCOUNT_ID&&
      !!process.env.GITHUB_OUTPUT,'D1_READ_AND_GITHUB_OUTPUT_REQUIRED');
    const before=roster();assertFresh(before);
    // Numeric identifiers and synthetic-only aliases, never user tokens,
    // answers, passwords or customer records.
    appendFileSync(process.env.GITHUB_OUTPUT,
      'qa_roster='+JSON.stringify(before)+'\n');
    console.log('PLAYER3_QA_D1_TWO_FRESH_SYNTHETIC_ENROLLMENTS_VERIFIED');
    return;
  }
  if(mode==='start'){
    guard(process.env.CONFIRM_PLAYER3_QA_START===CONFIRM,
      'MUTATION_CONFIRMATION_REQUIRED');
    await checkedGuard();
    guard(!process.env.CLOUDFLARE_API_TOKEN&&
      !process.env.CLOUDFLARE_ACCOUNT_ID,
      'WORKER_JOB_MUST_NOT_HAVE_D1_CREDENTIALS');
    let before;
    try{before=JSON.parse(process.env.PLAYER3_QA_PREAPPROVED_ROSTER||'');}
    catch{err('D1_PREFLIGHT_ROSTER_MISSING')}
    assertFresh(before);
    await applyStart(before);
    console.log('PLAYER3_QA_TWO_SYNTHETIC_WORKER_START_RECEIPTS_AND_AUTH_SNAPSHOTS');
    console.log('PLAYER3_QA_SIX_JOURNEYS_COMPLETION_PDF_NOT_ATTESTED');
    return;
  }
  if(mode==='d1-verify'){
    await checkedGuard();
    guard(!!process.env.CLOUDFLARE_API_TOKEN&&
      !!process.env.CLOUDFLARE_ACCOUNT_ID,
      'D1_POSTREAD_CREDENTIAL_REQUIRED');
    let before;
    try{before=JSON.parse(process.env.PLAYER3_QA_PREAPPROVED_ROSTER||'');}
    catch{err('D1_PREFLIGHT_ROSTER_MISSING')}
    assertFresh(before);
    const after=roster();assertStarted(after,before);
    console.log('PLAYER3_QA_D1_ATOMIC_START_PERSISTENCE_VERIFIED');
    return;
  }
  err('UNSUPPORTED_PHASE');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main(process.argv[2]).catch(e=>{
    const code=String(e?.message||'');
    console.error(code.startsWith('PLAYER3_QA_START_')?code:
      'PLAYER3_QA_START_FAILED_CLOSED');
    process.exitCode=1;
  });
