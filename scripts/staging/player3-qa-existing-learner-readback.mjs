#!/usr/bin/env node
/**
 * F0 / Player 3 staging physical learner readback.
 * Does not issue an enrollment, attempt, checkpoint, completion or certificate.
 * Staging-only two already-existing synthetic students, pinned course 327.
 * Never log passwords, JWT, R2 keys, private answers, or employee identifiers.
 */
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const REPO='Airtrust-Org/airtrust';
export const TENANT=999006;
export const COURSE=327;
export const API='https://airtrust-api-staging.airtrust.workers.dev';
export const DATABASE='airtrust-db-staging-baseline-20260701';
export const DATABASE_UUID='bf9963f4-eb12-439b-a830-20bbf577ac22';
export const LEARNERS=Object.freeze([
  {browser:'chromium',email:'qa-player3-chromium@staging.airtrust.invalid'},
  {browser:'webkit',email:'qa-player3-webkit@staging.airtrust.invalid'},
]);
export const GATES=Object.freeze([
  'lint','build-content-gates','worker-typecheck','frontend-coverage',
  'worker-tests-1','worker-tests-2','lms-smoke','public-e2e',
  'lms-scorm-browser-e2e','🧪 Check PR',
]);
const SHA40=/^[a-f0-9]{40}$/;
const SHA64=/^[a-f0-9]{64}$/;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const fail=code=>{throw Error('PLAYER3_READBACK_'+code);};
const expect=(ok,code)=>{if(!ok)fail(code);};

export function assertGuard({event,ref,repo,confirmation,sha,actor,pr,checks,live}){
  expect(event==='workflow_dispatch'&&ref==='refs/heads/main'&&repo===REPO&&
    confirmation==='AIRTRUST_PLAYER3_READBACK_ONLY'&&SHA40.test(sha)&&
    /^[A-Za-z0-9-]{1,39}$/.test(actor||''),'TRUSTED_MAIN_CONFIRMATION');
  expect(pr?.number===1389&&pr.state==='open'&&pr.draft===true&&
    pr.head?.sha===sha&&pr.head?.repo?.full_name===REPO&&
    pr.head?.repo?.fork===false&&pr.base?.ref==='main',
    'F4_CANDIDATE_CHANGED');
  expect(Array.isArray(checks?.check_runs)&&checks.total_count<=100,'GATE_RESPONSE_INVALID');
  for(const gate of GATES){
    const hits=checks.check_runs.filter(c=>c.name===gate);
    expect(hits.length===1&&hits[0].status==='completed'&&
      hits[0].conclusion==='success'&&hits[0].app?.slug==='github-actions',
      'GATE_NOT_GREEN_'+gate.replace(/[^A-Za-z0-9]/g,'_'));
  }
  expect(live?.environment==='staging'&&live?.sourceSha===sha&&
    SHA64.test(live.releaseManifestSha256||'')&&
    SHA64.test(live.workerBundleSha256||''),'LIVE_PROVENANCE_MISMATCH');
}

export function assertRoster(rows,meta){
  expect(meta?.changed_db===false&&meta?.rows_written===0,
    'REMOTE_QUERY_NOT_PROVEN_READ_ONLY');
  expect(Array.isArray(rows)&&rows.length===2,'TWO_NATIVE_QA_ENROLLMENTS_REQUIRED');
  const byEmail=new Map(rows.map(r=>[String(r.email).toLowerCase(),r]));
  expect(byEmail.size===2,'DUPLICATE_LEARNER');
  const ids=new Set(),cycles=new Set(),employees=new Set();
  for(const l of LEARNERS){
    const row=byEmail.get(l.email);
    expect(row&&row.empresa_id===TENANT&&row.curso_id===COURSE&&
      ['NAO_INICIADO','EM_ANDAMENTO'].includes(row.status)&&
      row.ciclo_status===row.status&&row.ciclo_atual===1&&
      row.edition_status==='PUBLISHED'&&
      positive(row.matricula_id)&&positive(row.ciclo_id)&&
      positive(row.funcionario_id)&&SHA64.test(row.edition_sha256||''),
      'PHYSICAL_LEARNER_EDITION_OR_CYCLE_INVALID');
    ids.add(row.matricula_id);cycles.add(row.ciclo_id);
    employees.add(row.funcionario_id);
  }
  expect(ids.size===2&&cycles.size===2&&employees.size===2,
    'NONINDEPENDENT_QA_IDENTITIES');
  return LEARNERS.map(l=>({browser:l.browser,...byEmail.get(l.email)}));
}

export function assertClaims(token,row){
  expect(typeof token==='string'&&token.split('.').length===3,'TOKEN_FORMAT');
  let claims;
  try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));}
  catch{fail('TOKEN_CLAIMS_INVALID');}
  expect(claims.empresa_id===TENANT&&
    Number(claims.funcionario_id)===row.funcionario_id&&
    ['ALUNO','student'].includes(String(claims.role)),
    'LEARNER_JWT_TENANT_EMPLOYEE_ROLE');
  return true;
}

export function assertOwnSnapshot(data,row){
  expect(data?.empresa_id===TENANT&&data.matricula_id===row.matricula_id&&
    data.ciclo_id===row.ciclo_id&&
    data.edition_sha256===row.edition_sha256&&
    ['NAO_INICIADO','EM_ANDAMENTO'].includes(data.status)&&
    data.status===row.status&&
    Array.isArray(data.completed_unit_ids)&&Array.isArray(data.attempts)&&
    data.qualificacao_historico_id===null&&data.certificate_id===null,
    'SNAPSHOT_NOT_FRESH_OR_NOT_SELF');
}
export function assertModuleSession(data,row){
  expect(data?.editionSha256===row.edition_sha256&&
    data.cycleId===row.ciclo_id&&
    data.completionSupported===false&&Array.isArray(data.stages)&&
    data.stages.length>=1&&data.stages.length<=8&&
    data.stages.every(s=>typeof s.stageId==='string'&&
      Number.isSafeInteger(s.attempts)&&s.attempts>=0),
    'STAGE_SESSION_EDITION_OR_POLICY_MISMATCH');
}

function requireStagingWrangler(){
  const config=readFileSync('worker-airtrust/wrangler.toml','utf8');
  const section=config.match(/\[\[env\.staging\.d1_databases\]\]([\s\S]*?)(?=\n\[|$)/)?.[1]??'';
  expect(section.includes('database_name = "'+DATABASE+'"')&&
    section.includes('database_id = "'+DATABASE_UUID+'"')&&
    !section.includes('7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae'),
    'STAGING_D1_TARGET_NOT_PINNED');
}
const SQL=`SELECT lower(u.email) email, f.empresa_id, m.curso_id,
 m.id matricula_id,b.ciclo_id, f.id funcionario_id, m.status,
 cy.status ciclo_status, cy.ciclo_atual,
 ed.status edition_status,ed.artifact_sha256 edition_sha256
 FROM usuarios u
 JOIN funcionarios f ON f.id=u.funcionario_id AND f.empresa_id=999006
 AND f.ativo=1 AND f.deleted_at IS NULL
 JOIN lms_matriculas m ON m.funcionario_id=f.id AND m.empresa_id=999006
 AND m.curso_id=327 AND m.deleted_at IS NULL
 JOIN lms_native_matricula_edicoes b ON b.matricula_id=m.id
 AND b.empresa_id=999006 AND b.curso_id=327
 JOIN lms_matricula_ciclos cy ON cy.id=b.ciclo_id
 AND cy.matricula_id=m.id AND cy.empresa_id=m.empresa_id
 AND cy.curso_id=m.curso_id AND cy.funcionario_id=m.funcionario_id
 AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL AND cy.status=m.status
 JOIN lms_native_edicoes ed ON ed.id=b.edicao_id
 AND ed.empresa_id=999006 AND ed.curso_id=327
 WHERE u.active=1 AND u.deleted_at IS NULL
 AND lower(u.email) IN
 ('qa-player3-chromium@staging.airtrust.invalid',
 'qa-player3-webkit@staging.airtrust.invalid')
 ORDER BY u.email;`;
export function roster(){
  expect(process.env.CLOUDFLARE_API_TOKEN&&process.env.CLOUDFLARE_ACCOUNT_ID,
    'STAGING_READ_CREDENTIALS_REQUIRED');
  requireStagingWrangler();
  expect(/^SELECT\s/i.test(SQL)&&
    SQL.split(';').filter(Boolean).length===1&&
    !/\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|ATTACH|PRAGMA)\b/i.test(SQL),
    'UNSAFE_SQL_ATTEMPT');
  const processResult=spawnSync('./node_modules/.bin/wrangler',[
    'd1','execute',DATABASE,'--env','staging','--remote',
    '--json','--command='+SQL],{
    cwd:resolve('worker-airtrust'),encoding:'utf8',timeout:65000,
    maxBuffer:1024*1024,stdio:['ignore','pipe','pipe'],
  });
  expect(!processResult.error&&processResult.status===0,
    'PHYSICAL_SELECT_UNAVAILABLE');
  let raw;try{raw=JSON.parse(processResult.stdout);}catch{fail('D1_JSON_INVALID');}
  const first=Array.isArray(raw)?raw[0]:raw;
  expect(first?.success===true&&Array.isArray(first.results),'D1_SELECT_INVALID');
  return assertRoster(first.results,first.meta);
}
async function api(path,{method='GET',token,body}={}){
  const response=await fetch(API+path,{
    method,headers:{Accept:'application/json',
      ...(token?{Authorization:'Bearer '+token}:{}),
      ...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(16000),
  });
  return response;
}
export async function ownData(path,token,reader=api){
  const response=await reader(path,{token});
  if(response?.ok!==true){
    const kind=path.endsWith('/qa-evidencias')?'QA_SNAPSHOT':
      path.endsWith('/sessao')?'STAGE_SESSION':'OTHER_READ';
    let code='UNCLASSIFIED';
    try{
      const body=await response.json();
      if(/^[A-Z][A-Z0-9_]{2,80}$/.test(String(body?.code??'')))code=body.code;
    }catch{ /* Deliberately never log server response bodies. */ }
    fail('LEARNER_'+kind+'_HTTP_'+String(response?.status??0)+'_CODE_'+code);
  }
  let json;try{json=await response.json();}catch{fail('LEARNER_JSON_INVALID');}
  expect(json?.success===true&&json?.data,'LEARNER_RESPONSE_INVALID');
  return json.data;
}
/** Real Fetch Response.ok is a boolean property; reject callable/mocked variants. */
export function requireHttpOk(response,code){
  expect(response?.ok===true,code);
}

export async function verifyLearners(rows,client={api,ownData}){
  const passwords={
    chromium:process.env.PLAYER3_QA_CHROMIUM_PASSWORD,
    webkit:process.env.PLAYER3_QA_WEBKIT_PASSWORD,
  };
  expect(passwords.chromium&&passwords.webkit&&
    passwords.chromium!==passwords.webkit,'DISTINCT_PROTECTED_PASSWORDS_REQUIRED');
  const claims=[];
  for(const row of rows){
    const email=LEARNERS.find(x=>x.browser===row.browser)?.email;
    expect(!!email,'UNKNOWN_BROWSER');
    const resp=await client.api('/api/auth/login',{
      method:'POST',body:{email,password:passwords[row.browser]},
    });
    requireHttpOk(resp,'AUTH_STATUS_'+row.browser);
    let result;try{result=await resp.json();}catch{fail('AUTH_JSON_INVALID');}
    const token=result?.data?.accessToken;
    assertClaims(token,row);
    claims.push({browser:row.browser,row,token});
  }
  expect(claims[0].token!==claims[1].token,
    'BROWSER_TOKENS_SHARED');
  for(const {row,token,browser} of claims){
    const prefix='/api/lms/native/matriculas/'+row.matricula_id+'/etapas/';
    const snapshot=await client.ownData(prefix+'qa-evidencias',token);
    assertOwnSnapshot(snapshot,row);
    // The F4 runtime now supports an independently gated, read-only
    // modular session at NAO_INICIADO. Require actual HTTP GET, never
    // fabricate progress from a missing/409 response.
    const session=await client.ownData(prefix+'sessao',token);
    assertModuleSession(session,row);
    if(row.status==='NAO_INICIADO'){
      expect(snapshot.completed_unit_ids.length===0&&
        snapshot.attempts.length===0&&
        session.allOfficialStagesPassed===false&&
        session.stages.every(stage=>stage.attempts===0&&
          stage.passed===false&&stage.lastScorePct===null),
        'INITIAL_ENROLLMENT_MUST_HAVE_NO_EVIDENCE');
      console.log('PLAYER3_READBACK_REAL_UNSTARTED_MODULE_SESSION:'+browser);
    }
    // An independent student must never see another student's ledger.
    const stranger=claims.find(x=>x.browser!==browser);
    const denied=await client.api(
      '/api/lms/native/matriculas/'+stranger.row.matricula_id+'/etapas/qa-evidencias',
      {token});
    expect([403,404,409].includes(denied.status),
      'CROSS_EMPLOYEE_QA_READ_NOT_DENIED_'+browser);
    console.log('PLAYER3_STAGING_READBACK_PASS:'+browser+
      ':OWN_STAGE_AND_SNAPSHOT:CROSS_EMPLOYEE_DENIED');
  }
}
export async function github(path,request=fetch){
  const response=await request('https://api.github.com/repos/'+REPO+path,{
    headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,
      Accept:'application/vnd.github+json'},
    signal:AbortSignal.timeout(16000)});
  requireHttpOk(response,'GITHUB_QUERY_FAILED');
  return response.json();
}
export async function readVersionResponse(response){
  requireHttpOk(response,'VERSION_HTTP');
  let payload;
  try{payload=await response.json();}catch{fail('VERSION_JSON_INVALID');}
  expect(payload?.data&&typeof payload.data==='object','VERSION_DATA_MISSING');
  return payload.data;
}

export async function guard(client={github,api}){
  const e=process.env;
  expect(!!e.GITHUB_TOKEN&&SHA40.test(e.PLAYER3_QA_RELEASE_SHA||''),
    'TRUSTED_INPUT_MISSING');
  const [pr,checks,version,permission]=await Promise.all([
    client.github('/pulls/1389'),
    client.github('/commits/'+e.PLAYER3_QA_RELEASE_SHA+'/check-runs?per_page=100'),
    client.api('/api/version').then(readVersionResponse),
    client.github('/collaborators/'+encodeURIComponent(e.GITHUB_ACTOR)+'/permission'),
  ]);
  expect(['admin','maintain','write','push'].includes(permission.permission),
    'WORKFLOW_ACTOR_PERMISSION_DENIED');
  assertGuard({event:e.GITHUB_EVENT_NAME,ref:e.GITHUB_REF,
    repo:e.GITHUB_REPOSITORY,confirmation:e.PLAYER3_QA_CONFIRMATION,
    sha:e.PLAYER3_QA_RELEASE_SHA,actor:e.GITHUB_ACTOR,pr,checks,live:version});
  console.log('PLAYER3_STAGING_READBACK_GUARD_PASS');
}
async function main(mode){
  if(mode==='guard'){await guard();return;}
  if(mode==='inspect'){
    await guard();
    const rows=roster();
    await verifyLearners(rows);
    console.log('PLAYER3_STAGING_TWO_EXISTING_NATIVE_LEARNERS_READONLY_VERIFIED');
    console.log('PLAYER3_SIX_JOURNEYS_TERMINAL_PDF_NOT_ATTESTED');
    return;
  }
  fail('UNKNOWN_MODE');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv[2]).catch(error=>{
    const message=String(error?.message??'');
    console.error(message.startsWith('PLAYER3_READBACK_')?
      message:'PLAYER3_READBACK_FAILED_CLOSED');
    process.exitCode=1;
  });
}
