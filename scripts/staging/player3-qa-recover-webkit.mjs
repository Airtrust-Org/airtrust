#!/usr/bin/env node
/**
 * F0 recovery after the first governed Player3 QA start returned 409 AFTER
 * committing chromium (187). Only webkit (188) may transition. No direct
 * D1 writes, fake attempts, completions or certificate issuance.
 */
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {
  REPO,API,TENANT,COURSE,GATES,roster,
  assertOwnSnapshot,assertClaims,assertModuleSession,
} from './player3-qa-existing-learner-readback.mjs';

export const CONFIRM='AIRTRUST_PLAYER3_QA_RECOVER_WEBKIT_V1';
export const SCOPE='tenant=999006 course=327 matricula=188 ciclo=178 only';
const qafail=code=>{throw Error('PLAYER3_WEBKIT_RECOVERY_'+code)};
const required=(yes,code)=>{if(!yes)qafail(code)};
const hash40=/^[a-f0-9]{40}$/;
const hash64=/^[a-f0-9]{64}$/;
const GH='https://api.github.com/repos/'+REPO;
const expected=[
  {matricula_id:187,ciclo_id:177,funcionario_id:2,status:'EM_ANDAMENTO'},
  {matricula_id:188,ciclo_id:178,funcionario_id:3,status:'NAO_INICIADO'},
];
export function assertBefore(rows){
  required(Array.isArray(rows)&&rows.length===2,'EXPECTED_TWO_EXISTING_QA_ENROLLMENTS');
  const ids=new Set();
  for(const e of expected){
    const row=rows.find(x=>x.matricula_id===e.matricula_id);
    required(row&&row.matricula_id===e.matricula_id&&
      row.ciclo_id===e.ciclo_id&&row.funcionario_id===e.funcionario_id&&
      row.status===e.status&&row.ciclo_status===e.status&&row.ciclo_atual===1&&
      row.empresa_id===TENANT&&row.curso_id===COURSE&&
      row.edition_status==='PUBLISHED'&&hash64.test(row.edition_sha256||''),
      'PHYSICAL_QA_STATE_OR_SCOPE_CHANGED');
    ids.add(row.funcionario_id);
  }
  required(ids.size===2&&rows[0].edition_sha256===rows[1].edition_sha256,
    'QA_IDENTITIES_OR_EDITIONS_NOT_INDEPENDENT');
}
export function assertAfter(rows,before){
  required(Array.isArray(rows)&&rows.length===2,'D1_POSTREAD_MISSING');
  for(const old of before){
    const row=rows.find(x=>x.matricula_id===old.matricula_id);
    required(row&&row.empresa_id===TENANT&&row.curso_id===COURSE&&
      row.status==='EM_ANDAMENTO'&&row.ciclo_status==='EM_ANDAMENTO'&&
      row.ciclo_atual===1&&row.matricula_id===old.matricula_id&&
      row.funcionario_id===old.funcionario_id&&row.ciclo_id===old.ciclo_id&&
      row.edition_sha256===old.edition_sha256,
      'D1_POSTREAD_INVALID_OR_CYCLE_REPLACED');
  }
}
export function assertAdminGrant(comment,permission,actor,sha,now=Date.now()){
  required(comment?.body===CONFIRM+' '+sha+' '+SCOPE&&
    comment?.issue_url===GH+'/issues/776'&&
    comment?.user?.login===actor&&permission==='admin'&&
    comment?.created_at===comment?.updated_at&&
    Number.isFinite(Date.parse(comment?.created_at))&&
    now>=Date.parse(comment.created_at)&&
    now-Date.parse(comment.created_at)<=4*3600*1000,
    'FRESH_EXACT_ADMIN_GRANT_REQUIRED');
}
export function assertCandidate(pr,checks,version,sha){
  required(pr?.number===1389&&pr.state==='open'&&pr.draft===true&&
    pr.head?.sha===sha&&pr.head?.repo?.full_name===REPO&&
    pr.head?.repo?.fork===false&&pr.base?.ref==='main',
    'F4_HEAD_OR_REVIEW_CHANGED');
  required(Array.isArray(checks?.check_runs)&&checks.total_count<=100,
    'CI_PROOF_INVALID');
  for(const name of GATES){
    const one=checks.check_runs.filter(x=>x.name===name);
    required(one.length===1&&one[0].conclusion==='success'&&
      one[0].status==='completed'&&one[0].app?.slug==='github-actions',
      'CI_GATE_NOT_GREEN_'+name.replace(/[^A-Za-z0-9]/g,'_'));
  }
  required(version?.environment==='staging'&&version.sourceSha===sha&&
    hash64.test(version.releaseManifestSha256||'')&&
    hash64.test(version.workerBundleSha256||''),
    'LIVE_STAGING_PROVENANCE_MISMATCH');
}
async function gh(path){
  const r=await fetch(GH+path,{headers:{
    Accept:'application/vnd.github+json',
    Authorization:'Bearer '+process.env.GITHUB_TOKEN,
  },signal:AbortSignal.timeout(16000)});
  required(r.ok,'GITHUB_HTTP_'+r.status);
  return r.json();
}
async function api(path,{method='GET',token,body}={}){
  const r=await fetch(API+path,{method,headers:{
    Accept:'application/json',
    ...(token?{Authorization:'Bearer '+token}:{}),
    ...(body?{'Content-Type':'application/json'}:{}),
  },...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(20000)});
  let json;
  try{json=await r.json()}catch{qafail('WORKER_INVALID_JSON')}
  // Do not log response text, bearer token or learner PII.
  required(r.ok&&json?.success===true&&json?.data,
    'WORKER_HTTP_'+r.status+'_DENIED');
  return {status:r.status,...json.data};
}
export async function authorize(env=process.env,client={gh,fetch}){
  required(env.GITHUB_EVENT_NAME==='workflow_dispatch'&&
    env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_REPOSITORY===REPO&&
    env.PLAYER3_RECOVERY_CONFIRMATION===CONFIRM&&
    hash40.test(env.PLAYER3_RECOVERY_RELEASE_SHA||'')&&
    /^[1-9][0-9]{0,18}$/.test(env.PLAYER3_RECOVERY_GRANT_ID||'')&&
    !!env.GITHUB_TOKEN&&/^[A-Za-z0-9-]+$/.test(env.GITHUB_ACTOR||''),
    'TRUSTED_MAIN_DISPATCH_REQUIRED');
  const [main,comment,permission,pr,checks,response]=await Promise.all([
    client.gh('/git/ref/heads/main'),
    client.gh('/issues/comments/'+env.PLAYER3_RECOVERY_GRANT_ID),
    client.gh('/collaborators/'+encodeURIComponent(env.GITHUB_ACTOR)+'/permission'),
    client.gh('/pulls/1389'),
    client.gh('/commits/'+env.PLAYER3_RECOVERY_RELEASE_SHA+'/check-runs?per_page=100'),
    client.fetch(API+'/api/version',{signal:AbortSignal.timeout(16000)}),
  ]);
  required(main?.object?.sha===env.GITHUB_SHA,'TRUSTED_MAIN_HEAD_MOVED');
  assertAdminGrant(comment,permission?.permission,env.GITHUB_ACTOR,
    env.PLAYER3_RECOVERY_RELEASE_SHA);
  required(response.ok,'VERSION_HTTP');
  let version;try{version=(await response.json()).data}
  catch{qafail('VERSION_JSON_INVALID')}
  assertCandidate(pr,checks,version,env.PLAYER3_RECOVERY_RELEASE_SHA);
  console.log('PLAYER3_WEBKIT_RECOVERY_EXACT_ADMIN_SHA_CI_STAGING_APPROVED');
}
export async function recoverOnlyWebkit(before,client=api,password=process.env.PLAYER3_QA_WEBKIT_PASSWORD){
  assertBefore(before);
  required(typeof password==='string'&&password.length>0,
    'PROTECTED_WEBKIT_QA_PASSWORD_REQUIRED');
  const row=before.find(x=>x.matricula_id===188);
  const login=await client('/api/auth/login',{
    method:'POST',body:{email:'qa-player3-webkit@staging.airtrust.invalid',password},
  });
  required(typeof login.accessToken==='string','WEBKIT_AUTH_MISSING');
  assertClaims(login.accessToken,row);
  const prefix='/api/lms/native/matriculas/188/';
  const snap=await client(prefix+'etapas/qa-evidencias',{token:login.accessToken});
  assertOwnSnapshot(snap,row);
  required(snap.status==='NAO_INICIADO'&&snap.attempts.length===0&&
    snap.completed_unit_ids.length===0,'WEBKIT_NO_LONGER_FRESH');
  const receipt=await client(prefix+'iniciar',{
    method:'POST',token:login.accessToken,body:{},
  });
  required(receipt.status===201&&receipt.state==='STARTED'&&
    receipt.ciclo_id===row.ciclo_id&&
    receipt.edition_sha256===row.edition_sha256&&
    receipt.completion_supported===false,
    'WEBKIT_START_RECEIPT_UNEXPECTED');
  const after=await client(prefix+'etapas/qa-evidencias',{token:login.accessToken});
  assertOwnSnapshot(after,{...row,status:'EM_ANDAMENTO'});
  required(after.attempts.length===0&&after.completed_unit_ids.length===0&&
    after.qualificacao_historico_id===null&&after.certificate_id===null,
    'RECOVERY_GENERATED_UNAUTHORIZED_EVIDENCE');
  const session=await client(prefix+'etapas/sessao',{token:login.accessToken});
  assertModuleSession(session,row);
  required(session.allOfficialStagesPassed===false&&
    session.stages.every(s=>s.attempts===0&&s.passed===false),
    'RECOVERY_GENERATED_UNAUTHORIZED_STAGE');
  console.log('PLAYER3_WEBKIT_ONLY_WORKER_START_AND_EMPTY_MODULAR_SESSION_PASS');
}
async function main(mode){
  if(mode==='guard'){await authorize();return;}
  if(mode==='preflight'){
    await authorize();
    required(!!process.env.CLOUDFLARE_API_TOKEN&&
      !!process.env.CLOUDFLARE_ACCOUNT_ID&&!!process.env.GITHUB_OUTPUT,
      'D1_SELECT_CREDENTIALS_AND_OUTPUT_REQUIRED');
    const before=roster();assertBefore(before);
    appendFileSync(process.env.GITHUB_OUTPUT,'qa_roster='+JSON.stringify(before)+'\n');
    console.log('PLAYER3_WEBKIT_RECOVERY_D1_187_STARTED_188_FRESH_VERIFIED');
    return;
  }
  if(mode==='recover'){
    required(process.env.CONFIRM_ONLY_WEBKIT===CONFIRM,'WRITE_CONFIRMATION_REQUIRED');
    await authorize();
    required(!process.env.CLOUDFLARE_API_TOKEN&&
      !process.env.CLOUDFLARE_ACCOUNT_ID,'WORKER_JOB_MUST_HAVE_NO_D1_CREDENTIALS');
    let before;try{before=JSON.parse(process.env.PLAYER3_RECOVERY_ROSTER||'')}
    catch{qafail('ROSTER_MISSING')}
    assertBefore(before);
    await recoverOnlyWebkit(before);
    console.log('PLAYER3_WEBKIT_ONLY_AUTHENTICATED_RECOVERY_FINISHED');
    return;
  }
  if(mode==='verify'){
    await authorize();
    required(!!process.env.CLOUDFLARE_API_TOKEN&&
      !!process.env.CLOUDFLARE_ACCOUNT_ID,'D1_POSTREAD_CREDENTIAL_REQUIRED');
    let before;try{before=JSON.parse(process.env.PLAYER3_RECOVERY_ROSTER||'')}
    catch{qafail('ROSTER_MISSING')}
    assertBefore(before);
    assertAfter(roster(),before);
    console.log('PLAYER3_WEBKIT_ONLY_D1_POSTREAD_BOTH_STARTED_VERIFIED');
    return;
  }
  qafail('UNKNOWN_MODE');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main(process.argv[2]).catch(err=>{
    const s=String(err?.message||'');
    console.error(s.startsWith('PLAYER3_WEBKIT_RECOVERY_')?
      s:'PLAYER3_WEBKIT_RECOVERY_FAILED_CLOSED');
    process.exitCode=1;
  });
