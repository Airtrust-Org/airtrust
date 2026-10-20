#!/usr/bin/env node
/**
 * F0 Player 3 synthetic-only learner bootstrap.
 * Never provisions outside the pinned staging tenant/course.
 * No raw SQL writes, no real customer enrollment, no production credentials.
 * Every mutation is through authenticated, tenant-checked Worker routes.
 */
import { readFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REPO = 'Airtrust-Org/airtrust';
export const SHA_RE = /^[a-f0-9]{40}$/;
export const QA_TENANT = 999006;
export const QA_COURSE = 327;
export const D1 = 'airtrust-db-staging-baseline-20260701';
export const D1_UUID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
export const API = 'https://airtrust-api-staging.airtrust.workers.dev';
export const LEARNERS = Object.freeze([
  {key:'chromium',email:'qa-player3-chromium@staging.airtrust.invalid',
    name:'QA Player3 Chromium',employeeCode:'QA-PARTICIPANTE-ALFA'},
  {key:'webkit',email:'qa-player3-webkit@staging.airtrust.invalid',
    name:'QA Player3 WebKit',employeeCode:'QA-PARTICIPANTE-BRAVO'},
]);
export const EXPECTED_CHECKS = Object.freeze([
  'lint','build-content-gates','worker-typecheck','frontend-coverage',
  'worker-tests-1','worker-tests-2','lms-smoke','public-e2e',
  'lms-scorm-browser-e2e','🧪 Check PR',
]);
export const APPROVAL = 'AIRTRUST_PLAYER3_QA_LEARNERS_RECOVERY_V1';

export function assertGrant(comment, permission, actor, sha, now=Date.now()) {
  const expected=APPROVAL+' '+sha+' tenant=999006 course=327';
  if(!SHA_RE.test(sha)||comment?.body!==expected ||
    comment?.issue_url!=='https://api.github.com/repos/'+REPO+'/issues/776' ||
    comment?.user?.login!==actor || permission!=='admin' ||
    comment?.created_at!==comment?.updated_at ||
    !Number.isFinite(Date.parse(comment?.created_at)) ||
    now-Date.parse(comment.created_at)<0 ||
    now-Date.parse(comment.created_at)>4*60*60*1000) {
    throw Error('PLAYER3_QA_EXACT_ADMIN_GRANT_REQUIRED');
  }
}

export function assertPreflight(row, meta) {
  if(meta?.changed_db!==false || meta?.rows_written!==0 ||
    row?.qa_tenant!==1 || row?.alpha_count!==1 || row?.bravo_count!==1 ||
    !Number.isSafeInteger(row.alpha_id)||row.alpha_id<=0 ||
    !Number.isSafeInteger(row.bravo_id)||row.bravo_id<=0 ||
    row.alpha_id===row.bravo_id ||
    row.qa_browser_users!==1 || row.qa_employee_linked_users!==1 ||
    row.qa_chromium_bound_active!==1 || row.qa_webkit_users!==0 ||
    row.qa_existing_course_enrollments!==0 || row.qa_existing_native_pins!==0 ||
    row.qa_course_published!==1 || row.qa_editions_published!==1 ||
    row.qa_marker!==1 || row.applied_0561!==1 || row.applied_0562!==1) {
    throw Error('PLAYER3_QA_PHYSICAL_PREFLIGHT_FAILED');
  }
  return {chromium:row.alpha_id,webkit:row.bravo_id};
}

export function assertPostflight(row,meta) {
  if(meta?.changed_db!==false || meta?.rows_written!==0 ||
    row?.qa_tenant!==1 || row?.qa_browser_users!==2 ||
    row?.qa_distinct_employees!==2 || row?.qa_pinned_native_enrollments!==2 ||
    row?.qa_distinct_cycles!==2 || row?.qa_pinned_published_edition!==2) {
    throw Error('PLAYER3_QA_PHYSICAL_POSTFLIGHT_FAILED');
  }
}

export function verifyClaim(token, employee) {
  const sections=String(token||'').split('.');
  if(sections.length!==3) throw Error('PLAYER3_QA_JWT_STRUCTURE');
  let claims;
  try { claims=JSON.parse(Buffer.from(sections[1],'base64url').toString('utf8')); }
  catch { throw Error('PLAYER3_QA_JWT_PAYLOAD'); }
  // Additional structural assertion; real signature/rights are checked by Worker.
  if(claims?.empresa_id!==QA_TENANT ||
    Number(claims?.funcionario_id)!==employee ||
    !['ALUNO','student'].includes(String(claims?.role))) {
    throw Error('PLAYER3_QA_IDENTITY_SCOPE_INVALID');
  }
}

const sqlBefore = `SELECT
 (SELECT COUNT(*) FROM empresas e WHERE e.id=999006 AND e.codigo='qa_examiner_training'
  AND e.ativo=1 AND e.deleted_at IS NULL) qa_tenant,
 (SELECT COUNT(*) FROM funcionarios f WHERE f.empresa_id=999006 AND
  f.matricula='QA-PARTICIPANTE-ALFA' AND f.ativo=1 AND f.deleted_at IS NULL) alpha_count,
 (SELECT MIN(f.id) FROM funcionarios f WHERE f.empresa_id=999006 AND
  f.matricula='QA-PARTICIPANTE-ALFA' AND f.ativo=1 AND f.deleted_at IS NULL) alpha_id,
 (SELECT COUNT(*) FROM funcionarios f WHERE f.empresa_id=999006 AND
  f.matricula='QA-PARTICIPANTE-BRAVO' AND f.ativo=1 AND f.deleted_at IS NULL) bravo_count,
 (SELECT MIN(f.id) FROM funcionarios f WHERE f.empresa_id=999006 AND
  f.matricula='QA-PARTICIPANTE-BRAVO' AND f.ativo=1 AND f.deleted_at IS NULL) bravo_id,
 (SELECT COUNT(*) FROM usuarios u WHERE lower(u.email) IN
  ('qa-player3-chromium@staging.airtrust.invalid','qa-player3-webkit@staging.airtrust.invalid')) qa_browser_users,
 (SELECT COUNT(*) FROM usuarios u JOIN funcionarios f ON f.id=u.funcionario_id
  WHERE f.empresa_id=999006 AND f.matricula IN ('QA-PARTICIPANTE-ALFA','QA-PARTICIPANTE-BRAVO')
  AND u.deleted_at IS NULL) qa_employee_linked_users,
 (SELECT COUNT(*) FROM usuarios u JOIN funcionarios f ON f.id=u.funcionario_id
  WHERE lower(u.email)='qa-player3-chromium@staging.airtrust.invalid'
  AND u.active=1 AND u.deleted_at IS NULL AND f.id=2 AND f.empresa_id=999006
  AND f.matricula='QA-PARTICIPANTE-ALFA' AND f.ativo=1 AND f.deleted_at IS NULL)
  qa_chromium_bound_active,
 (SELECT COUNT(*) FROM usuarios u WHERE
  lower(u.email)='qa-player3-webkit@staging.airtrust.invalid') qa_webkit_users,
 (SELECT COUNT(*) FROM lms_matriculas m WHERE m.empresa_id=999006 AND m.curso_id=327
  AND m.deleted_at IS NULL) qa_existing_course_enrollments,
 (SELECT COUNT(*) FROM lms_native_matricula_edicoes b WHERE b.empresa_id=999006
  AND b.curso_id=327) qa_existing_native_pins,
 (SELECT COUNT(*) FROM lms_cursos c WHERE c.id=327 AND c.empresa_id=999006
  AND c.ativo=1 AND c.publicado=1 AND c.deleted_at IS NULL) qa_course_published,
 (SELECT COUNT(*) FROM lms_native_edicoes ed WHERE ed.empresa_id=999006
  AND ed.curso_id=327 AND ed.id=1 AND ed.status='PUBLISHED') qa_editions_published,
 (SELECT COUNT(*) FROM lms_native_catalog_activation a WHERE a.empresa_id=999006
  AND a.curso_id=327) qa_marker,
 (SELECT COUNT(*) FROM airtrust_schema_changes_v2
  WHERE change_id='lms-native-catalog-activation-0561') applied_0561,
 (SELECT COUNT(*) FROM airtrust_schema_changes_v2
  WHERE change_id='lms-player3-canonical-terminal-0562') applied_0562;`;

const sqlAfter = `SELECT
 (SELECT COUNT(*) FROM empresas e WHERE e.id=999006 AND e.codigo='qa_examiner_training'
  AND e.ativo=1 AND e.deleted_at IS NULL) qa_tenant,
 (SELECT COUNT(*) FROM usuarios u JOIN usuarios_empresas ue ON ue.usuario_id=u.id
  AND ue.empresa_id=999006 JOIN funcionarios f ON f.id=u.funcionario_id
  AND f.empresa_id=999006 AND f.ativo=1 AND f.deleted_at IS NULL
  WHERE u.active=1 AND u.deleted_at IS NULL AND lower(u.email) IN
  ('qa-player3-chromium@staging.airtrust.invalid','qa-player3-webkit@staging.airtrust.invalid')) qa_browser_users,
 (SELECT COUNT(DISTINCT u.funcionario_id) FROM usuarios u
  JOIN funcionarios f ON f.id=u.funcionario_id AND f.empresa_id=999006
  WHERE u.active=1 AND u.deleted_at IS NULL AND lower(u.email) IN
  ('qa-player3-chromium@staging.airtrust.invalid','qa-player3-webkit@staging.airtrust.invalid')) qa_distinct_employees,
 (SELECT COUNT(*) FROM lms_native_matricula_edicoes b
  JOIN lms_matriculas m ON m.id=b.matricula_id AND m.empresa_id=b.empresa_id
   AND m.curso_id=b.curso_id
  JOIN usuarios u ON u.funcionario_id=m.funcionario_id AND u.deleted_at IS NULL
  WHERE b.empresa_id=999006 AND b.curso_id=327
   AND lower(u.email) IN ('qa-player3-chromium@staging.airtrust.invalid',
   'qa-player3-webkit@staging.airtrust.invalid')) qa_pinned_native_enrollments,
 (SELECT COUNT(DISTINCT b.ciclo_id) FROM lms_native_matricula_edicoes b
  WHERE b.empresa_id=999006 AND b.curso_id=327) qa_distinct_cycles,
 (SELECT COUNT(*) FROM lms_native_matricula_edicoes b
  JOIN lms_native_edicoes ed ON ed.id=b.edicao_id AND ed.empresa_id=b.empresa_id
  WHERE b.empresa_id=999006 AND b.curso_id=327 AND ed.id=1
  AND ed.status='PUBLISHED') qa_pinned_published_edition;`;

function requireD1Read(sql) {
  if(!/^SELECT\s/i.test(sql)||sql.split(';').filter(Boolean).length!==1 ||
    /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|ATTACH|PRAGMA)\b/i.test(sql)) {
    throw Error('PLAYER3_QA_SQL_NOT_READONLY');
  }
  const cfg=readFileSync('worker-airtrust/wrangler.toml','utf8');
  const section=cfg.match(/\[\[env\.staging\.d1_databases\]\]([\s\S]*?)(?=\n\[|$)/)?.[1]??'';
  if(!section.includes('database_name = "'+D1+'"') ||
    !section.includes('database_id = "'+D1_UUID+'"') ||
    section.includes('7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae')) {
    throw Error('PLAYER3_QA_STAGING_DB_PIN_MISMATCH');
  }
  const proc=spawnSync('./node_modules/.bin/wrangler',
    ['d1','execute',D1,'--env','staging','--remote','--json','--command='+sql],
    {cwd:resolve('worker-airtrust'),encoding:'utf8',timeout:55000,maxBuffer:1024*1024,
     stdio:['ignore','pipe','pipe']});
  if(proc.error||proc.status!==0) throw Error('PLAYER3_QA_D1_READ_FAILED');
  let data;try{data=JSON.parse(proc.stdout)}catch{throw Error('PLAYER3_QA_D1_INVALID_JSON')}
  const result=Array.isArray(data)?data[0]:data;
  if(result?.success!==true||!Array.isArray(result.results)||result.results.length!==1)
    throw Error('PLAYER3_QA_D1_INVALID_RESULT');
  return {row:result.results[0],meta:result.meta};
}

const addOutput=(key,value)=>{
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,key+'='+String(value)+'\n');
};
const ghHeaders=()=>({
  Authorization:'Bearer '+process.env.GITHUB_TOKEN,
  Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28'
});
async function ghGet(path) {
  const response=await fetch('https://api.github.com/repos/'+REPO+path,
    {headers:ghHeaders(),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('PLAYER3_QA_GITHUB_READ_'+response.status);
  return response.json();
}
async function guard(){
  const e=process.env;
  if(e.GITHUB_REPOSITORY!==REPO||e.GITHUB_REF!=='refs/heads/main'||
    e.GITHUB_EVENT_NAME!=='workflow_dispatch'||!e.GITHUB_TOKEN||
    !SHA_RE.test(e.PLAYER3_QA_RELEASE_SHA??'')||
    !/^[1-9][0-9]*$/.test(e.PLAYER3_QA_GRANT_ID??'')) {
    throw Error('PLAYER3_QA_TRUSTED_MAIN_DISPATCH_REQUIRED');
  }
  const current=await ghGet('/git/ref/heads/main');
  if(current.object?.sha!==e.GITHUB_SHA)
    throw Error('PLAYER3_QA_TRUSTED_MAIN_MOVED');
  const comment=await ghGet('/issues/comments/'+e.PLAYER3_QA_GRANT_ID);
  const permission=await ghGet('/collaborators/'+encodeURIComponent(e.GITHUB_ACTOR)+'/permission');
  assertGrant(comment,permission.permission,e.GITHUB_ACTOR,e.PLAYER3_QA_RELEASE_SHA);
  const pr=await ghGet('/pulls/1389');
  if(pr.state!=='open'||!pr.draft||pr.base?.ref!=='main'||
    pr.head?.sha!==e.PLAYER3_QA_RELEASE_SHA||
    pr.head?.repo?.full_name!==REPO||pr.head?.repo?.fork)
    throw Error('PLAYER3_QA_PR_SCOPE_OR_HEAD_CHANGED');
  const checks=await ghGet('/commits/'+e.PLAYER3_QA_RELEASE_SHA+'/check-runs?per_page=100');
  if(checks.total_count>100||!Array.isArray(checks.check_runs))throw Error('PLAYER3_QA_CHECKS_UNAVAILABLE');
  for(const name of EXPECTED_CHECKS){
    const matching=checks.check_runs.filter(x=>x.name===name);
    if(matching.length!==1||matching[0].status!=='completed'||
      matching[0].conclusion!=='success'||matching[0].app?.slug!=='github-actions')
      throw Error('PLAYER3_QA_GATE_NOT_GREEN:'+name);
  }
  const live=await fetch(API+'/api/version',{signal:AbortSignal.timeout(15000)});
  if(!live.ok)throw Error('PLAYER3_QA_VERSION_UNAVAILABLE');
  const body=await live.json();
  if(body?.data?.environment!=='staging'||
     body?.data?.sourceSha!==e.PLAYER3_QA_RELEASE_SHA||
     !/^[a-f0-9]{64}$/.test(body?.data?.releaseManifestSha256??'')) {
    throw Error('PLAYER3_QA_LIVE_STAGING_SHA_MISMATCH');
  }
  console.log('PLAYER3_QA_GRANT_GATES_PROVENANCE_VERIFIED');
}

async function apiPost(path,body,token){
  const headers={Accept:'application/json'};
  // An empty POST must not advertize a JSON payload. Native enrollment
  // rejects a present request body and is deliberately bodyless.
  if(body!==null)headers['Content-Type']='application/json';
  if(token) headers.Authorization='Bearer '+token;
  const response=await fetch(API+path,{method:'POST',headers,
    ...(body===null?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(20000)});
  if(!response.ok){
    // Only structured server error codes, never request/response bodies,
    // credentials, tokens or invitation URLs are safe to record.
    let code='UNCLASSIFIED';
    try {
      const rejected=await response.json();
      if(/^[A-Z][A-Z0-9_]{2,80}$/.test(String(rejected?.code??'')))code=rejected.code;
    } catch { /* no diagnostic body */ }
    throw Error('PLAYER3_QA_API_'+path.replace(/[0-9]+/g,'N')+
      '_HTTP_'+response.status+'_CODE_'+code);
  }
  const payload=await response.json();
  if(payload?.success!==true)throw Error('PLAYER3_QA_API_REJECTED');
  return payload.data;
}

async function provision(){
  const e=process.env;
  if(e.CONFIRM_STAGING_PLAYER3_QA_LEARNERS!=='AIRTRUST_STAGING_PLAYER3_QA_LEARNERS')
    throw Error('PLAYER3_QA_WRITE_CONFIRMATION_MISSING');
  if(!e.QA_EXAMINER_ADMIN_EMAIL||!e.QA_EXAMINER_ADMIN_PASSWORD ||
    !e.PLAYER3_QA_CHROMIUM_PASSWORD||!e.PLAYER3_QA_WEBKIT_PASSWORD ||
    e.PLAYER3_QA_CHROMIUM_PASSWORD===e.PLAYER3_QA_WEBKIT_PASSWORD)
    throw Error('PLAYER3_QA_PROTECTED_CREDENTIALS_MISSING_OR_SHARED');
  const employeeIds={chromium:Number(e.PLAYER3_QA_ALPHA_ID),
    webkit:Number(e.PLAYER3_QA_BRAVO_ID)};
  if(!Object.values(employeeIds).every(x=>Number.isSafeInteger(x)&&x>0)||
    employeeIds.chromium===employeeIds.webkit)
    throw Error('PLAYER3_QA_EMPLOYEE_IDS_INVALID');
  const admin=await apiPost('/api/auth/login',{
    email:e.QA_EXAMINER_ADMIN_EMAIL,password:e.QA_EXAMINER_ADMIN_PASSWORD
  },null);
  if(!admin?.accessToken)throw Error('PLAYER3_QA_ADMIN_LOGIN_FAILED');
  const adminClaims=JSON.parse(Buffer.from(admin.accessToken.split('.')[1],'base64url').toString('utf8'));
  if(adminClaims.empresa_id!==QA_TENANT ||
    !['ADMIN','ADMINISTRADOR'].includes(String(adminClaims.role)))
    throw Error('PLAYER3_QA_ADMIN_ROLE_OR_TENANT_MISMATCH');
  const receipts=[];
  for(const learner of LEARNERS){
    const employeeId=employeeIds[learner.key];
    // Only fixed disposable email + employee and course; never customer identities.
    const password=learner.key==='chromium'?
      e.PLAYER3_QA_CHROMIUM_PASSWORD:e.PLAYER3_QA_WEBKIT_PASSWORD;
    // Physical SELECT-only preflight pins Chromium's exact existing active
    // user+employee and WebKit absence. Never reissue an invite for Chromium.
    if(learner.key==='webkit'){
      const created=await apiPost('/api/admin/usuarios',{
        email:learner.email,nome:learner.name,perfil:'ALUNO',
        funcionario_id:employeeId,empresa_id:QA_TENANT
      },admin.accessToken);
      if(!Number.isSafeInteger(created?.id)||!created.inviteToken)
        throw Error('PLAYER3_QA_INVITATION_NOT_ISSUED');
      await apiPost('/api/auth/invite/accept',{token:created.inviteToken,senha:password},null);
    }
    const logged=await apiPost('/api/auth/login',{
      email:learner.email,password
    },null);
    if(!logged?.accessToken||logged?.user?.funcionario_id!==employeeId)
      throw Error('PLAYER3_QA_LEARNER_LOGIN_SCOPE_MISMATCH');
    verifyClaim(logged.accessToken,employeeId);
    const enrolled=await apiPost('/api/lms/native/cursos/327/matricular',null,
      logged.accessToken);
    if(!Number.isSafeInteger(enrolled?.matricula_id)||enrolled.matricula_id<=0 ||
      !Number.isSafeInteger(enrolled?.ciclo_id)||enrolled.ciclo_id<=0)
      throw Error('PLAYER3_QA_NATIVE_ENROLLMENT_RECEIPT_INVALID');
    receipts.push({browser:learner.key,enrollmentId:enrolled.matricula_id,
      cycleId:enrolled.ciclo_id});
    console.log('PLAYER3_QA_LEARNER_NATIVE_ENROLLMENT_CREATED:'+learner.key);
  }
  if(new Set(receipts.map(x=>x.enrollmentId)).size!==2||
    new Set(receipts.map(x=>x.cycleId)).size!==2)
    throw Error('PLAYER3_QA_BROWSER_ENROLLMENTS_NOT_INDEPENDENT');
  // Only nonsecret synthetic IDs; never print JWTs, invite URLs or passwords.
  for(const r of receipts){
    addOutput(r.browser+'_enrollment_id',r.enrollmentId);
    addOutput(r.browser+'_cycle_id',r.cycleId);
  }
  console.log('PLAYER3_QA_TWO_INDEPENDENT_NATIVE_ENROLLMENTS_CREATED');
}

export async function main(mode) {
  if(!['guard','preflight','provision','verify'].includes(mode)){
    console.log('PLAYER3_QA_DRY_RUN_ONLY: guard|preflight|provision|verify');
    return;
  }
  await guard();
  if(mode==='guard')return;
  if(mode==='preflight'){
    const result=requireD1Read(sqlBefore);
    const ids=assertPreflight(result.row,result.meta);
    addOutput('alpha_id',ids.chromium);
    addOutput('bravo_id',ids.webkit);
    console.log('PLAYER3_QA_STAGING_SELECT_ONLY_PREFLIGHT_PASS');
  } else if(mode==='provision'){
    await provision();
  } else {
    const result=requireD1Read(sqlAfter);
    assertPostflight(result.row,result.meta);
    console.log('PLAYER3_QA_TWO_NATIVE_EDITION_PINS_VERIFIED_READONLY');
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv[2]).catch(error=>{
    const safe=String(error?.message??'');
    console.error(safe.startsWith('PLAYER3_QA_')?safe:'PLAYER3_QA_EXECUTION_FAILED_CLOSED');
    process.exitCode=1;
  });
}
