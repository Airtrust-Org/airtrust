#!/usr/bin/env node
/** Read-only production D1 proof inventory. Never emits individual learner data. */
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const COMPANY=6;
const TARGET_DB='airtrust-db';
const CONFIRM='AIRTRUST_PRODUCTION_LMS_SCORM99_PROOF_READONLY';
const fail=(valid,code)=>{if(!valid) throw new Error(code);};

// Static SQL, no external input interpolation. Includes inactive historical
// employees in FDM13, unlike the LMS /matriculas/curso API.
export const PROOF_SQL=String.raw`
WITH base AS (
 SELECT m.curso_id,
 CASE WHEN m.curso_id<>13 THEN 'other_course'
      WHEN UPPER(TRIM(COALESCE(NULLIF(TRIM(fn.nome),''),NULLIF(TRIM(f.funcao),''),NULLIF(TRIM(f.cargo),''),''))) IN ('COMANDANTE','COPILOTO') THEN 'tripulacao'
      WHEN UPPER(TRIM(COALESCE(NULLIF(TRIM(fn.nome),''),NULLIF(TRIM(f.funcao),''),NULLIF(TRIM(f.cargo),''),''))) IN ('MECANICO','MECÂNICO','MECâNICO',
        'AUXILIAR DE MANUTENCAO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENçãO',
        'AUX MANUTENCAO','AUX MANUTENÇÃO') THEN 'manutencao'
      ELSE 'excluded_or_unknown' END audience,
 CASE WHEN f.id IS NOT NULL AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1
       AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO'
      THEN 1 ELSE 0 END employee_active,
 UPPER(TRIM(COALESCE(m.status,''))) matricula_status,
 COALESCE(m.progresso_pct,0) raw_pct,
 CASE WHEN ps.matricula_id IS NOT NULL THEN 1 ELSE 0 END has_scorm,
 LOWER(TRIM(COALESCE(ps.lesson_status,''))) lesson_status,
 LOWER(TRIM(COALESCE(ps.completion_status,''))) completion_status,
 LOWER(TRIM(COALESCE(ps.success_status,''))) success_status,
 CASE WHEN ps.score_scaled IS NOT NULL THEN ps.score_scaled*100.0
      WHEN ps.score_raw IS NOT NULL AND ps.score_max>0 THEN ps.score_raw*100.0/ps.score_max
      ELSE ps.score_raw END score_pct,
 NULLIF(c.scorm_mastery_score,0) mastery,
 CASE WHEN ps.last_commit_at IS NOT NULL THEN 1 ELSE 0 END committed
 FROM lms_matriculas m
 JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
 LEFT JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=m.empresa_id
 LEFT JOIN funcoes fn ON fn.id=f.funcao_id AND fn.empresa_id=m.empresa_id
 LEFT JOIN lms_progresso_scorm ps ON ps.matricula_id=m.id AND ps.empresa_id=m.empresa_id
 WHERE m.empresa_id=6 AND m.deleted_at IS NULL
  AND UPPER(TRIM(COALESCE(m.status,'')))!='CANCELADO'
  AND (m.curso_id=13 OR COALESCE(m.progresso_pct,0)>=99)
), flagged AS (
 SELECT *,
 CASE WHEN lesson_status IN ('passed','completed') OR
  (completion_status='completed' AND success_status IN ('','passed','unknown'))
  THEN 1 ELSE 0 END explicit_complete,
 CASE WHEN lesson_status='failed' OR success_status='failed'
  THEN 1 ELSE 0 END explicit_failed,
 CASE WHEN mastery IS NULL OR (score_pct IS NOT NULL AND score_pct>=mastery)
  THEN 1 ELSE 0 END mastery_met
 FROM base
)
SELECT curso_id,audience,COUNT(*) enrolled,
 SUM(employee_active) employee_active_enrollments,
 SUM(CASE WHEN matricula_status='CONCLUIDO' THEN 1 ELSE 0 END) concluded,
 SUM(CASE WHEN matricula_status!='CONCLUIDO' AND raw_pct>=99 THEN 1 ELSE 0 END) incomplete_99,
 SUM(CASE WHEN matricula_status!='CONCLUIDO' AND raw_pct>=100 THEN 1 ELSE 0 END) incomplete_raw100,
 SUM(CASE WHEN matricula_status!='CONCLUIDO' AND raw_pct>=99 AND has_scorm=0 THEN 1 ELSE 0 END) no_runtime,
 SUM(CASE WHEN matricula_status!='CONCLUIDO' AND raw_pct>=99 AND has_scorm=1 THEN 1 ELSE 0 END) has_runtime,
 SUM(CASE WHEN matricula_status!='CONCLUIDO' AND raw_pct>=99 AND explicit_complete=1 THEN 1 ELSE 0 END) explicit_but_pending,
 SUM(CASE WHEN matricula_status!='CONCLUIDO' AND raw_pct>=99 AND explicit_complete=0 AND explicit_failed=1 THEN 1 ELSE 0 END) failed,
 SUM(CASE WHEN matricula_status!='CONCLUIDO' AND raw_pct>=99 AND explicit_complete=0 AND explicit_failed=0 AND mastery_met=1 THEN 1 ELSE 0 END) mastery_met_missing_final,
 SUM(CASE WHEN matricula_status!='CONCLUIDO' AND raw_pct>=99 AND explicit_complete=0 AND explicit_failed=0 AND mastery_met=0 THEN 1 ELSE 0 END) mastery_unproven,
 SUM(CASE WHEN matricula_status!='CONCLUIDO' AND raw_pct>=99 AND committed=0 THEN 1 ELSE 0 END) no_commit,
 SUM(CASE WHEN matricula_status!='CONCLUIDO' AND raw_pct>=99 AND employee_active=0 THEN 1 ELSE 0 END) inactive_employee_99
FROM flagged GROUP BY curso_id,audience ORDER BY curso_id,audience`;


// Independent historical FDM cohort audit: includes soft-deleted/cancelled
// enrollments from the legacy course and all three destinations. No IDs or PII.
export const FDM_HISTORY_SQL=String.raw`
WITH h AS (
 SELECT m.curso_id,
  CASE WHEN m.curso_id!=13 THEN 'destination'
   WHEN UPPER(TRIM(COALESCE(NULLIF(TRIM(fn.nome),''),NULLIF(TRIM(f.funcao),''),NULLIF(TRIM(f.cargo),''),''))) IN ('COMANDANTE','COPILOTO') THEN 'tripulacao'
   WHEN UPPER(TRIM(COALESCE(NULLIF(TRIM(fn.nome),''),NULLIF(TRIM(f.funcao),''),NULLIF(TRIM(f.cargo),''),''))) IN
    ('MECANICO','MECÂNICO','MECâNICO','AUXILIAR DE MANUTENCAO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENçãO','AUX MANUTENCAO','AUX MANUTENÇÃO','AUX MANUTENçãO')
    THEN 'manutencao'
   ELSE 'excluded_or_unknown' END audience,
  CASE WHEN m.deleted_at IS NOT NULL THEN 1 ELSE 0 END soft_deleted,
  UPPER(TRIM(COALESCE(m.status,''))) status,
  COALESCE(m.progresso_pct,0) pct,
  CASE WHEN f.id IS NULL OR f.deleted_at IS NOT NULL OR COALESCE(f.ativo,1)<>1
   OR UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))!='ATIVO'
   THEN 1 ELSE 0 END employee_inactive_or_missing,
  LOWER(TRIM(COALESCE(ps.lesson_status,''))) lesson_status,
  LOWER(TRIM(COALESCE(ps.completion_status,''))) completion_status,
  LOWER(TRIM(COALESCE(ps.success_status,''))) success_status
 FROM lms_matriculas m
 LEFT JOIN funcionarios f ON f.empresa_id=m.empresa_id AND f.id=m.funcionario_id
 LEFT JOIN funcoes fn ON fn.id=f.funcao_id AND fn.empresa_id=m.empresa_id
 LEFT JOIN lms_progresso_scorm ps ON ps.matricula_id=m.id AND ps.empresa_id=m.empresa_id
 WHERE m.empresa_id=6 AND m.curso_id IN (13,71,72,73)
)
SELECT curso_id,audience,COUNT(*) history_rows,
 SUM(CASE WHEN soft_deleted=0 AND status!='CANCELADO' THEN 1 ELSE 0 END) non_cancelled,
 SUM(CASE WHEN soft_deleted=1 OR status='CANCELADO' THEN 1 ELSE 0 END) cancelled_or_soft_deleted,
 SUM(soft_deleted) soft_deleted,
 SUM(CASE WHEN status='CANCELADO' THEN 1 ELSE 0 END) cancelled_status,
 SUM(CASE WHEN status='CONCLUIDO' THEN 1 ELSE 0 END) concluded_status_any,
 SUM(CASE WHEN pct>=99 THEN 1 ELSE 0 END) raw_99_any,
 SUM(CASE WHEN pct>=100 THEN 1 ELSE 0 END) raw_100_any,
 SUM(CASE WHEN pct>=99 AND (lesson_status IN ('passed','completed')
    OR (completion_status='completed' AND success_status IN ('','passed','unknown')))
    THEN 1 ELSE 0 END) raw_99_with_explicit_scorm_end,
 SUM(employee_inactive_or_missing) inactive_or_missing_employee
FROM h GROUP BY curso_id,audience ORDER BY curso_id,audience`;


// Third independent SELECT: exact visible cancellation cohort from FDM13.
// 27 current non-soft-deleted CANCELADO rows (11/10/6 in prior governed run).
// This is NOT a write plan: employee identifiers never leave D1.
export const FDM_REENROLLMENT_SQL=String.raw`
WITH source AS (
 SELECT m.funcionario_id, m.progresso_pct, m.status,
  CASE
   WHEN UPPER(TRIM(COALESCE(NULLIF(TRIM(fn.nome),''),NULLIF(TRIM(f.funcao),''),NULLIF(TRIM(f.cargo),''),''))) IN ('COMANDANTE','COPILOTO') THEN 'tripulacao'
   WHEN UPPER(TRIM(COALESCE(NULLIF(TRIM(fn.nome),''),NULLIF(TRIM(f.funcao),''),NULLIF(TRIM(f.cargo),''),''))) IN
    ('MECANICO','MECÂNICO','MECâNICO','AUXILIAR DE MANUTENCAO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENçãO','AUX MANUTENCAO','AUX MANUTENÇÃO','AUX MANUTENçãO')
    THEN 'manutencao' ELSE 'excluded' END audience,
  CASE WHEN f.id IS NOT NULL AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1
    AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO' THEN 1 ELSE 0 END employee_active,
  COUNT(*) OVER (PARTITION BY m.funcionario_id) same_employee_rows,
  LOWER(TRIM(COALESCE(ps.lesson_status,''))) lesson_status,
  LOWER(TRIM(COALESCE(ps.completion_status,''))) completion_status,
  LOWER(TRIM(COALESCE(ps.success_status,''))) success_status,
  CASE WHEN ps.score_scaled BETWEEN 0 AND 1 THEN ps.score_scaled*100.0
   WHEN ps.score_scaled BETWEEN 1 AND 100 THEN ps.score_scaled
   WHEN ps.score_raw IS NOT NULL AND ps.score_max>0 THEN ps.score_raw*100.0/ps.score_max
   ELSE ps.score_raw END score_pct,
  CASE WHEN ps.matricula_id IS NOT NULL THEN 1 ELSE 0 END has_scorm,
  CASE WHEN ps.last_commit_at IS NOT NULL THEN 1 ELSE 0 END committed,
  NULLIF(c.scorm_mastery_score,0) legacy_mastery
 FROM lms_matriculas m
 JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
 LEFT JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=m.empresa_id
 LEFT JOIN funcoes fn ON fn.id=f.funcao_id AND fn.empresa_id=m.empresa_id
 LEFT JOIN lms_progresso_scorm ps ON ps.matricula_id=m.id AND ps.empresa_id=m.empresa_id
 WHERE m.empresa_id=6 AND m.curso_id=13 AND m.deleted_at IS NULL
  AND UPPER(TRIM(COALESCE(m.status,'')))='CANCELADO'
), assessed AS (
 SELECT *,
  CASE WHEN audience='tripulacao' THEN 71 WHEN audience='manutencao' THEN 72 ELSE NULL END destination,
  CASE WHEN lesson_status IN ('passed','completed')
   OR (completion_status='completed' AND success_status IN ('','passed','unknown'))
   THEN 1 ELSE 0 END explicit_end,
  CASE WHEN lesson_status='failed' OR success_status='failed' THEN 1 ELSE 0 END explicit_failure
 FROM source
), joined AS (
 SELECT *,
  CASE WHEN destination IS NOT NULL AND EXISTS (
    SELECT 1 FROM lms_matriculas target
     WHERE target.empresa_id=6 AND target.funcionario_id=assessed.funcionario_id
      AND target.curso_id=assessed.destination
      AND target.deleted_at IS NULL AND UPPER(TRIM(COALESCE(target.status,'')))!='CANCELADO'
   ) THEN 1 ELSE 0 END destination_active,
  CASE WHEN destination IS NOT NULL AND EXISTS (
    SELECT 1 FROM lms_matriculas target
     WHERE target.empresa_id=6 AND target.funcionario_id=assessed.funcionario_id
      AND target.curso_id=assessed.destination
   ) THEN 1 ELSE 0 END destination_historical,
  CASE WHEN destination IS NOT NULL AND EXISTS (
    SELECT 1 FROM lms_cursos target
    JOIN qualificacoes_tipos qt ON qt.id=target.qualificacao_tipo_id AND qt.empresa_id=target.empresa_id
    WHERE target.id=assessed.destination AND target.empresa_id=6 AND target.ativo=1
      AND target.publicado=1 AND target.deleted_at IS NULL AND qt.deleted_at IS NULL
      AND qt.codigo=CASE WHEN assessed.destination=71 THEN 'FDM-TRIPULACAO'
       WHEN assessed.destination=72 THEN 'FDM-MECANICO' ELSE '' END
   ) THEN 1 ELSE 0 END valid_model_link
 FROM assessed
)
SELECT audience,
 COUNT(*) source_canceled_rows,
 COUNT(DISTINCT funcionario_id) unique_staff,
 SUM(employee_active) active_staff_rows,
 SUM(CASE WHEN employee_active=0 THEN 1 ELSE 0 END) inactive_staff_rows,
 SUM(CASE WHEN same_employee_rows>1 THEN 1 ELSE 0 END) duplicate_source_rows,
 SUM(destination_active) already_active_at_target,
 SUM(destination_historical) any_target_history,
 SUM(valid_model_link) linked_target_rows,
 SUM(CASE WHEN COALESCE(progresso_pct,0)>=99 THEN 1 ELSE 0 END) legacy_raw99,
 SUM(CASE WHEN COALESCE(progresso_pct,0)<99 THEN 1 ELSE 0 END) legacy_below100,
 SUM(CASE WHEN COALESCE(progresso_pct,0)>=99 AND explicit_end=1 THEN 1 ELSE 0 END) raw99_explicit_end,
 SUM(CASE WHEN COALESCE(progresso_pct,0)>=99 AND explicit_end=0 THEN 1 ELSE 0 END) raw99_no_explicit_end,
 SUM(CASE WHEN COALESCE(progresso_pct,0)>=99 AND explicit_failure=1 THEN 1 ELSE 0 END) raw99_explicit_failure,
 SUM(CASE WHEN COALESCE(progresso_pct,0)>=99 AND has_scorm=0 THEN 1 ELSE 0 END) raw99_no_scorm,
 SUM(CASE WHEN COALESCE(progresso_pct,0)>=99 AND committed=0 THEN 1 ELSE 0 END) raw99_no_commit,
 SUM(CASE WHEN COALESCE(progresso_pct,0)>=99 AND explicit_end=1 AND legacy_mastery IS NOT NULL AND score_pct>=legacy_mastery THEN 1 ELSE 0 END) raw99_explicit_mastery_met,
 SUM(CASE WHEN COALESCE(progresso_pct,0)>=99 AND explicit_end=1 AND legacy_mastery IS NOT NULL AND (score_pct IS NULL OR score_pct<legacy_mastery) THEN 1 ELSE 0 END) raw99_explicit_mastery_unproven,
 SUM(CASE WHEN COALESCE(progresso_pct,0)>=99 AND explicit_end=1 AND legacy_mastery IS NULL THEN 1 ELSE 0 END) raw99_explicit_no_mastery_requirement
FROM joined GROUP BY audience ORDER BY audience`;

export function validateReenrollment(rows){
 fail(Array.isArray(rows)&&rows.length<=3,'FDM_REENROLLMENT_GROUPS_INVALID');
 const keys=['source_canceled_rows','unique_staff','active_staff_rows','inactive_staff_rows','duplicate_source_rows',
 'already_active_at_target','any_target_history','linked_target_rows','legacy_raw99','legacy_below100',
 'raw99_explicit_end','raw99_no_explicit_end','raw99_explicit_failure','raw99_no_scorm',
 'raw99_no_commit','raw99_explicit_mastery_met','raw99_explicit_mastery_unproven',
 'raw99_explicit_no_mastery_requirement'];
 const seen=new Set();
 for(const row of rows){
  fail(['tripulacao','manutencao','excluded'].includes(row.audience),'FDM_REENROLLMENT_GROUP_INVALID');
  fail(!seen.has(row.audience),'FDM_REENROLLMENT_DUPLICATE_GROUP');seen.add(row.audience);
  for(const k of keys)fail(Number.isInteger(row[k])&&row[k]>=0&&row[k]<=row.source_canceled_rows,'FDM_REENROLLMENT_COUNT_INVALID_'+k);
  fail(row.active_staff_rows+row.inactive_staff_rows===row.source_canceled_rows,'FDM_REENROLLMENT_STAFF_PARTITION');
  fail(row.legacy_raw99+row.legacy_below100===row.source_canceled_rows,'FDM_REENROLLMENT_PROGRESS_PARTITION');
  fail(row.raw99_explicit_end+row.raw99_no_explicit_end===row.legacy_raw99,'FDM_REENROLLMENT_COMPLETION_PARTITION');
  fail(row.raw99_explicit_mastery_met+row.raw99_explicit_mastery_unproven+
   row.raw99_explicit_no_mastery_requirement===row.raw99_explicit_end,'FDM_REENROLLMENT_MASTERY_PARTITION');
 }
 return rows;
}

export function validateHistory(rows) {
 fail(Array.isArray(rows)&&rows.length<=16,'FDM_HISTORY_GROUPS_INVALID');
 const seen=new Set();
 const keys=['history_rows','non_cancelled','cancelled_or_soft_deleted','soft_deleted',
 'cancelled_status','concluded_status_any','raw_99_any','raw_100_any',
 'raw_99_with_explicit_scorm_end','inactive_or_missing_employee'];
 for(const r of rows) {
  fail([13,71,72,73].includes(r.curso_id),'FDM_HISTORY_COURSE_INVALID');
  fail(r.curso_id===13
   ? ['tripulacao','manutencao','excluded_or_unknown'].includes(r.audience)
   : r.audience==='destination','FDM_HISTORY_AUDIENCE_INVALID');
  const key=r.curso_id+':'+r.audience;
  fail(!seen.has(key),'FDM_HISTORY_GROUP_DUPLICATE');seen.add(key);
  for(const field of keys)fail(Number.isInteger(r[field])&&r[field]>=0&&r[field]<=r.history_rows,'FDM_HISTORY_COUNT_INVALID_'+field);
  fail(r.non_cancelled+r.cancelled_or_soft_deleted===r.history_rows,'FDM_HISTORY_PARTITION_INVALID');
  fail(r.raw_100_any<=r.raw_99_any,'FDM_HISTORY_PROGRESS_INVALID');
  fail(r.raw_99_with_explicit_scorm_end<=r.raw_99_any,'FDM_HISTORY_SCORM_INVALID');
 }
 return rows;
}

export function validate(rows){
 fail(Array.isArray(rows)&&rows.length<=300,'PROOF_ROWS_INVALID');
 const keys=['enrolled','employee_active_enrollments','concluded','incomplete_99','incomplete_raw100',
 'no_runtime','has_runtime','explicit_but_pending','failed','mastery_met_missing_final',
 'mastery_unproven','no_commit','inactive_employee_99'];
 const seen=new Set();
 for(const row of rows){
  fail(Number.isInteger(row.curso_id)&&row.curso_id>0,'COURSE_ID_INVALID');
  fail(['tripulacao','manutencao','excluded_or_unknown','other_course'].includes(row.audience),'AUDIENCE_INVALID');
  fail(row.curso_id===13||row.audience==='other_course','AUDIENCE_COURSE_MISMATCH');
  const pair=row.curso_id+':'+row.audience;
  fail(!seen.has(pair),'GROUP_DUPLICATE');seen.add(pair);
  for(const k of keys)fail(Number.isInteger(row[k])&&row[k]>=0&&row[k]<=row.enrolled,'COUNT_INVALID_'+k);
  fail(row.incomplete_raw100<=row.incomplete_99,'RAW100_INVALID');
  fail(row.no_runtime+row.has_runtime===row.incomplete_99,'RUNTIME_COUNTS_INVALID');
  fail(row.explicit_but_pending+row.failed+row.mastery_met_missing_final+row.mastery_unproven===row.incomplete_99,'STATUS_PARTITION_INVALID');
  fail(row.concluded+row.incomplete_99<=row.enrolled,'TOTAL_INVALID');
 }
 return rows;
}
export function summarize(rows){
 const totals={enrolled:0,incomplete_99:0,incomplete_raw100:0,explicit_but_pending:0,mastery_met_missing_final:0,mastery_unproven:0};
 for(const row of rows)for(const key of Object.keys(totals))totals[key]+=row[key];
 return {totals,fdm13:rows.filter(r=>r.curso_id===13)};
}
function executeStaticSelect(sql, label){
 fail(/^\s*WITH\s/i.test(sql),'QUERY_MUST_BE_SELECT_'+label);
 fail(!/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA|REPLACE|VACUUM)\s/i.test(sql),'QUERY_MUTATION_FORBIDDEN_'+label);
 fail(!sql.includes(';'),'MULTI_STATEMENT_FORBIDDEN_'+label);
 const r=spawnSync('npx',['wrangler','d1','execute',TARGET_DB,'--env','production','--remote','--json','--command',sql],
 {cwd:new URL('../../worker-airtrust/',import.meta.url),encoding:'utf8',maxBuffer:8*1024*1024,env:process.env});
 fail(r.status===0,'D1_SELECT_FAILED_'+label);
 const json=JSON.parse(r.stdout||'[]');
 const result=Array.isArray(json)?json[0]:json;
 fail(Array.isArray(result?.results),'D1_RESULTS_INVALID_'+label);
 return result.results;
}
async function main(){
 fail(process.env.CONFIRMATION===CONFIRM,'CONFIRMATION_REQUIRED');
 const sha=String(process.env.EXPECTED_MAIN_SHA||'').toLowerCase();
 fail(/^[0-9a-f]{40}$/.test(sha),'MAIN_SHA_INVALID');
 fail(process.env.GITHUB_SHA?.toLowerCase()===sha,'EXACT_SHA_REQUIRED');
 fail(process.env.TARGET_COMPANY_ID==='6','TENANT_REJECTED');
 const rows=validate(executeStaticSelect(PROOF_SQL,'SCORM99'));
 const history=validateHistory(executeStaticSelect(FDM_HISTORY_SQL,'FDM_HISTORY'));
 const cohort=validateReenrollment(executeStaticSelect(FDM_REENROLLMENT_SQL,'FDM_REENROLLMENT'));
 const data={schema_version:3,tenant:COMPANY,source_sha:sha,mode:'read-only',writes:0,contains_personal_data:false,
 population:'All non-cancelled FDM13 enrollments including inactive employees; other courses raw progress >=99',
 ...summarize(rows),by_course_and_audience:rows,fdm_legacy_and_destination_history:history,
 fdm_reenrollment_preflight:cohort,reenrollment_writes:0,administrative_completions_issued:0};
 process.stdout.write(JSON.stringify(data,null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('SCORM99_PROOF_FAILED:'+String(e?.message||e).slice(0,120));process.exitCode=1;});
