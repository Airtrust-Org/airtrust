#!/usr/bin/env node
// FDM 13 reassignment preflight, strictly READ-ONLY and aggregate-only.
// Never mark a SCORM enrollment completed, copy incompatible CMI/quiz data,
// infer committee membership from a job title, or expose learner identifiers.
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  assertAllowedProductionBaseUrl,
  extractAccessToken,
  fetchJson,
  login,
} from '../smoke-auth-common.mjs';

const API = assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL || 'https://api.airtrust.online');
const COMPANY = 6;
const SOURCE_COURSE = 13;
const SHA = String(process.env.EXPECTED_PRODUCTION_SHA || '').toLowerCase().trim();
const TARGETS = Object.freeze({
  tripulacao: 'FDM-TRIPULACAO',
  manutencao: 'FDM-MECANICO',
  comite_gatekeeper: 'FDM-COMITE-GATEKEEPER',
});
const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
function failUnless(check,code){if(!check)throw new Error(code);}
export function classifyFdmAudience(funcao, designations=[]) {
  const role=norm(funcao);
  const designated = new Set(designations.map(norm));
  const groups=[];
  if (['COMANDANTE','COPILOTO'].includes(role)) groups.push('tripulacao');
  if (['MECANICO','AUXILIAR DE MANUTENCAO','AUX MANUTENCAO'].includes(role)) groups.push('manutencao');
  if ([
    'GERENTE DE SEGURANCA OPERACIONAL','GERENTE DE MANUTENCAO','GERENTE DE OPERACOES',
    'ANALISTA DE FDM','ANALISTA FDM','COORDENADOR DE FDM','COORDENADOR FDM',
    'COORDENADOR DE ENGENHARIA',
  ].includes(role) || designated.has('GATEKEEPER') || designated.has('FDM_COMITE')) groups.push('comite_gatekeeper');
  return {group:groups.length===1?groups[0]:null,
    reason:groups.length===0?'UNMAPPED_ROLE':groups.length>1?'MULTIPLE_ELIGIBLE_AUDIENCES':null};
}
export function summarizeFdmAssignment(enrollments, employees, assignmentMap, courses) {
  const counts={source_total:enrollments.length,groups:{tripulacao:0,manutencao:0,comite_gatekeeper:0},
    needs_review:{UNMAPPED_ROLE:0,MULTIPLE_ELIGIBLE_AUDIENCES:0,EMPLOYEE_NOT_IN_ACTIVE_CATALOG:0},
    unfinished_99_or_more:0,source_completed:0,source_not_completed:0,
    source_raw_100_without_completion:0,already_target_enrolled:0};
  const seen=new Set();
  for (const row of enrollments) {
    const id=Number(row?.funcionario_id || 0);
    failUnless(Number.isInteger(id) && id>0,'SOURCE_EMPLOYEE_ID_INVALID');
    failUnless(!seen.has(id),'SOURCE_DUPLICATE_EMPLOYEE_ENROLLMENT');
    seen.add(id);
    const status=norm(row?.status);
    const raw=Number(row?.progresso_bruto ?? row?.progresso_pct ?? 0);
    if(status==='CONCLUIDO')counts.source_completed++;else {
      counts.source_not_completed++;
      if(raw>=99)counts.unfinished_99_or_more++;
      if(raw>=100)counts.source_raw_100_without_completion++;
    }
    const employee=employees.get(id);
    if(!employee){counts.needs_review.EMPLOYEE_NOT_IN_ACTIVE_CATALOG++;continue;}
    const decision=classifyFdmAudience(employee.funcao_nome,assignmentMap.get(id)||[]);
    if(decision.reason)counts.needs_review[decision.reason]++;
    else counts.groups[decision.group]++;
  }
  failUnless(counts.source_completed+counts.source_not_completed===counts.source_total,'SOURCE_COUNTS_MISMATCH');
  failUnless(Object.values(counts.groups).reduce((a,b)=>a+b,0)+Object.values(counts.needs_review).reduce((a,b)=>a+b,0)===counts.source_total,'AUDIENCE_ASSIGNMENT_INCOMPLETE');
  return { ...counts,targets:courses,conditions:{
    no_inferred_completion:true,
    preserve_source_histories:true,
    source_course_will_remain_until_governed_apply_and_verified_zero_active:true,
    requires_exact_destination_scorm_and_qualification_links:true,
    unclassified_or_multi_audience_require_review:true,
    production_write_executed:false,
  }};
}
async function safeGet(token, route) {
  failUnless(route.startsWith('/api/'),'READONLY_PATH_INVALID');
  const r=await fetchJson(API+route,{headers:{Authorization:'Bearer '+token}});
  failUnless(r.status===200,'READONLY_HTTP_'+r.status+':'+route.split('?')[0]);
  return r.json;
}
async function assertSha(){
  failUnless(/^[0-9a-f]{40}$/.test(SHA),'PINNED_SHA_INVALID');
  const r=await fetchJson(API+'/api/version');
  const d=r.json?.data&&typeof r.json.data==='object'?r.json.data:r.json;
  failUnless(r.status===200&&String(d?.sourceSha||d?.source_sha||'').toLowerCase()===SHA,'PRODUCTION_SHA_MISMATCH');
}
async function tokenForTenant(){
  const email=String(process.env.PROD_SMOKE_EMAIL||'').trim();
  const password=String(process.env.PROD_SMOKE_PASSWORD||'');
  failUnless(email&&password,'PROD_CREDS_MISSING');
  const result=await login(API,email,password);
  let token=extractAccessToken(result);
  failUnless(Boolean(token),'ACCESS_TOKEN_MISSING');
  const context=await safeGet(token,'/api/auth/empresas');
  const companies=Array.isArray(context?.data?.empresas)?context.data.empresas:[];
  failUnless(companies.some(x=>Number(x.id)===COMPANY),'TENANT_NOT_AUTHORIZED');
  if(Number(context?.data?.empresaAtualId)!==COMPANY){
    const changed=await fetchJson(API+'/api/auth/select-empresa',{method:'POST',headers:{
      Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({empresaId:COMPANY})});
    failUnless(changed.status===200,'TENANT_SELECTION_REJECTED');
    token=String(changed.json?.data?.accessToken||'');
  }
  const me=await safeGet(token,'/api/auth/me');
  failUnless(['ADMIN','ADMINISTRADOR'].includes(norm(me?.data?.role)),'ADMIN_FULL_TENANT_REQUIRED');
  const tenant=await safeGet(token,'/api/empresas/minha');
  failUnless(Number(tenant?.data?.id)===COMPANY,'TENANT_CONTEXT_MISMATCH');
  return token;
}
async function listCourses(token){
  const rows=[];
  for(let page=1;page<=20;page++){
    const r=await safeGet(token,'/api/lms/cursos?page='+page+'&limit=200');
    const data=Array.isArray(r?.data)?r.data:[];
    rows.push(...data);
    const total=Number(r?.pagination?.total??rows.length);
    if(rows.length>=total){failUnless(rows.length===total,'COURSE_PAGINATION_CHANGED');return rows;}
    failUnless(data.length>0,'COURSE_PAGINATION_EMPTY');
  }
  throw new Error('COURSE_PAGINATION_LIMIT');
}
async function getEnrollments(token,courseId){
  const rows=[];
  for(let page=1;page<=100;page++){
    const r=await safeGet(token,'/api/lms/matriculas/curso/'+courseId+'?page='+page+'&limit=200');
    const data=Array.isArray(r?.data)?r.data:[];
    rows.push(...data);
    const total=Number(r?.pagination?.total??NaN);
    failUnless(Number.isInteger(total)&&total>=0,'ENROLLMENT_PAGINATION_TOTAL_INVALID');
    if(rows.length>=total){failUnless(rows.length===total,'ENROLLMENT_PAGINATION_CHANGED');return rows;}
    failUnless(data.length>0,'ENROLLMENT_PAGE_EMPTY');
  }
  throw new Error('ENROLLMENT_PAGE_LIMIT');
}
async function run(){
  await assertSha();
  const token=await tokenForTenant();
  const [catalog,source,conditions,assignees]=await Promise.all([
    listCourses(token),
    getEnrollments(token,SOURCE_COURSE),
    safeGet(token,'/api/compliance-treinamentos/condicoes/catalogos'),
    safeGet(token,'/api/compliance-treinamentos/condicoes/atribuicoes'),
  ]);
  failUnless(Array.isArray(conditions?.data?.funcionarios)&&Array.isArray(conditions?.data?.condicoes),'DESIGNATION_CATALOG_MISSING');
  failUnless(Array.isArray(assignees?.data),'DESIGNATION_ASSIGNMENTS_MISSING');
  failUnless(catalog.some(x=>Number(x.id)===SOURCE_COURSE),'SOURCE_COURSE_MISSING');
  const employees=new Map(conditions.data.funcionarios.map(e=>[Number(e.id),e]));
  const designations=new Map();
  for(const a of assignees.data){
    if(!['FDM_COMITE','GATEKEEPER'].includes(norm(a.condicao_codigo)))continue;
    const id=Number(a.funcionario_id);
    const prev=designations.get(id)||[];
    prev.push(String(a.condicao_codigo));
    designations.set(id,prev);
  }
  const targetState={};
  for(const [audience,code] of Object.entries(TARGETS)){
    const matches=[];
    for(const c of catalog){
      if(Number(c.id)===SOURCE_COURSE)continue;
      const title=norm(c.titulo);
      const labelMatches=audience==='tripulacao'?/FDM.*TRIPULACAO/.test(title)
        :audience==='manutencao'?/FDM.*(MNT|MANUTENCAO|MECANICO)/.test(title)
        :/FDM.*(COMITE|GATEKEEPER)/.test(title);
      if(!labelMatches)continue;
      const detail=await safeGet(token,'/api/lms/cursos/'+Number(c.id));
      const d=detail?.data||{};
      const actualCode=norm(d.qualificacao_tipo_codigo||'');
      matches.push({course_id:Number(c.id),active:Number(c.ativo)===1,published:Number(c.publicado)===1,
        qualification_link_matches:actualCode===code,format:String(c.tipo_conteudo||'').toLowerCase(),
        has_scorm_launch:Boolean(String(d.scorm_launch_file||'').trim())});
    }
    targetState[audience]={qualification_code:code,candidate_count:matches.length,
      ready:matches.length===1&&matches[0].active&&matches[0].published&&matches[0].qualification_link_matches&&
        matches[0].format==='scorm'&&matches[0].has_scorm_launch,
      candidates:matches};
  }
  const result=summarizeFdmAssignment(source,employees,designations,targetState);
  const output={schema_version:1,empresa_id:COMPANY,production_sha:SHA,source_course_id:SOURCE_COURSE,
    observed_at:new Date().toISOString(),scope:'active employee records visible through existing management API',
    warning:'No staff identities, enrollments, roles-per-person, or real progress records are exported.',
    blocker: Object.values(targetState).every(t=>t.ready)?null:'DESTINATION_LMS_COURSES_NOT_READY',
    ...result};
  process.stdout.write(JSON.stringify(output,null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run().catch(e=>{
  console.error('FDM13_READONLY_PREFLIGHT_FAILED:'+String(e.message||e).slice(0,180));
  process.exitCode=1;
});
