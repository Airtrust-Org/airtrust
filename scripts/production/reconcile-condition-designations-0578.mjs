#!/usr/bin/env node
// source_reference: live tenant-6 condition assignments #1..#7, 2026-11-11;
// operational_decision: reconcile only effective, published EAD rules under Schema V2 0578.
// dry_run_required: same-SHA and unchanged read-only candidate hash before apply.
// rollback_plan_required: governed D1 Time Travel recovery; never rewrite historical evidence.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {assertAllowedProductionBaseUrl,login,selectEmpresa,extractAccessToken,decodeJwtPayload,fetchJson} from '../smoke-auth-common.mjs';
const API=assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL||'https://api.airtrust.online');
const MODE=process.argv[2]||'dry-run';
const TARGETS=[1,2,3,4,5,6,7];
const CONDITIONS=[27,26,28,29,30,13,32];
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const check=(x,c)=>{if(!x)throw Error(c)};
const sleep=new Int32Array(new SharedArrayBuffer(4));
function select(sql,label){
 check(/^SELECT\b/i.test(sql)&&!/\b(UPDATE|INSERT|DELETE|CREATE|DROP|ALTER)\b/i.test(sql),'NON_READONLY_QUERY');
 for(let i=0;i<5;i++){
  const r=spawnSync('npx',['wrangler','d1','execute','airtrust-db','--env','production','--remote','--json','--command',sql],
   {cwd:new URL('../../worker-airtrust/',import.meta.url),encoding:'utf8',timeout:60000,maxBuffer:10000000});
  let j;try{j=JSON.parse(r.stdout)}catch{}
  const x=Array.isArray(j)?j?.[0]:j;
  if(r.status===0&&x?.success&&Array.isArray(x.results)){
   check(!x.meta?.changed_db&&!x.meta?.rows_written,'D1_UNEXPECTED_MUTATION');
   return x.results;
  }
  if(i===4||!/7429|is overloaded|too many resources/i.test((r.stderr||'')+' '+(r.stdout||'')))throw Error('READ_FAILED_'+label);
  Atomics.wait(sleep,0,0,(i+1)*2500);
 }
 throw Error('READ_RETRIES_EXHAUSTED');
}
function snapshot(){
 const rules=select("SELECT tr.id,tr.qualificacao_tipo_id,tr.condicao_id,tr.modalidade_requerida,tr.auto_matricular_ead FROM treinamento_requisitos tr WHERE tr.empresa_id=6 AND tr.ativo=1 AND tr.deleted_at IS NULL AND tr.condicao_id IN (9,12,13,14,26,27,28,29,30,32,36) AND tr.auto_matricular_ead=1 AND tr.modalidade_requerida='EAD' ORDER BY tr.id",'RULES');
 check(rules.length===11,'EXPECTED_11_CONFIGURED_POLICIES');
 const assignments=select("SELECT a.id,a.funcionario_id,a.condicao_id,a.data_inicio,a.data_fim,a.origem,a.referencia_normativa,a.justificativa FROM funcionarios_compliance_condicoes a JOIN funcionarios f ON f.id=a.funcionario_id AND f.empresa_id=a.empresa_id AND f.deleted_at IS NULL AND f.ativo=1 WHERE a.empresa_id=6 AND a.ativo=1 AND a.deleted_at IS NULL AND a.id IN (1,2,3,4,5,6,7) ORDER BY a.id",'ASSIGNMENTS');
 check(assignments.length===7,'ASSIGNMENTS_MISSING');
 check(assignments.every((x,i)=>Number(x.id)===TARGETS[i]&&Number(x.condicao_id)===CONDITIONS[i]),'ASSIGNMENT_SCOPE_CHANGED');
 const course=select('SELECT id,qualificacao_tipo_id,ativo,publicado FROM lms_cursos WHERE id=73 AND empresa_id=6 AND deleted_at IS NULL','COURSE');
 check(course.length===1&&Number(course[0].qualificacao_tipo_id)===201&&course[0].ativo===1&&course[0].publicado===1,'FDM_COURSE_MAPPING_CHANGED');
 const manager=select('SELECT id,status,deleted_at FROM lms_matriculas WHERE empresa_id=6 AND funcionario_id=138 AND curso_id=73 ORDER BY id','FDM_MANAGER');
 check(manager.filter(x=>!x.deleted_at).length<=1,'DUPLICATE_FDM_ENROLLMENT');
 return {assignments,rules,course,manager,hash:digest({assignments,rules,course,manager})};
}
async function auth(){
 check(Boolean(process.env.E2E_EMAIL&&process.env.E2E_PASSWORD),'ADMIN_CREDS_NOT_AVAILABLE');
 const r=await login(API,process.env.E2E_EMAIL,process.env.E2E_PASSWORD);
 let token=extractAccessToken(r);
 check(typeof token==='string'&&token.length>20,'LOGIN_FAILED');
 if(Number(decodeJwtPayload(token)?.empresa_id)!==6){
  const x=await selectEmpresa(API,token,6);
  check(x.status===200,'TENANT_SELECTION_DENIED');
  token=extractAccessToken(x.json);
 }
 check(Number(decodeJwtPayload(token)?.empresa_id)===6,'CROSS_TENANT_AUTH');
 const me=await fetchJson(API+'/api/auth/me',{headers:{Authorization:'Bearer '+token}});
 check(me.status===200&&me.json?.success===true,'SESSION_INVALID');
 check(['admin','administrador','manager','gestor'].includes(String(me.json.data?.role||'').toLowerCase()),'ADMIN_PRIVILEGE_REQUIRED');
 return token;
}
function report(out){
 const data=JSON.stringify(out,null,2)+String.fromCharCode(10);
 if(process.env.COMPLIANCE_0578_RESULT)writeFileSync(process.env.COMPLIANCE_0578_RESULT,data,{mode:0o600});
 else process.stdout.write(data);
}
export async function main(){
 check(['dry-run','apply'].includes(MODE),'UNEXPECTED_MODE');
 check(process.env.COMPLIANCE_0578_CONFIRMATION===(MODE==='apply'?'COMPLIANCE_0578_RECONCILE_7_ASSIGNMENTS_NO_EMAIL':'COMPLIANCE_0578_DRYRUN_ONLY'),'UNAPPROVED_SCOPE');
 check(process.env.GITHUB_REF==='refs/heads/main'&&process.env.GITHUB_SHA===process.env.COMPLIANCE_0578_EXPECTED_SHA,'REVIEWED_SHA_MISMATCH');
 const before=snapshot();
 const out={mode:MODE,main_sha:process.env.GITHUB_SHA,tenant_id:6,expected_assignment_count:7,
   original_state_hash:before.hash,configured_auto_rules:before.rules.length,
   existing_fdm_enrollments:before.manager.filter(x=>!x.deleted_at).length,mutated:false};
 if(MODE==='dry-run'){report(out);return;}
 check(process.env.COMPLIANCE_0578_REVIEWED_STATE_HASH===before.hash,'PREFLIGHT_DRIFT');
 const token=await auth();
 let executed=0;
 for(const a of [...before.assignments].sort((a,b)=>([32,13].indexOf(a.condicao_id)<0?2:[32,13].indexOf(a.condicao_id))-([32,13].indexOf(b.condicao_id)<0?2:[32,13].indexOf(b.condicao_id)))){
  const response=await fetchJson(API+'/api/compliance-treinamentos/condicoes/atribuicoes',{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({
    funcionario_id:a.funcionario_id,condicao_id:a.condicao_id,data_inicio:a.data_inicio,
    data_fim:a.data_fim,origem:a.origem,referencia_normativa:a.referencia_normativa,justificativa:a.justificativa
   })
  });
  check(response.status===201&&response.json?.success===true,'DESIGNATION_RECONCILE_HTTP_'+response.status);
  check(!response.json.data?.auto_enrollment_warning,'DEFERRED_ENROLLMENT_AFTER_ASSIGNMENT');
  check(Number(response.json.data?.id)===Number(a.id),'DESIGNATION_ID_CHANGED');
  executed++;
 }
 const after=select("SELECT id,curso_id,funcionario_id,status,deleted_at FROM lms_matriculas WHERE empresa_id=6 AND curso_id=73 AND funcionario_id=138 AND deleted_at IS NULL ORDER BY id",'FDM_POST');
 check(after.length===1&&after[0].status!=='CANCELADO','FDM_ENROLLMENT_NOT_CREATED');
 const cycle=select("SELECT COUNT(*) n FROM lms_matricula_ciclos WHERE empresa_id=6 AND matricula_id="+Number(after[0].id)+" AND ciclo_atual=1 AND deleted_at IS NULL",'CYCLE_POST');
 check(Number(cycle[0]?.n)===1,'FDM_ACTIVE_CYCLE_MISSING');
 report({...out,mutated:true,replayed_assignments:executed,fdm_course_id:73,fdm_matricula_id:after[0].id,fdm_active_cycle:true,postconditions_verified:true,email_sent:false});
}
if(import.meta.url==='file://'+process.argv[1])main().catch(e=>{console.error('COMPLIANCE_0578_RECONCILE_ERROR:'+String(e?.message||e).replace(/[^\w:-]/g,'_').slice(0,150));process.exitCode=1});
