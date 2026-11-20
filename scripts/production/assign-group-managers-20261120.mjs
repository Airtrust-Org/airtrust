#!/usr/bin/env node
// Governed, idempotent company-6 designation enrollment. No role changes.
// Employee IDs are scoped identifiers, never a cross-tenant search.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {assertAllowedProductionBaseUrl,login,selectEmpresa,extractAccessToken,decodeJwtPayload,fetchJson} from '../smoke-auth-common.mjs';

const API=assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL||'https://api.airtrust.online');
const MODE=process.argv[2]||'dry-run';
const EMPRESA=6, CONDITION=36;
const EMPLOYEES=[33,75,111,118,134,137,138,146,147,148,174,175,176,177,181,186,187,189,191];
const REQUIRED_RULES=[668,669];
const check=(value,code)=>{if(!value)throw Error(code)};
const digest=(value)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function query(sql){
  check(/^SELECT\b/i.test(sql.trim())&&!/\b(?:UPDATE|DELETE|INSERT|ALTER|DROP|CREATE|ATTACH|PRAGMA)\b/i.test(sql),'READ_ONLY_REQUIRED');
  const r=spawnSync('npx',['wrangler','d1','execute','airtrust-db','--env','production','--remote','--json','--command',sql],{cwd:new URL('../../worker-airtrust/',import.meta.url),encoding:'utf8',timeout:60000,maxBuffer:1000000});
  let x;try{x=JSON.parse(r.stdout)?.[0]}catch{}
  check(r.status===0&&x?.success===true&&Array.isArray(x.results)&&Number(x.meta?.rows_written||0)===0&&!x.meta?.changed_db,'D1_READ_FAILED');
  return x.results;
}
function snapshot(){
 const c=query('SELECT id,codigo,tipo,ativo,deleted_at FROM compliance_condicoes WHERE id=36 AND empresa_id=6');
 check(c.length===1&&c[0].codigo==='GESTOR'&&c[0].tipo==='DESIGNACAO'&&c[0].ativo===1&&!c[0].deleted_at,'DESIGNATION_DRIFT');
 const employees=query('SELECT id,empresa_id,ativo,status,deleted_at FROM funcionarios WHERE empresa_id=6 AND id IN ('+EMPLOYEES.join(',')+') ORDER BY id');
 check(employees.length===19&&employees.every((e,i)=>e.id===EMPLOYEES[i]&&e.ativo===1&&e.status==='ATIVO'&&!e.deleted_at),'EMPLOYEE_SCOPE_DRIFT');
 const rules=query('SELECT id,qualificacao_tipo_id,ativo,obrigatoriedade,auto_matricular_ead FROM treinamento_requisitos WHERE empresa_id=6 AND condicao_id=36 AND ativo=1 AND deleted_at IS NULL ORDER BY id');
 check(rules.length===2&&rules.every((r,i)=>r.id===REQUIRED_RULES[i]&&r.obrigatoriedade==='OBRIGATORIA'&&r.auto_matricular_ead===1),'RULES_DRIFT');
 const courses=query('SELECT id,qualificacao_tipo_id,ativo,publicado FROM lms_cursos WHERE empresa_id=6 AND deleted_at IS NULL AND qualificacao_tipo_id IN ('+rules.map(r=>r.qualificacao_tipo_id).join(',')+') ORDER BY id');
 check(rules.every(r=>courses.filter(c=>c.qualificacao_tipo_id===r.qualificacao_tipo_id&&c.ativo===1).length===1),'COURSE_MAPPING_DRIFT');
 const unpublished=courses.filter(c=>c.ativo===1&&c.publicado!==1).map(c=>c.id).join(',');
 check(unpublished===''||unpublished==='82','UNREVIEWED_UNPUBLISHED_COURSE_CHANGE');
 const assignments=query('SELECT id,funcionario_id,condicao_id,ativo,deleted_at,data_inicio,data_fim FROM funcionarios_compliance_condicoes WHERE empresa_id=6 AND condicao_id=36 AND funcionario_id IN ('+EMPLOYEES.join(',')+') ORDER BY funcionario_id,id');
 check(assignments.every(a=>EMPLOYEES.includes(a.funcionario_id)),'ASSIGNMENT_SCOPE_DRIFT');
 check(assignments.filter(a=>a.ativo===1&&!a.deleted_at).every(a=>a.condicao_id===36),'ASSIGNMENT_CONFLICT');
 return {employees,rules,courses,assignments,hash:digest({employees,rules,courses,assignments})};
}
async function adminToken(){
 check(Boolean(process.env.E2E_EMAIL&&process.env.E2E_PASSWORD),'ADMIN_CREDS_MISSING');
 const r=await login(API,process.env.E2E_EMAIL,process.env.E2E_PASSWORD);
 let token=extractAccessToken(r);
 check(typeof token==='string'&&token.length>20,'LOGIN_FAILED');
 if(Number(decodeJwtPayload(token)?.empresa_id)!==EMPRESA){
  const selected=await selectEmpresa(API,token,EMPRESA);
  check(selected.status===200,'TENANT_SELECTION_DENIED');
  token=extractAccessToken(selected.json);
 }
 check(Number(decodeJwtPayload(token)?.empresa_id)===EMPRESA,'TENANT_MISMATCH');
 const me=await fetchJson(API+'/api/auth/me',{headers:{Authorization:'Bearer '+token}});
 check(me.status===200&&me.json?.success===true&&['admin','administrador','manager','gestor'].includes(String(me.json.data?.role||'').toLowerCase()),'ADMIN_DENIED');
 return token;
}
function report(o){
 const s=JSON.stringify(o,null,2)+'\n';
 if(process.env.GROUP_MANAGERS_REPORT)writeFileSync(process.env.GROUP_MANAGERS_REPORT,s,{mode:0o600});
 else process.stdout.write(s);
}
export async function main(){
 check(['dry-run','apply'].includes(MODE),'MODE_INVALID');
 check(process.env.GROUP_MANAGERS_CONFIRMATION===(MODE==='apply'?'ASSIGN_GROUP_MANAGERS_19_TENANT6_NO_EMAIL':'GROUP_MANAGERS_19_DRY_RUN'),'CONFIRMATION_INVALID');
 check(process.env.GITHUB_REF==='refs/heads/main'&&process.env.GITHUB_SHA===process.env.GROUP_MANAGERS_EXPECTED_SHA,'REVIEWED_MAIN_SHA_MISMATCH');
 const before=snapshot();
 const out={mode:MODE,sha:process.env.GITHUB_SHA,empresa_id:EMPRESA,condition_id:CONDITION,employee_count:EMPLOYEES.length,initial_active_assignments:before.assignments.filter(a=>a.ativo&&!a.deleted_at).length,unpublished_course_ids:before.courses.filter(c=>c.ativo&&c.publicado!==1).map(c=>c.id),state_hash:before.hash,mutated:false};
 if(MODE==='dry-run'){report(out);return}
 check(process.env.GROUP_MANAGERS_REVIEWED_HASH===before.hash,'REVIEWED_STATE_DRIFT');
 const token=await adminToken();
 let created=0,preserved=0,reactivated=0,deferred=0;
 for(const id of EMPLOYEES){
  const response=await fetchJson(API+'/api/compliance-treinamentos/condicoes/atribuicoes',{
   method:'POST',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({funcionario_id:id,condicao_id:CONDITION,data_inicio:'2026-11-20',data_fim:null,origem:'EMPRESA',justificativa:'Integrante do Grupo de Gestores para aplicação das regras de Compliance de Treinamentos.'}),
  });
  check(response.status===201&&response.json?.success===true,'ASSIGNMENT_HTTP_'+response.status);
  const enrollment=response.json?.data?.auto_enrollment;
  const warning=response.json?.data?.auto_enrollment_warning;
  check(enrollment!==null&&(!warning||warning==='UNMAPPED_MANDATORY_QUALIFICATION'),'ASSIGNMENT_ENROLLMENT_WARNING');
  deferred+=Number(enrollment?.unavailable_course||0);
  created+=Number(enrollment?.created||0);
  preserved+=Number(enrollment?.preserved||0);
  reactivated+=Number(enrollment?.reactivated||0);
 }
 const after=snapshot();
 const active=after.assignments.filter(a=>a.ativo&&!a.deleted_at);
 check(active.length===19&&new Set(active.map(a=>a.funcionario_id)).size===19,'POSTCONDITION_ASSIGNMENTS_FAILED');
 report({...out,mutated:true,active_assignments:active.length,enrollments_created:created,enrollments_preserved:preserved,enrollments_reactivated:reactivated,deferred_unpublished_course_enrollments:deferred,training_enrollments_fully_available:deferred===0,postconditions_verified:true,email_sent:false});
}
if(import.meta.url==='file://'+process.argv[1])main().catch(e=>{console.error('GROUP_MANAGERS_ERROR:'+String(e.message).replace(/[^A-Z0-9_:-]/gi,'_').slice(0,140));process.exitCode=1});
