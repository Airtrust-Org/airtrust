#!/usr/bin/env node
// Read-only, tenant-6, bounded audit of the 2026-10-10 erroneous cancellation event.
// NEVER prints matrícula, employee, name or email IDs. No mutation or credential output.
// Follow-up apply requires a separate governed, reviewed workflow and exact-SHA authority.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const EVENT_UTC = '2026-10-10 19:10:05';
export const TENANT = 6;
const GROUPS = Object.freeze({
  'FDM-TRIPULACAO': 11,
  'MNT_MCQ': 23,
  'MNT_MGM': 23,
  'MNT_MOM': 24,
});
const ORIGINAL_STATUS_COUNTS = Object.freeze({
  CONCLUIDO: 65,
  EM_ANDAMENTO: 1,
  NAO_INICIADO: 15,
});

function assert(condition, code) {
  if (!condition) throw new Error('COMPLIANCE_81_READONLY_' + code);
}

export function candidateHash(rows) {
  return createHash('sha256').update(rows
    .map((r) => [r.id, r.code, r.originalStatus].join(':'))
    .sort()
    .join('\n')).digest('hex');
}

export function evaluateAudit(rows, subsequentAuditCount) {
  assert(Array.isArray(rows), 'ROWS_INVALID');
  assert(rows.length === 96, 'EVENT_COUNT_NOT_96');
  assert(new Set(rows.map((r) => r.id)).size === 96, 'EVENT_IDS_NOT_UNIQUE');
  assert(subsequentAuditCount === 0, 'POST_EVENT_MUTATION_DETECTED');
  const accepted = [];
  const special = [];
  const unused = [];
  for (const r of rows) {
    assert(Number.isSafeInteger(r.id) && r.id > 0, 'MATRICULA_ID_INVALID');
    assert(r.status === 'CANCELADO', 'MAT_CURRENT_STATE_CHANGED');
    assert(r.cycleStatus === 'CANCELADO', 'CYCLE_CURRENT_STATE_CHANGED');
    assert(Number(r.cycleCount) === 1, 'CYCLE_NOT_UNIQUE');
    assert(['CONCLUIDO', 'EM_ANDAMENTO', 'NAO_INICIADO'].includes(r.originalStatus), 'ORIGINAL_STATUS_INVALID');
    if (Number(r.mandatoryApplicable) === 1) {
      assert(Object.hasOwn(GROUPS, r.code), 'MANDATORY_COURSE_UNEXPECTED');
      accepted.push(r);
    } else if (r.originalStatus === 'CONCLUIDO' && (r.code === 'FDM_GATE' || r.code === 'NR-26')) {
      special.push(r);
    } else if (r.code === 'NR-26' && r.originalStatus === 'NAO_INICIADO') {
      unused.push(r);
    } else {
      throw new Error('COMPLIANCE_81_READONLY_UNCLASSIFIED_EVENT_ROW');
    }
  }
  assert(accepted.length === 81, 'MANDATORY_NOT_81');
  assert(special.length === 5, 'HISTORICAL_REVIEW_NOT_5');
  assert(unused.length === 10, 'UNSTARTED_NOT_10');
  const perCourse = {};
  const perOriginalStatus = {};
  for (const row of accepted) {
    perCourse[row.code] = (perCourse[row.code] || 0) + 1;
    perOriginalStatus[row.originalStatus] = (perOriginalStatus[row.originalStatus] || 0) + 1;
  }
  for (const [code, n] of Object.entries(GROUPS)) {
    assert(perCourse[code] === n, 'COURSE_DISTRIBUTION_CHANGED_' + code);
  }
  for (const [status, n] of Object.entries(ORIGINAL_STATUS_COUNTS)) {
    assert(perOriginalStatus[status] === n, 'ORIGINAL_STATUS_DISTRIBUTION_CHANGED_' + status);
  }
  assert(special.filter((r) => r.code === 'FDM_GATE').length === 2, 'SPECIAL_GATE_NOT_2');
  assert(special.filter((r) => r.code === 'NR-26').length === 3, 'SPECIAL_NR26_NOT_3');
  return {
    mode: 'dry-run-only',
    source: 'D1 audit_logs, tenant 6, cancellation event 2026-10-10 19:10:05 UTC',
    event_total: rows.length,
    mandatory_restore_candidates: accepted.length,
    candidate_sha256: candidateHash(accepted),
    original_status_counts: perOriginalStatus,
    course_counts: perCourse,
    completed_awaiting_individual_review: special.length,
    not_started_without_current_requirement: unused.length,
    current_enrollments_cancelled: rows.length,
    current_cycles_cancelled: rows.length,
    subsequent_audit_events: subsequentAuditCount,
    writes_performed: false,
    email_sent: false,
    pii_emitted: false,
  };
}

const AUDIT_QUERY = [
  "WITH event AS (",
  "SELECT CAST(entity_id AS INTEGER) id, json_extract(old_values,'$.status') original_status",
  "FROM audit_logs WHERE empresa_id=6 AND action='LMS_MATRICULA_COMPLIANCE_MATRIX_REPAIR'",
  "AND entity_type='lms_matriculas' AND created_at='2026-10-10 19:10:05'",
  "), cycles AS (",
  "SELECT matricula_id, COUNT(*) cycle_count, MAX(status) cycle_status",
  "FROM lms_matricula_ciclos WHERE empresa_id=6 AND ciclo_atual=1 AND deleted_at IS NULL",
  "AND matricula_id IN (SELECT id FROM event) GROUP BY matricula_id",
  ") SELECT e.id, e.original_status, m.status, cy.cycle_count,cy.cycle_status,qt.codigo code,",
  "CASE WHEN",
  "((qt.codigo='FDM-TRIPULACAO' AND role.nome IN ('Comandante','Copiloto'))",
  "OR (qt.codigo IN ('MNT_MCQ','MNT_MGM','MNT_MOM')",
  "AND role.nome IN ('Mecânico','Auxiliar de Manutenção')))",
  "AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1",
  "AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO'",
  "AND EXISTS (SELECT 1 FROM treinamento_requisitos tr",
  "WHERE tr.empresa_id=6 AND tr.qualificacao_tipo_id=qt.id",
  "AND tr.funcao_id=f.funcao_id AND tr.obrigatoriedade='OBRIGATORIA'",
  "AND tr.ativo=1 AND tr.deleted_at IS NULL",
  "AND (tr.escopo='FUNCAO' OR (tr.escopo='SETOR_FUNCAO' AND tr.setor_id=f.setor_id)))",
  "THEN 1 ELSE 0 END mandatory_applicable",
  "FROM event e JOIN lms_matriculas m ON m.id=e.id AND m.empresa_id=6",
  "JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=6",
  "JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=6",
  "JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=6",
  "JOIN funcoes role ON role.id=f.funcao_id AND role.empresa_id=6",
  "LEFT JOIN cycles cy ON cy.matricula_id=e.id",
  "ORDER BY e.id"
].join(' ');

const LATER_AUDITS_QUERY = [
  "SELECT COUNT(*) count FROM audit_logs WHERE empresa_id=6",
  "AND entity_type='lms_matriculas' AND created_at>'2026-10-10 19:10:05'",
  "AND entity_id IN (SELECT entity_id FROM audit_logs",
  "WHERE empresa_id=6 AND action='LMS_MATRICULA_COMPLIANCE_MATRIX_REPAIR'",
  "AND entity_type='lms_matriculas' AND created_at='2026-10-10 19:10:05')"
].join(' ');

function queryD1(sql) {
  assert(/^(WITH|SELECT)\s/i.test(sql), 'NON_READ_QUERY_REJECTED');
  assert(!/\b(?:UPDATE|DELETE|INSERT|DROP|ALTER|CREATE|REPLACE|PRAGMA)\b/i.test(sql), 'UNSAFE_SQL');
  const response = spawnSync('npx', ['wrangler', 'd1', 'execute', 'airtrust-db',
    '--env', 'production', '--remote', '--json', '--command', sql],
    { cwd: resolve('worker-airtrust'), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 45000 });
  assert(response.status === 0, 'READ_FAILED');
  const parsed = JSON.parse(response.stdout);
  assert(Array.isArray(parsed) && parsed[0]?.success === true, 'D1_RESPONSE_INVALID');
  return parsed[0].results;
}

async function main() {
  assert(process.argv[2] === 'dry-run', 'ONLY_DRY_RUN_ALLOWED');
  assert(process.env.TRAINING_COMPLIANCE_81_DRY_RUN_CONFIRM === 'AIRTRUST_TENANT6_COMPLIANCE_81_READONLY',
    'EXPLICIT_READ_CONFIRM_REQUIRED');
  const rows = queryD1(AUDIT_QUERY).map((r) => ({
    id: Number(r.id),
    originalStatus: r.original_status,
    status: r.status,
    cycleCount: Number(r.cycle_count),
    cycleStatus: r.cycle_status,
    code: r.code,
    mandatoryApplicable: Number(r.mandatory_applicable),
  }));
  const later = Number(queryD1(LATER_AUDITS_QUERY)[0]?.count);
  assert(Number.isSafeInteger(later) && later >= 0, 'LATER_COUNT_INVALID');
  const report = evaluateAudit(rows, later);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    // No raw Wrangler output or IDs are included in errors.
    console.error(err instanceof Error ? err.message : 'COMPLIANCE_81_READONLY_ERROR');
    process.exitCode = 1;
  });
}
