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
});
const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
function failUnless(check,code){if(!check)throw new Error(code);}
// Explicit Training Manager decision: transfer legacy FDM #13 only to
// Tripulação and Manutenção. All other roles, including formally designated
// Comitê/Gatekeeper members, are OUT OF SCOPE for this historical transfer.
// This does NOT remove their independent new FDM committee training obligations.
export function classifyFdmAudience(funcao) {
  const role = norm(funcao);
  if (['COMANDANTE', 'COPILOTO'].includes(role)) {
    return { group: 'tripulacao', reason: null };
  }
  if (['MECANICO', 'AUXILIAR DE MANUTENCAO', 'AUX MANUTENCAO'].includes(role)) {
    return { group: 'manutencao', reason: null };
  }
  return { group: null, reason: 'OUT_OF_SCOPE_BY_USER_DECISION' };
}
export function summarizeFdmAssignment(enrollments, employees, courses, existingDestEnrollments = {}) {
  const counts={source_total:enrollments.length,groups:{tripulacao:0,manutencao:0},
    excluded_from_migration:0,
    needs_review:{EMPLOYEE_NOT_IN_ACTIVE_CATALOG:0},
    unfinished_99_or_more:0,
    eligible_unfinished_99_or_more:0,
    excluded_unfinished_99_or_more:0,
    source_completed:0,source_not_completed:0,
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
    const decision=classifyFdmAudience(employee.funcao_nome);
    if(decision.reason === 'OUT_OF_SCOPE_BY_USER_DECISION') {
      counts.excluded_from_migration++;
      if(status!=='CONCLUIDO' && raw>=99) counts.excluded_unfinished_99_or_more++;
    } else if(decision.reason) throw new Error('UNKNOWN_FDM_ASSIGNMENT_REASON');
    else {
      counts.groups[decision.group]++;
      if(status!=='CONCLUIDO' && raw>=99) counts.eligible_unfinished_99_or_more++;
      if (existingDestEnrollments[decision.group]?.has(id)) counts.already_target_enrolled++;
    }
  }
  failUnless(counts.source_completed+counts.source_not_completed===counts.source_total,'SOURCE_COUNTS_MISMATCH');
  failUnless(counts.eligible_unfinished_99_or_more+counts.excluded_unfinished_99_or_more <=
    counts.unfinished_99_or_more,'CREDIT_ELIGIBILITY_OVERFLOW');
  failUnless(Object.values(counts.groups).reduce((a,b)=>a+b,0)+counts.excluded_from_migration+
    Object.values(counts.needs_review).reduce((a,b)=>a+b,0)===counts.source_total,'AUDIENCE_ASSIGNMENT_INCOMPLETE');
  return { ...counts,targets:courses,conditions:{
    no_inferred_completion:true,
    preserve_source_histories:true,
    source_course_will_remain_until_governed_apply_and_verified_zero_active:true,
    requires_exact_destination_scorm_and_qualification_links:true,
    out_of_scope_legacy_enrollments_are_soft_cancel_candidates_only:true,
    historical_evidence_must_remain_preserved:true,
    at_99_is_not_sufficient_proof_of_mastery_or_equivalent_completion:true,
    administrative_equivalence_requires_reviewed_evidence_and_auditable_approval:true,
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
async function listQualifications(token){
  // The live qualification-types API is filtered, limit-capped, and does not
  // implement page/offset; query the FDM family specifically and fail closed
  // on a saturated 500-row response instead of inventing pagination.
  const r=await safeGet(token,'/api/qualificacoes/tipos?search=FDM&limit=500');
  failUnless(Array.isArray(r?.data),'QUALIFICATION_LIST_INVALID');
  failUnless(r.data.length<500,'QUALIFICATION_LIST_POSSIBLY_TRUNCATED');
  return r.data;
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
  const [catalog,source,sourceCourse,conditions,qualifications]=await Promise.all([
    listCourses(token),
    getEnrollments(token,SOURCE_COURSE),
    // The normal catalog deliberately lists only active, published courses.
    // FDM #13 is legacy evidence, so verify its tenant-scoped detail by ID
    // rather than treating an inactive historical source as missing.
    safeGet(token,'/api/lms/cursos/'+SOURCE_COURSE),
    safeGet(token,'/api/compliance-treinamentos/condicoes/catalogos'),
    listQualifications(token),
  ]);
  failUnless(Array.isArray(conditions?.data?.funcionarios)&&Array.isArray(conditions?.data?.condicoes),'DESIGNATION_CATALOG_MISSING');
  failUnless(Number(sourceCourse?.data?.id)===SOURCE_COURSE,'SOURCE_COURSE_MISSING');
  const employees=new Map(conditions.data.funcionarios.map(e=>[Number(e.id),e]));
  const targetState={};
  const destinationEnrollments={};
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
    const matchingQualifications=qualifications.filter(q=>norm(q.codigo)===code && Number(q.ativo)===1 && !q.deleted_at);
    targetState[audience]={qualification_code:code,qualification_models_active:matchingQualifications.length,
      candidate_count:matches.length,
      ready:matchingQualifications.length===1&&matches.length===1&&matches[0].active&&matches[0].published&&matches[0].qualification_link_matches&&
        matches[0].format==='scorm'&&matches[0].has_scorm_launch,
      candidates:matches};
    if (matches.length===1) {
      const destRows=await getEnrollments(token,matches[0].course_id);
      destinationEnrollments[audience]=new Set(destRows.map(r=>Number(r.funcionario_id)));
    }
  }
  const result=summarizeFdmAssignment(source,employees,targetState,destinationEnrollments);
  const output={schema_version:2,empresa_id:COMPANY,production_sha:SHA,source_course_id:SOURCE_COURSE,
    observed_at:new Date().toISOString(),scope:'Legacy FDM13 only: transfer pilot/maintenance, exclude other roles by explicit user decision',
    warning:'No staff identities, enrollments, roles-per-person, or real progress records are exported.',
    blocker: targetState.tripulacao?.ready && targetState.manutencao?.ready ? null : 'TRANSFER_DESTINATIONS_NOT_READY',
    ...result};
  process.stdout.write(JSON.stringify(output,null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run().catch(e=>{
  console.error('FDM13_READONLY_PREFLIGHT_FAILED:'+String(e.message||e).slice(0,180));
  process.exitCode=1;
});
