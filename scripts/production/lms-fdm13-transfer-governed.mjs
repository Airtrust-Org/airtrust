// source_reference: GitHub issue #1279, tenant-6 read-only FDM13 inventory and PR #1276 proof.
 // operational_decision: 2026-10-08 Training Management, FDM13 to 71/72 by function, >=99% administrative equivalence only.
 // dry_run_required: successful SHA-pinned read-only workflow run and matching candidate SHA-256 before apply.
 // rollback_plan_required: approved D1 Time Travel recovery point; any restore requires separate governance and isolation of concurrent writes.
#!/usr/bin/env node
/**
 * Tenant-6 FDM13 historic administrative transfer (NOT a SCORM completion).
 * Runs ONLY inside the reviewed GitHub Actions production workflow.
 * Default mode dry-run; zero production mutations without exact SHA, reviewed
 * candidate hash/count, environment approval and Time Travel recovery point.
 */
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTransferPlan, publicSummary } from './lms-fdm13-transfer-domain.mjs';

const DB='airtrust-db';
const MODE=process.env.FDM13_TRANSFER_MODE||'dry-run';
const CONFIRM_DRY='AIRTRUST_PRODUCTION_FDM13_TRANSFER_DRY_RUN';
const CONFIRM_APPLY='AIRTRUST_PRODUCTION_FDM13_TRANSFER_APPLY_ADMIN_EQUIVALENCE_99_NO_SCORM_NO_EMAIL';
const fail=(code)=>{throw new Error('FDM13_TRANSFER_'+code)};
const check=(v,c)=>{if(!v)fail(c)};
const sha=String(process.env.EXPECTED_MAIN_SHA||'');
check(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REF==='refs/heads/main','GITHUB_MAIN_ONLY');
check(/^[a-f0-9]{40}$/.test(sha)&&sha===process.env.GITHUB_SHA,'PINNED_SHA_INVALID');
check(['dry-run','apply'].includes(MODE),'MODE_INVALID');
check(process.env.FDM13_TRANSFER_CONFIRMATION===(MODE==='apply'?CONFIRM_APPLY:CONFIRM_DRY),'CONFIRMATION_INVALID');
check(process.env.TARGET_COMPANY_ID==='6','TENANT_INVALID');
check(Boolean(process.env.CLOUDFLARE_API_TOKEN)&&Boolean(process.env.CLOUDFLARE_ACCOUNT_ID),'D1_CREDENTIALS_MISSING');

function execute(sql,label,mutating=false){
 const statement=sql.trim().replace(/;+\s*$/,'');
 if(!mutating) {
  check(/^(SELECT|WITH)\b/i.test(statement),'READ_QUERY_INVALID_'+label);
  check(!/\b(?:INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM|CREATE\s+|DROP\s+|ALTER\s+|ATTACH|DETACH|REPLACE\s+INTO)\b/i.test(statement),'READ_QUERY_MUTATION_'+label);
 }else{
  check(MODE==='apply'&&process.env.FDM13_RECOVERY_READY==='yes','APPLY_GUARD_MISSING');
 }
 const result=spawnSync('npx',['wrangler','d1','execute',DB,'--env','production','--remote','--json','--command',statement],
  {cwd:new URL('../../worker-airtrust/',import.meta.url),env:process.env,encoding:'utf8',maxBuffer:32*1024*1024});
 check(result.status===0,'D1_QUERY_FAILED_'+label);
 let data;try{data=JSON.parse(result.stdout||'[]')}catch{fail('D1_JSON_INVALID_'+label)}
 const r=Array.isArray(data)?data[0]:data;
 check(r&&Array.isArray(r.results),'D1_RESULT_INVALID_'+label);
 return r.results;
}
function rows(sql,label){return execute(sql,label)}
function snapshot(){
 const ledger=rows(`SELECT change_id FROM airtrust_schema_changes_v2
  WHERE baseline_id='production-d1-baseline-v2-20260714'
    AND change_id IN ('training-compliance-fdm-three-audiences-0536',
      'training-operational-category-bootstrap-0541')`,'schema_ledger');
 check(ledger.length===2,'SCHEMA_V2_DEPENDENCIES_NOT_APPLIED');
 const source=rows(`SELECT m.id,m.empresa_id,m.curso_id,m.funcionario_id,m.status,m.deleted_at,
  m.progresso_pct,COALESCE(NULLIF(TRIM(fn.nome),''),NULLIF(TRIM(f.funcao),''),NULLIF(TRIM(f.cargo),''),'') funcao_nome,
  CASE WHEN f.id IS NOT NULL AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1
   AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO' THEN 1 ELSE 0 END employee_active
 FROM lms_matriculas m
 LEFT JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=m.empresa_id
 LEFT JOIN funcoes fn ON fn.id=f.funcao_id AND fn.empresa_id=m.empresa_id
 WHERE m.empresa_id=6 AND m.curso_id=13 AND m.deleted_at IS NULL AND UPPER(TRIM(COALESCE(m.status,'')))='CANCELADO'
 ORDER BY m.id`,'source');
 const soft=rows('SELECT COUNT(*) n FROM lms_matriculas WHERE empresa_id=6 AND curso_id=13 AND deleted_at IS NOT NULL','soft_deleted')[0];
 const target=rows(`SELECT m.empresa_id,m.curso_id,m.funcionario_id,m.status,m.deleted_at,m.observacoes,
  CASE WHEN EXISTS (SELECT 1 FROM lms_matricula_ciclos lc
   WHERE lc.matricula_id=m.id AND lc.empresa_id=6 AND lc.ciclo_atual=1 AND lc.deleted_at IS NULL) THEN 1 ELSE 0 END has_current_cycle,
  CASE WHEN EXISTS (SELECT 1 FROM qualificacoes_historico qh
   JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=6
   JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=6
   WHERE qh.id=m.qualificacao_historico_id AND qh.empresa_id=6 AND qh.funcionario_id=m.funcionario_id
    AND qh.qualificacao_codigo=qt.codigo AND qh.deleted_at IS NULL AND qh.origem_tipo='MANUAL'
    AND instr(COALESCE(qh.observacoes,''),'FDM13_ADMIN_TRANSFER_SOURCE_')>0
  ) THEN 1 ELSE 0 END has_administrative_qualification
 FROM lms_matriculas m WHERE m.empresa_id=6 AND m.curso_id IN (71,72,73)`,'targets');
 const courses=rows(`SELECT c.id,c.empresa_id,c.publicado,c.ativo,c.deleted_at,c.tipo_conteudo,
  qt.codigo qt_codigo,qt.ativo qt_ativo,qt.deleted_at qt_deleted
 FROM lms_cursos c LEFT JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id
  AND qt.empresa_id=c.empresa_id WHERE c.empresa_id=6 AND c.id IN (71,72)`,'courses');
 check(courses.length===2,'DESTINATION_COURSE_COUNT_INVALID');
 for(const [id,code] of [[71,'FDM-TRIPULACAO'],[72,'FDM-MECANICO']]){
  const c=courses.find(r=>Number(r.id)===id);
  check(c&&Number(c.ativo)===1&&Number(c.publicado)===1&&c.deleted_at==null
   &&String(c.qt_codigo)===code&&Number(c.qt_ativo)===1&&c.qt_deleted==null
   &&String(c.tipo_conteudo).toLowerCase()==='scorm','DESTINATION_NOT_READY_'+id);
 }
 const plan=buildTransferPlan(source,target,{softDeletedSourceCount:Number(soft.n)});
 const otherHistory=rows(`SELECT qh.funcionario_id,qt.codigo
 FROM qualificacoes_historico qh JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id AND qt.empresa_id=qh.empresa_id
 WHERE qh.empresa_id=6 AND qh.deleted_at IS NULL AND qt.codigo IN ('FDM-TRIPULACAO','FDM-MECANICO')`,'target_qualification_history');
 const hist=new Set(otherHistory.map(r=>Number(r.funcionario_id)+':'+String(r.codigo)));
 for(const c of plan.rows){
  const code=c.course_id===71?'FDM-TRIPULACAO':'FDM-MECANICO';
  check(!hist.has(c.employee_id+':'+code),'PREEXISTING_DESTINATION_QUALIFICATION_REVIEW');
 }
 return plan;
}
const before=snapshot();
const summary=publicSummary(before);
const output={...summary,source_sha:sha,mode:MODE,contains_personal_data:false,
 historical_source_preserved:true,committee_73_untouched:true,emails_sent:0,
 scorm_progress_written:0,certificate_issued:0,mutation_executed:false};
if(MODE==='apply'){
 check(process.env.FDM13_EXPECTED_COUNT===String(summary.candidates),'REVIEWED_COUNT_MISMATCH');
 check(process.env.FDM13_EXPECTED_HASH===summary.candidate_hash,'REVIEWED_HASH_MISMATCH');
 check(summary.already_transferred===0&&summary.candidates===21,'PARTIAL_OR_CHANGED_STATE_REQUIRES_REVIEW');
 check(process.env.FDM13_RECOVERY_READY==='yes','RECOVERY_REQUIRED');
 const values=before.rows.map(r=>'('+[r.source_id,r.employee_id,r.course_id,r.administrative_equivalence?1:0].join(',')+')').join(',');
 check(Boolean(values),'NO_CANDIDATES');
 // All identifiers are validated integers, never user-supplied SQL fragments.
 const cohort='WITH approved(source_id,employee_id,dest,credit) AS (VALUES '+values+')';
 const marker="'FDM13_ADMIN_TRANSFER_SOURCE_' || approved.source_id";
 const insertEnroll=`${cohort}
 INSERT INTO lms_matriculas(empresa_id,curso_id,funcionario_id,status,progresso_pct,data_conclusao,observacoes)
 SELECT 6,approved.dest,approved.employee_id,
   CASE WHEN approved.credit=1 THEN 'CONCLUIDO' ELSE 'NAO_INICIADO' END,
   CASE WHEN approved.credit=1 THEN 100 ELSE 0 END,
   CASE WHEN approved.credit=1 THEN datetime('now') ELSE NULL END,
   ${marker}
 FROM approved WHERE NOT EXISTS(SELECT 1 FROM lms_matriculas m
   WHERE m.empresa_id=6 AND m.curso_id=approved.dest AND m.funcionario_id=approved.employee_id)`;
 const insertQualification=`${cohort}
 INSERT INTO qualificacoes_historico(funcionario_id,qualificacao_id,qualificacao_codigo,tipo_codigo,codigo,
 categoria_id,categoria,categoria_codigo,data_conclusao,observacoes,empresa_id,tipo,status,
 lms_matricula_id,origem_tipo,created_at,updated_at)
 SELECT approved.employee_id,qt.id,qt.codigo,'TREINAMENTO',qt.codigo,qt.categoria_id,qt.categoria,qc.codigo,
  date('now'),'Equivalencia administrativa FDM legado curso 13, reconhecida em ' || date('now')
  || ' por decisao da Gerencia de Treinamento (progresso historico >=99%). '
  || ${marker} || '. Nao representa conclusao do novo SCORM.',
  6,'MANUAL','CONCLUIDA',m.id,'MANUAL',datetime('now'),datetime('now')
 FROM approved JOIN lms_matriculas m ON m.empresa_id=6 AND m.curso_id=approved.dest
   AND m.funcionario_id=approved.employee_id
 JOIN lms_cursos c ON c.empresa_id=6 AND c.id=m.curso_id
 JOIN qualificacoes_tipos qt ON qt.empresa_id=6 AND qt.id=c.qualificacao_tipo_id
 JOIN qualificacoes_categorias qc ON qc.id=qt.categoria_id AND qc.empresa_id=6
 WHERE approved.credit=1 AND m.observacoes=${marker}
  AND NOT EXISTS(SELECT 1 FROM qualificacoes_historico qh WHERE qh.empresa_id=6
   AND qh.funcionario_id=m.funcionario_id AND qh.qualificacao_codigo=qt.codigo AND qh.deleted_at IS NULL)`;
 const insertCycles=`${cohort}
 INSERT INTO lms_matricula_ciclos(empresa_id,matricula_id,curso_id,funcionario_id,numero_ciclo,
 origem,status,ciclo_atual,observacoes,data_matricula,data_conclusao,progresso_pct,
 created_at,updated_at)
 SELECT 6,m.id,approved.dest,approved.employee_id,1,'MANUAL',
   m.status,1,m.observacoes,m.data_matricula,m.data_conclusao,m.progresso_pct,
   datetime('now'),datetime('now')
 FROM approved JOIN lms_matriculas m ON m.empresa_id=6 AND m.curso_id=approved.dest
  AND m.funcionario_id=approved.employee_id AND m.observacoes=${marker}
 WHERE NOT EXISTS(SELECT 1 FROM lms_matricula_ciclos lc WHERE lc.matricula_id=m.id
  AND lc.empresa_id=6 AND lc.deleted_at IS NULL)`;
 const linkM=`${cohort} UPDATE lms_matriculas SET qualificacao_historico_id=(
  SELECT qh.id FROM qualificacoes_historico qh
   WHERE qh.empresa_id=6 AND qh.lms_matricula_id=lms_matriculas.id
     AND qh.deleted_at IS NULL ORDER BY qh.id DESC LIMIT 1)
 WHERE empresa_id=6 AND EXISTS(SELECT 1 FROM approved
  WHERE approved.dest=lms_matriculas.curso_id AND approved.employee_id=lms_matriculas.funcionario_id
   AND approved.credit=1 AND lms_matriculas.observacoes=${marker})`;
 const linkC=`${cohort} UPDATE lms_matricula_ciclos SET qualificacao_historico_id=(
  SELECT m.qualificacao_historico_id FROM lms_matriculas m WHERE m.id=lms_matricula_ciclos.matricula_id
   AND m.empresa_id=6)
 WHERE empresa_id=6 AND EXISTS(SELECT 1 FROM approved
  JOIN lms_matriculas m ON m.empresa_id=6 AND m.curso_id=approved.dest
   AND m.funcionario_id=approved.employee_id AND m.observacoes=${marker}
  WHERE approved.credit=1 AND lms_matricula_ciclos.matricula_id=m.id)`;
 const linkH=`${cohort} UPDATE qualificacoes_historico SET lms_matricula_ciclo_id=(
  SELECT lc.id FROM lms_matricula_ciclos lc WHERE lc.matricula_id=qualificacoes_historico.lms_matricula_id
   AND lc.empresa_id=6 AND lc.ciclo_atual=1 AND lc.deleted_at IS NULL)
 WHERE empresa_id=6 AND origem_tipo='MANUAL' AND EXISTS(SELECT 1 FROM approved
  JOIN lms_matriculas m ON m.empresa_id=6 AND m.curso_id=approved.dest
   AND m.funcionario_id=approved.employee_id AND m.observacoes=${marker}
  WHERE approved.credit=1 AND qualificacoes_historico.lms_matricula_id=m.id)`;
 const audit=`${cohort} INSERT INTO audit_logs(user_id,action,entity_type,entity_id,
  old_values,new_values,empresa_id,created_at)
 SELECT NULL,'FDM13_HISTORICAL_ADMIN_TRANSFER','lms_matriculas',m.id,NULL,
  json_object('source_course',13,'source_enrollment',approved.source_id,
    'destination_course',approved.dest,'administrative_equivalence_99',approved.credit,
    'source_sha','${sha}','scorm_status_unchanged',1),6,datetime('now')
 FROM approved JOIN lms_matriculas m ON m.empresa_id=6 AND m.curso_id=approved.dest
   AND m.funcionario_id=approved.employee_id AND m.observacoes=${marker}`;
 // Use one governed SQL file; the workflow owns Time Travel recovery and
 // the pre-approved SHA/candidate hash. No R2/SCORM/legacy-row mutations.
 const dir=mkdtempSync(join(tmpdir(),'fdm13-reviewed-'));
 try {
  const file=join(dir,'fdm13-apply.sql');
  writeFileSync(file,[insertEnroll,insertQualification,insertCycles,linkM,linkC,linkH,audit].join(';\n')+';\n',{mode:0o600});
  const r=spawnSync('npx',['wrangler','d1','execute',DB,'--env','production','--remote','--file',file,'--json'],
   {cwd:new URL('../../worker-airtrust/',import.meta.url),env:process.env,encoding:'utf8',maxBuffer:8*1024*1024});
  check(r.status===0,'GOVERNED_APPLY_FAILED_REQUIRES_RECOVERY_REVIEW');
 }finally{rmSync(dir,{recursive:true,force:true})}
 const after=snapshot();
 check(after.summary.already_transferred===21&&after.summary.candidates===0,'POST_TRANSFER_COUNT_INVALID');
 check(after.summary.source_canceled===27&&after.summary.out_of_scope===6,'SOURCE_EVIDENCE_CHANGED');
 output.mutation_executed=true;
 output.write_count=null; // Multiple D1 statements; exact affected-row count is not available here.
 output.created_enrollments=21;
 output.post_transferred=after.summary.already_transferred;
 output.post_pending=after.summary.candidates;
 output.postconditions_verified=true;
}
process.stdout.write(JSON.stringify(output,null,2)+'\n');
