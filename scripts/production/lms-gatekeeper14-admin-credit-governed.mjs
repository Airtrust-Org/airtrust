#!/usr/bin/env node
// Historical Gatekeeper #14 -> FDM Committee/Gatekeeper #73: administrative credit only.
// Mandatory approved dry-run/hash, eight release gates, Time Travel recovery and scoped D1 audit.
// Never fabricates SCORM CMI, exam results, course-package completion, certificates or email.
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildGatekeeperAdminCreditPlan, AUDIT_MARKER } from './lms-gatekeeper14-admin-credit-domain.mjs';

const MODE = process.env.GATEKEEPER_CREDIT_MODE || 'dry-run';
const SHA = String(process.env.EXPECTED_MAIN_SHA || '');
const fail = (code) => { throw new Error('GATEKEEPER_CREDIT_' + code); };
const check = (value, code) => { if (!value) fail(code); };
check(process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF === 'refs/heads/main',
  'MAIN_WORKFLOW_ONLY');
check(/^[0-9a-f]{40}$/.test(SHA) && SHA === process.env.GITHUB_SHA,
  'SHA_CHANGED');
check(['dry-run', 'apply'].includes(MODE), 'MODE_INVALID');
check(process.env.GATEKEEPER_CREDIT_CONFIRMATION === (MODE === 'apply'
  ? 'AIRTRUST_GATEKEEPER14_FDM73_ADMIN_CREDIT_APPLY'
  : 'AIRTRUST_GATEKEEPER14_FDM73_ADMIN_CREDIT_DRY_RUN'), 'CONFIRMATION_INVALID');
check(process.env.TARGET_COMPANY_ID === '6', 'TENANT_INVALID');
check(Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID),
  'D1_CREDENTIALS_MISSING');

function query(sql, label) {
  const trimmed = sql.trim();
  check(/^SELECT\b/i.test(trimmed) && !/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REPLACE|ATTACH|DETACH)\b/i.test(trimmed),
    'QUERY_NOT_READ_ONLY_' + label);
  const output = spawnSync('npx',
    ['wrangler', 'd1', 'execute', 'airtrust-db', '--env', 'production', '--remote', '--json', '--command', trimmed],
    {cwd: new URL('../../worker-airtrust/', import.meta.url), env: process.env,
      encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
  check(output.status === 0, 'D1_READ_FAILURE_' + label);
  let data;
  try { data = JSON.parse(output.stdout || '[]'); } catch { fail('D1_RESPONSE_INVALID_' + label); }
  const rows = (Array.isArray(data) ? data[0] : data)?.results;
  check(Array.isArray(rows), 'D1_ROWS_INVALID_' + label);
  return rows;
}
function snapshot() {
  const courses = query(`SELECT id,ativo,publicado,deleted_at,tipo_conteudo
    FROM lms_cursos WHERE empresa_id=6 AND id IN (14,73) ORDER BY id`, 'courses');
  check(courses.length === 2 && Number(courses[0].id) === 14 &&
    Number(courses[1].id) === 73 && Number(courses[1].ativo) === 1 &&
    Number(courses[1].publicado) === 1 && courses[1].deleted_at == null,
    'COURSE_NOT_READY');
  const source = query(`SELECT s.id source_id,s.empresa_id source_empresa_id,
     s.curso_id source_curso_id,s.funcionario_id employee_id,s.status source_status,
     s.progresso_pct source_progress,s.data_conclusao source_completed_at,
     s.deleted_at source_deleted,t.id target_id,t.empresa_id target_empresa_id,
     t.curso_id target_curso_id,t.status target_status,t.progresso_pct target_progress,
     t.data_conclusao target_completed_at,t.deleted_at target_deleted,
     CASE WHEN f.id IS NOT NULL AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1
       AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO'
       THEN 1 ELSE 0 END employee_active
   FROM lms_matriculas s
   LEFT JOIN funcionarios f ON f.id=s.funcionario_id AND f.empresa_id=s.empresa_id
   LEFT JOIN lms_matriculas t ON t.empresa_id=s.empresa_id
       AND t.funcionario_id=s.funcionario_id AND t.curso_id=73
   WHERE s.empresa_id=6 AND s.curso_id=14 AND s.id IN (23,24)
   ORDER BY s.id,t.id`, 'source_targets');
  const targetTotal = query(`SELECT COUNT(*) total FROM lms_matriculas
     WHERE empresa_id=6 AND curso_id=73 AND deleted_at IS NULL`, 'target_count');
  const cycles = query(`SELECT lc.id,lc.empresa_id,lc.matricula_id,lc.curso_id,
       lc.status,lc.progresso_pct,lc.ciclo_atual
     FROM lms_matricula_ciclos lc
     JOIN lms_matriculas t ON t.id=lc.matricula_id AND t.empresa_id=lc.empresa_id
     WHERE lc.empresa_id=6 AND t.curso_id=73
       AND lc.deleted_at IS NULL AND lc.ciclo_atual=1
     ORDER BY lc.id`, 'cycles');
  const scorm = query(`SELECT COUNT(*) total
     FROM lms_progresso_scorm p JOIN lms_matriculas t
       ON t.empresa_id=p.empresa_id AND t.id=p.matricula_id
     WHERE p.empresa_id=6 AND t.curso_id=73`, 'new_scorm');
  const qual = query(`SELECT COUNT(*) total FROM lms_matriculas t
     WHERE t.empresa_id=6 AND t.curso_id=73
       AND t.qualificacao_historico_id IS NOT NULL`, 'existing_qualification');
  return {source,cycles,options:{
    targetReady:true, targetTotal:Number(targetTotal[0]?.total),
    targetScormProgressCount:Number(scorm[0]?.total),
    targetQualificationHistoryCount:Number(qual[0]?.total),
  }};
}

const baseline = snapshot();
const plan = buildGatekeeperAdminCreditPlan(baseline.source, baseline.cycles, baseline.options);
const report = {...plan.summary,source_sha:SHA,mode:MODE,mutation_executed:false,
  postconditions_verified:false};
if (MODE === 'apply') {
  check(process.env.GATEKEEPER_CREDIT_RECOVERY_READY === 'yes', 'RECOVERY_REQUIRED');
  check(process.env.GATEKEEPER_CREDIT_EXPECTED_HASH === plan.summary.candidate_hash,
    'DRY_RUN_HASH_CHANGED');
  // Only positive safe integer IDs from the two legacy records enter the SQL file.
  const lines = [];
  for (const row of plan.rows) {
    for (const key of ['source_id','employee_id','target_id','cycle_id']) {
      check(Number.isSafeInteger(row[key]) && row[key] > 0,'INVALID_ROW_ID');
    }
    const sourceTag = AUDIT_MARKER + row.source_id;
    const note = 'Equivalencia administrativa autorizada pela Gerencia de Treinamento. ' +
      'Gatekeeper legado 14 concluido; nao e conclusao do SCORM novo. ' + sourceTag;
    const literalNote = "'" + note.replaceAll("'", "''") + "'";
    lines.push(`UPDATE lms_matriculas SET
      status='CONCLUIDO', progresso_pct=100,
      data_conclusao=datetime('now'),
      observacoes=TRIM(COALESCE(observacoes,'') || ' | ' || ${literalNote}),
      updated_at=datetime('now')
      WHERE id=${row.target_id} AND empresa_id=6 AND curso_id=73
        AND funcionario_id=${row.employee_id} AND deleted_at IS NULL
        AND status='NAO_INICIADO' AND COALESCE(progresso_pct,0)=0
        AND data_conclusao IS NULL`);
    lines.push(`UPDATE lms_matricula_ciclos SET
      status='CONCLUIDO', progresso_pct=100,
      data_conclusao=datetime('now'),
      observacoes=TRIM(COALESCE(observacoes,'') || ' | ' || ${literalNote}),
      updated_at=datetime('now')
      WHERE id=${row.cycle_id} AND empresa_id=6
        AND matricula_id=${row.target_id} AND curso_id=73
        AND ciclo_atual=1 AND deleted_at IS NULL
        AND status='NAO_INICIADO' AND COALESCE(progresso_pct,0)=0`);
    lines.push(`INSERT INTO audit_logs
      (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at)
      VALUES(NULL,'GATEKEEPER14_FDM73_ADMIN_CREDIT','lms_matriculas',${row.target_id},
      json_object('previous_status','NAO_INICIADO'),
      json_object('source_course',14,'source_enrollment',${row.source_id},
        'destination_course',73,'administrative_equivalence',1,
        'source_sha','${SHA}','scorm_completion_claimed',0,
        'certificate_issued',0),6,datetime('now'))`);
  }
  // D1 reviewed batch: no remote interactive SQL and no SCORM/qualification/certificate writes.
  const dir = mkdtempSync(join(tmpdir(), 'gatekeeper14-reviewed-'));
  try {
    const file = join(dir, 'gatekeeper14-admin-credit.sql');
    writeFileSync(file, lines.join(';\n') + ';\n', {mode:0o600});
    const execution = spawnSync('npx',
      ['wrangler','d1','execute','airtrust-db','--env','production','--remote','--file',file],
      {cwd:new URL('../../worker-airtrust/',import.meta.url),env:process.env,encoding:'utf8',
        maxBuffer:8*1024*1024});
    check(execution.status === 0,'GOVERNED_BATCH_FAILED_REQUIRE_RECOVERY_REVIEW');
  } finally { rmSync(dir,{recursive:true,force:true}); }
  const after = query(`SELECT t.id target_id,t.funcionario_id employee_id,t.status,
       t.progresso_pct,t.data_conclusao,t.observacoes,lc.status cycle_status,
       lc.progresso_pct cycle_progress
     FROM lms_matriculas t JOIN lms_matricula_ciclos lc
       ON lc.empresa_id=t.empresa_id AND lc.matricula_id=t.id
       AND lc.ciclo_atual=1 AND lc.deleted_at IS NULL
     WHERE t.empresa_id=6 AND t.curso_id=73 AND t.deleted_at IS NULL
     ORDER BY t.id`, 'post_targets');
  check(after.length === 2,'POST_TARGET_COUNT');
  for(const row of plan.rows) {
    const match = after.filter((x)=>Number(x.target_id)===row.target_id &&
      Number(x.employee_id)===row.employee_id);
    check(match.length===1 && String(match[0].status).toUpperCase()==='CONCLUIDO' &&
      String(match[0].cycle_status).toUpperCase()==='CONCLUIDO' &&
      Number(match[0].progresso_pct)===100 && Number(match[0].cycle_progress)===100 &&
      Boolean(match[0].data_conclusao) &&
      String(match[0].observacoes).includes(AUDIT_MARKER+row.source_id),
      'POST_CREDIT_MISSING');
  }
  const sourceAfter = query(`SELECT COUNT(*) total FROM lms_matriculas
       WHERE empresa_id=6 AND curso_id=14 AND id IN (23,24)
         AND deleted_at IS NULL AND status='CONCLUIDO' AND progresso_pct=100`,
    'post_legacy');
  check(Number(sourceAfter[0]?.total)===2,'LEGACY_HISTORY_CHANGED');
  const scormAfter=query(`SELECT COUNT(*) total FROM lms_progresso_scorm p
       JOIN lms_matriculas m ON m.empresa_id=p.empresa_id AND m.id=p.matricula_id
       WHERE m.empresa_id=6 AND m.curso_id=73`, 'post_scorm');
  check(Number(scormAfter[0]?.total)===0,'NEW_SCORM_STATE_DETECTED');
  const audit = query(`SELECT COUNT(*) total FROM audit_logs
       WHERE empresa_id=6 AND action='GATEKEEPER14_FDM73_ADMIN_CREDIT'
       AND entity_type='lms_matriculas' AND entity_id IN (${plan.rows.map(r=>r.target_id).join(',')})
       AND json_extract(new_values,'$.source_sha')='${SHA}'`, 'post_audit');
  check(Number(audit[0]?.total)===2,'POST_AUDIT_COUNT');
  report.mutation_executed=true;
  report.postconditions_verified=true;
  report.credited=2;
}
process.stdout.write(JSON.stringify(report,null,2)+'\n');
