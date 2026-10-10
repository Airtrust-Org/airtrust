#!/usr/bin/env node
// Administrative reconciliation for training COMPLETED according to the
// Training Manager: canonical tenant-scoped API, never raw SQL or forged SCORM.
import process from 'node:process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assertAllowedProductionBaseUrl, extractAccessToken, fetchJson, login } from '../smoke-auth-common.mjs';
const API=assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL || 'https://api.airtrust.online');
const MODE=process.env.LMS99_MODE;
const MAIN=String(process.env.EXPECTED_MAIN_SHA||'').toLowerCase();
const PROD=String(process.env.EXPECTED_PRODUCTION_SHA||'').toLowerCase();
const TENANT=Number(process.env.TARGET_COMPANY_ID);
const REASON='Regularizacao administrativa de treinamento concluido, confirmada pela Gerencia de Treinamento em 10/10/2026; falha de encerramento LMS/SCORM 99%, incidente #1325. Preservar trilha de auditoria, sem exigir repeticao do treinamento.';
const valid=(v,code)=>{if(!v)throw Error('LMS99_'+code);};
const upper=x=>String(x??'').trim().toUpperCase();
const progress=x=>Number(x?.progresso_bruto??x?.progresso_pct??-1);
export function plan(courses){
  const rows=[],excluded={cancelled:0,reproved:0,other:0};
  const seen=new Set();
  for(const course of courses)for(const row of course.enrollments){
    const s=upper(row.status),p=progress(row),id=Number(row.id),cid=Number(course.id);
    if(s==='CONCLUIDO'||p<99)continue;
    if(s==='CANCELADO'){excluded.cancelled++;continue;}
    if(s==='REPROVADO'){excluded.reproved++;continue;}
    if(!['EM_ANDAMENTO','NAO_INICIADO'].includes(s)){excluded.other++;continue;}
    valid(p===100,'AMBIGUOUS_PROGRESS');
    valid(Number.isInteger(id)&&id>0&&Number.isInteger(cid)&&cid>0&&!seen.has(id),'IDENTITY_INVALID');
    seen.add(id);rows.push({id,cid,status:s,p});
  }
  rows.sort((a,b)=>a.cid-b.cid||a.id-b.id);
  valid(rows.length<=100,'COHORT_LIMIT');
  return {rows,excluded,hash:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
}
async function get(token,route){
  valid(route.startsWith('/api/lms/')||['/api/auth/empresas','/api/auth/me','/api/empresas/minha'].includes(route),'PATH_BLOCKED');
  return fetchJson(API+route,{headers:{Authorization:'Bearer '+token}});
}
async function pin(){
  const r=await fetchJson(API+'/api/version');
  valid(r.status===200,'VERSION_HTTP');
  const d=r.json?.data&&typeof r.json.data==='object'?r.json.data:r.json;
  valid(String(d?.sourceSha||d?.source_sha||'').toLowerCase()===PROD,'VERSION_MISMATCH');
}
async function authorize(){
  const email=process.env.PROD_SMOKE_EMAIL,password=process.env.PROD_SMOKE_PASSWORD;
  valid(email&&password,'CREDENTIAL_MISSING');
  let token=extractAccessToken(await login(API,email,password));valid(token,'TOKEN_MISSING');
  const r=await get(token,'/api/auth/empresas');
  valid(r.status===200&&r.json?.data?.empresas?.some(c=>Number(c.id)===TENANT),'TENANT_ACCESS_DENIED');
  if(Number(r.json?.data?.empresaAtualId)!==TENANT){
    const c=await fetchJson(API+'/api/auth/select-empresa',{method:'POST',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({empresaId:TENANT})});
    valid(c.status===200,'TENANT_SELECT_FAILED');
    token=c.json?.data?.accessToken;valid(token,'TENANT_TOKEN_MISSING');
  }
  const me=await get(token,'/api/auth/me'),company=await get(token,'/api/empresas/minha');
  valid(me.status===200&&['ADMIN','ADMINISTRADOR'].includes(upper(me.json?.data?.role)),'ADMIN_REQUIRED');
  valid(company.status===200&&Number(company.json?.data?.id)===TENANT,'TENANT_MISMATCH');
  return token;
}
async function collect(token){
  let courses=[],total=-1;
  for(let n=1;n<=20;n++){
    const r=await get(token,'/api/lms/cursos?page='+n+'&limit=200');
    valid(r.status===200,'COURSES_HTTP');
    const list=r.json?.data||[];valid(Array.isArray(list),'COURSES_INVALID');
    if(total===-1)total=Number(r.json?.pagination?.total??list.length);
    courses.push(...list);
    if(courses.length>=total)break;
    valid(list.length&&n<20,'COURSE_PAGES_EXHAUSTED');
  }
  valid(courses.length===total,'COURSE_COUNT_CHANGED');
  const cohort=[];
  for(const course of courses.filter(c=>Number(c.ativo)===1&&Number(c.publicado)===1)){
    const enrollments=[];let expected=-1;
    for(let n=1;n<=100;n++){
      const r=await get(token,'/api/lms/matriculas/curso/'+Number(course.id)+'?page='+n+'&limit=200');
      valid(r.status===200,'ENROLLMENTS_HTTP');
      const list=r.json?.data||[];valid(Array.isArray(list),'ENROLLMENTS_INVALID');
      const count=Number(r.json?.pagination?.total??0);
      if(expected===-1)expected=count;
      valid(expected===count,'PAGINATION_DRIFT');
      enrollments.push(...list);
      if(enrollments.length>=expected)break;
      valid(list.length&&n<100,'ENROLLMENT_PAGES_EXHAUSTED');
    }
    valid(enrollments.length===expected,'ENROLLMENT_COUNT_MISMATCH');
    cohort.push({id:course.id,enrollments});
  }
  return plan(cohort);
}
function report(p,results){
  const by_course={};
  for(const row of p.rows)by_course[row.cid]=(by_course[row.cid]||0)+1;
  return {schema_version:1,repo_sha:MAIN,production_sha:PROD,tenant:TENANT,
    mode:MODE,administrator_attestation:'TRAINING_MANAGEMENT_CONFIRMED_REAL_COMPLETION_2026_10_10',
    candidates:p.rows.length,candidate_hash:p.hash,by_course,excluded:p.excluded,
    writes:results.completed||0,results,scorm_cmi_changed:false,personal_data:false,
    completion_date_rule:'CANONICAL_SERVER_DATE',historical_training_date_not_fabricated:true};
}
async function main(){
  valid(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REF==='refs/heads/main','GITHUB_MAIN_REQUIRED');
  valid(/^[a-f0-9]{40}$/.test(MAIN)&&process.env.GITHUB_SHA===MAIN,'SOURCE_SHA_CHANGED');
  valid(/^[a-f0-9]{40}$/.test(PROD)&&TENANT===6,'PRODUCTION_SCOPE_INVALID');
  valid(['dry-run','apply'].includes(MODE),'MODE_INVALID');
  valid(process.env.LMS99_CONFIRMATION===('AIRTRUST_LMS99_'+(MODE==='apply'?'APPLY':'DRY_RUN')),'CONFIRMATION_MISSING');
  await pin();const token=await authorize();const cohort=await collect(token);
  if(MODE==='dry-run'){process.stdout.write(JSON.stringify(report(cohort,{completed:0}),null,2));return;}
  valid(cohort.rows.length>0&&cohort.hash===process.env.REVIEWED_COHORT_HASH,'REVIEWED_COHORT_CHANGED');
  const results={completed:0,already_completed:0,rejected_409:0,rejected_403:0,other_error:0,qualification_linked:0};
  for(const row of cohort.rows){
    await pin();
    const before=await get(token,'/api/lms/matriculas/'+row.id);
    valid(before.status===200,'ROW_READ_FAILED');
    const data=before.json?.data||{};
    if(upper(data.status)==='CONCLUIDO'){results.already_completed++;continue;}
    valid(upper(data.status)===row.status&&Number(data.curso_id)===row.cid&&progress(data)===100,'ROW_DRIFT');
    const res=await fetchJson(API+'/api/lms/matriculas/'+row.id+'/status',{
      method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({status:'CONCLUIDO',observacoes:REASON})});
    if(res.status===409){results.rejected_409++;continue;}
    if(res.status===403){results.rejected_403++;continue;}
    if(res.status!==200||res.json?.success!==true){results.other_error++;break;}
    const after=await get(token,'/api/lms/matriculas/'+row.id);
    valid(after.status===200&&upper(after.json?.data?.status)==='CONCLUIDO'&&
      Number(after.json?.data?.progresso_pct)===100&&
      Boolean(String(after.json?.data?.data_conclusao||'').trim()),'POSTCHECK_FAILED');
    if(after.json?.data?.qualificacao_historico_id)results.qualification_linked++;
    results.completed++;
  }
  process.stdout.write(JSON.stringify(report(cohort,results),null,2));
  valid(results.other_error===0&&results.rejected_409===0&&results.rejected_403===0,'RECONCILIATION_PARTIAL_REVIEW_REQUIRED');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error('LMS99_GOVERNED_FAILED:'+String(e.message).slice(0,90));process.exitCode=1;});
