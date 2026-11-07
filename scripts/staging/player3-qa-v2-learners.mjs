#!/usr/bin/env node
/** Fresh Native enrollment of two EXISTING synthetic students into the NEW V2 QA course.
 * Staging-only, exact SHA + admin grant, D1 SELECT-only provenance and Worker POST.
 * Never reuses or changes the previous course 327 enrollment or its edition.
 */
import {readFileSync,appendFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {REPO,API,TENANT,LEARNERS,GATES,assertClaims}
  from './player3-qa-existing-learner-readback.mjs';
export const CONFIRM='AIRTRUST_PLAYER3_QA_V2_ENROLL_V1';
export const V2_HASH='07d9a165a7840b548aee339354054885d437d19909537ead6e5eab4b71449c8e';
const db='airtrust-db-staging-baseline-20260701',dbId='bf9963f4-eb12-439b-a830-20bbf577ac22';
const sha40=/^[a-f0-9]{40}$/;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const deny=c=>{throw Error('PLAYER3_QA_V2_'+c)};
const need=(ok,c)=>{if(!ok)deny(c)};
const issue='https://api.github.com/repos/'+REPO+'/issues/776';
export function validateGrant(comment,actor,permission,sha,course,now=Date.now()){
 need(positive(course)&&sha40.test(sha)&&
  comment?.body===CONFIRM+' '+sha+' tenant='+TENANT+' course='+course+' learners=2 staging-only'&&
  comment?.issue_url===issue&&comment?.user?.login===actor&&
  permission==='admin'&&comment?.created_at===comment?.updated_at&&
  Number.isFinite(Date.parse(comment.created_at))&&
  now>=Date.parse(comment.created_at)&&now-Date.parse(comment.created_at)<=4*3600000,
  'FRESH_EXACT_ADMIN_GRANT_REQUIRED');
}
export function checkRows(rows,course,after=false){
 need(positive(course)&&Array.isArray(rows)&&rows.length===2,
  'TWO_EXACT_STUDENTS_REQUIRED');
 const employees=new Set();
 for(const label of LEARNERS){
  const row=rows.find(x=>x.email===label.email);
  need(row&&row.empresa_id===TENANT&&positive(row.funcionario_id)&&
   row.course_count===1&&row.marker_count===1&&
   row.published_count===1&&row.edition_count===1&&
   row.edition_hash===V2_HASH&&
   row.enrollment_count===(after?2:0),
   'V2_COURSE_EDITION_STUDENT_SCOPE_INVALID');
  if(after)need(positive(row.matricula_id)&&positive(row.ciclo_id)&&
   row.status==='NAO_INICIADO'&&row.ciclo_status==='NAO_INICIADO'&&
   row.ciclo_atual===1,'V2_ATOMIC_ENROLLMENT_OR_CYCLE_MISSING');
  employees.add(row.funcionario_id);
 }
 need(employees.size===2,'V2_STUDENT_IDENTITIES_NOT_DISTINCT');
 if(after){
  need(new Set(rows.map(x=>x.matricula_id)).size===2&&
       new Set(rows.map(x=>x.ciclo_id)).size===2,
       'V2_ENROLLMENT_OR_CYCLE_COLLISION');
 }
 return rows;
}
const C=()=>{const n=Number(process.env.PLAYER3_QA_V2_COURSE_ID);need(positive(n),'V2_COURSE_ID_REQUIRED');return n};
function scopedSql(course,after){
 const general=[
 'SELECT lower(u.email) email,f.id funcionario_id,f.empresa_id,',
 "(SELECT COUNT(*) FROM lms_cursos c WHERE c.empresa_id=999006 AND c.id="+course+
 " AND c.titulo='QA-PLAYER3-NATIVE-ONLY-SYNTHETIC-V2' AND c.version_tag='qa-player3-native-synthetic-v2' AND c.tipo_conteudo='scorm' AND c.ativo=1 AND c.publicado=1 AND c.deleted_at IS NULL) course_count,",
 '(SELECT COUNT(*) FROM lms_native_catalog_activation a WHERE a.empresa_id=999006 AND a.curso_id='+course+') marker_count,',
 "(SELECT COUNT(*) FROM lms_native_edicoes ed WHERE ed.empresa_id=999006 AND ed.curso_id="+course+" AND ed.status='PUBLISHED') published_count,",
 "(SELECT COUNT(*) FROM lms_native_edicoes ed JOIN lms_player3_politicas p ON p.edicao_id=ed.id AND p.empresa_id=ed.empresa_id AND p.curso_id=ed.curso_id WHERE ed.empresa_id=999006 AND ed.curso_id="+course+" AND ed.status='PUBLISHED' AND ed.artifact_sha256='"+V2_HASH+"' AND p.estado='APPROVED') edition_count,",
 "(SELECT COUNT(*) FROM lms_matriculas m WHERE m.empresa_id=999006 AND m.curso_id="+course+" AND m.deleted_at IS NULL) enrollment_count,",
 "'"+V2_HASH+"' edition_hash,"
 ];
 if(after){
  general.push("m.id matricula_id,cy.id ciclo_id,m.status,cy.status ciclo_status,cy.ciclo_atual");
 }else general.push('0 matricula_id,0 ciclo_id,NULL status,NULL ciclo_status,0 ciclo_atual');
 general.push('FROM usuarios u JOIN funcionarios f ON f.id=u.funcionario_id AND f.empresa_id=999006 AND f.ativo=1 AND f.deleted_at IS NULL');
 if(after)general.push('JOIN lms_matriculas m ON m.funcionario_id=f.id AND m.empresa_id=999006 AND m.curso_id='+course+' AND m.deleted_at IS NULL',
 'JOIN lms_native_matricula_edicoes b ON b.matricula_id=m.id AND b.empresa_id=999006 AND b.curso_id='+course,
 'JOIN lms_native_edicoes ed ON ed.id=b.edicao_id AND ed.artifact_sha256=\''+V2_HASH+'\' AND ed.status=\'PUBLISHED\'',
 'JOIN lms_matricula_ciclos cy ON cy.id=b.ciclo_id AND cy.matricula_id=m.id AND cy.empresa_id=999006 AND cy.curso_id='+course+' AND cy.funcionario_id=f.id AND cy.ciclo_atual=1 AND cy.status=m.status AND cy.deleted_at IS NULL');
 general.push("WHERE u.active=1 AND u.deleted_at IS NULL AND lower(u.email) IN ('"+LEARNERS.map(x=>x.email).join("','")+"') ORDER BY lower(u.email)");
 return general.join(' ');
}
function selectRows(course,after){
 need(process.env.CLOUDFLARE_API_TOKEN&&process.env.CLOUDFLARE_ACCOUNT_ID,
 'PROTECTED_D1_READ_CREDENTIALS_REQUIRED');
 const cfg=readFileSync('worker-airtrust/wrangler.toml','utf8');
 const section=cfg.match(/\[\[env\.staging\.d1_databases\]\]([\s\S]*?)(?=\n\[|$)/)?.[1]??'';
 need(section.includes('database_name = "'+db+'"')&&
      section.includes('database_id = "'+dbId+'"'),
      'WRANGLER_STAGING_DATABASE_MISMATCH');
 const query=scopedSql(course,after);
 need(query.startsWith('SELECT ')&&
      !/\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|ATTACH|PRAGMA)\b/i.test(query),
      'SQL_NOT_READ_ONLY');
 const result=spawnSync('./node_modules/.bin/wrangler',
  ['d1','execute',db,'--env','staging','--remote','--json','--command='+query],
  {cwd:resolve('worker-airtrust'),encoding:'utf8',timeout:65000,
   maxBuffer:1048576,stdio:['ignore','pipe','pipe']});
 need(result.status===0&&!result.error,'D1_SELECT_FAILED_CLOSED');
 let payload;try{payload=JSON.parse(result.stdout)}catch{deny('D1_JSON_INVALID')}
 const stmt=Array.isArray(payload)?payload[0]:payload;
 need(stmt?.success===true&&Array.isArray(stmt.results)&&
      stmt.meta?.changed_db===false&&stmt.meta?.rows_written===0,
      'D1_READONLY_NOT_PROVEN');
 return checkRows(stmt.results,course,after);
}
async function gh(path){
 const r=await fetch('https://api.github.com/repos/'+REPO+path,{
 headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,
  Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
 need(r.ok,'GITHUB_READ_'+r.status);return r.json();
}
export async function guard(){
 const e=process.env,course=C();
 need(e.GITHUB_REF==='refs/heads/main'&&e.GITHUB_EVENT_NAME==='workflow_dispatch'&&
  e.GITHUB_REPOSITORY===REPO&&e.CONFIRM_V2_ENROLL===CONFIRM&&
  sha40.test(e.PLAYER3_QA_V2_RELEASE_SHA||'')&&
  /^[1-9][0-9]*$/.test(e.PLAYER3_QA_V2_GRANT_ID||'')&&
  e.GITHUB_TOKEN&&e.GITHUB_ACTOR,'TRUSTED_MAIN_DISPATCH_REQUIRED');
 const [main,comment,perm,pr,checks,version]=await Promise.all([
  gh('/git/ref/heads/main'),gh('/issues/comments/'+e.PLAYER3_QA_V2_GRANT_ID),
  gh('/collaborators/'+encodeURIComponent(e.GITHUB_ACTOR)+'/permission'),
  gh('/pulls/1389'),gh('/commits/'+e.PLAYER3_QA_V2_RELEASE_SHA+'/check-runs?per_page=100'),
  fetch(API+'/api/version',{signal:AbortSignal.timeout(15000)})
 ]);
 need(main?.object?.sha===e.GITHUB_SHA,'TRUSTED_MAIN_MOVED');
 validateGrant(comment,e.GITHUB_ACTOR,perm?.permission,e.PLAYER3_QA_V2_RELEASE_SHA,course);
 need(pr?.number===1389&&pr?.state==='open'&&pr?.draft===true&&
      pr.head?.sha===e.PLAYER3_QA_V2_RELEASE_SHA&&pr.base?.ref==='main'&&
      pr.head?.repo?.full_name===REPO&&!pr.head?.repo?.fork,
      'PLAYER3_PR_CHANGED');
 need(checks?.total_count<=100&&Array.isArray(checks?.check_runs),
      'GATES_UNAVAILABLE');
 for(const name of GATES){
  const matched=checks.check_runs.filter(v=>v.name===name);
  need(matched.length===1&&matched[0].status==='completed'&&
       matched[0].conclusion==='success'&&matched[0].app?.slug==='github-actions',
       'GATE_NOT_GREEN_'+name.replace(/[^a-z0-9]/gi,'_'));
 }
 need(version.ok,'STAGING_VERSION_HTTP');
 const live=(await version.json())?.data;
 need(live?.environment==='staging'&&live?.sourceSha===e.PLAYER3_QA_V2_RELEASE_SHA&&
  /^[a-f0-9]{64}$/.test(live?.releaseManifestSha256||''),
  'STAGING_LIVE_SHA_MISMATCH');
}
async function apiPost(path,body,token){
 const r=await fetch(API+path,{method:'POST',headers:{
  Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),
  ...(body!==null?{'Content-Type':'application/json'}:{})},
  ...(body!==null?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 need(r.ok,'WORKER_POST_HTTP_'+r.status);
 const data=await r.json();
 need(data?.success===true&&data?.data,'WORKER_POST_INVALID');
 return data.data;
}
async function enroll(course,rows){
 need(!process.env.CLOUDFLARE_API_TOKEN&&!process.env.CLOUDFLARE_ACCOUNT_ID,
  'WORKER_MUST_NOT_HAVE_D1_SECRETS');
 need(process.env.PLAYER3_QA_CHROMIUM_PASSWORD&&process.env.PLAYER3_QA_WEBKIT_PASSWORD&&
 process.env.PLAYER3_QA_CHROMIUM_PASSWORD!==process.env.PLAYER3_QA_WEBKIT_PASSWORD,
 'DISTINCT_QA_SECRETS_REQUIRED');
 for(const l of LEARNERS){
  const before=rows.find(x=>x.email===l.email);
  const secret=process.env[l.browser==='chromium'?'PLAYER3_QA_CHROMIUM_PASSWORD':'PLAYER3_QA_WEBKIT_PASSWORD'];
  const user=await apiPost('/api/auth/login',{email:l.email,password:secret},null);
  need(typeof user.accessToken==='string','LEARNER_ACCESS_TOKEN_MISSING');
  assertClaims(user.accessToken,before);
  const receipt=await apiPost('/api/lms/native/cursos/'+course+'/matricular',null,user.accessToken);
  need(positive(receipt.matricula_id)&&positive(receipt.ciclo_id),
   'ATOMIC_ENROLLMENT_RECEIPT_INVALID');
  console.log('PLAYER3_QA_V2_WORKER_ENROLLMENT_SUCCESS:'+l.browser);
 }
}
async function main(mode){
 if(!['guard','preflight','enroll','verify'].includes(mode))deny('MODE_INVALID');
 await guard();
 const course=C();
 if(mode==='guard'){console.log('PLAYER3_QA_V2_SHA_GRANT_LIVE_CI_PASS');return}
 if(mode==='preflight'){
  const rows=selectRows(course,false);
  need(process.env.GITHUB_OUTPUT,'PROTECTED_ROSTER_OUTPUT_REQUIRED');
  appendFileSync(process.env.GITHUB_OUTPUT,'roster='+JSON.stringify(rows)+'\n');
  console.log('PLAYER3_QA_V2_ZERO_NEW_ENROLLMENTS_CONFIRMED');return;
 }
 if(mode==='enroll'){
  need(process.env.CONFIRM_V2_MUTATION===CONFIRM,'ENROLLMENT_WRITE_CONFIRMATION_REQUIRED');
  let rows;try{rows=JSON.parse(process.env.PLAYER3_QA_V2_ROSTER||'')}
   catch{deny('PREFLIGHT_ROSTER_MISSING')}
  checkRows(rows,course,false);
  await enroll(course,rows);return;
 }
 selectRows(course,true);
 console.log('PLAYER3_QA_V2_TWO_REAL_NEW_PINS_VERIFIED_NO_GRADES');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main(process.argv[2]).catch(e=>{
  console.error(String(e?.message).startsWith('PLAYER3_QA_V2_')?
   e.message:'PLAYER3_QA_V2_FAIL_CLOSED');process.exitCode=1;
 });
