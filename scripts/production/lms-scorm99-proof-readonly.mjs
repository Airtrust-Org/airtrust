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
function readD1(){
 fail(/^\s*WITH\s/i.test(PROOF_SQL),'QUERY_MUST_BE_SELECT');
 fail(!/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA|REPLACE|VACUUM)\s/i.test(PROOF_SQL),'QUERY_MUTATION_FORBIDDEN');
 fail(!PROOF_SQL.includes(';'),'MULTI_STATEMENT_FORBIDDEN');
 const r=spawnSync('npx',['wrangler','d1','execute',TARGET_DB,'--env','production','--remote','--json','--command',PROOF_SQL],
 {cwd:new URL('../../worker-airtrust/',import.meta.url),encoding:'utf8',maxBuffer:8*1024*1024,env:process.env});
 fail(r.status===0,'D1_PROOF_READ_FAILED');
 const json=JSON.parse(r.stdout||'[]');
 const result=Array.isArray(json)?json[0]:json;
 return validate(result?.results);
}
async function main(){
 fail(process.env.CONFIRMATION===CONFIRM,'CONFIRMATION_REQUIRED');
 const sha=String(process.env.EXPECTED_MAIN_SHA||'').toLowerCase();
 fail(/^[0-9a-f]{40}$/.test(sha),'MAIN_SHA_INVALID');
 fail(process.env.GITHUB_SHA?.toLowerCase()===sha,'EXACT_SHA_REQUIRED');
 fail(process.env.TARGET_COMPANY_ID==='6','TENANT_REJECTED');
 const rows=readD1();
 const data={schema_version:1,tenant:COMPANY,source_sha:sha,mode:'read-only',writes:0,contains_personal_data:false,
 population:'All non-cancelled FDM13 enrollments including inactive employees; other courses raw progress >=99',
 ...summarize(rows),by_course_and_audience:rows};
 process.stdout.write(JSON.stringify(data,null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('SCORM99_PROOF_FAILED:'+String(e?.message||e).slice(0,120));process.exitCode=1;});
