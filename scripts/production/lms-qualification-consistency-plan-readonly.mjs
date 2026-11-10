#!/usr/bin/env node
// source_reference: issue #1492, tenant-6 LMS enrollment / cycle / qualification-history consistency.
// operational_decision: classify the four known inconsistent groups and print a per-case proposed
//   treatment. Opaque ids and aggregates only; never names, CPF, e-mail, CMI or suspend_data.
// dry_run_required: this tool IS the dry run. It has NO apply mode and issues SELECT statements only.
// rollback_plan_required: not applicable (no writes). Any future repair needs a separately reviewed,
//   governed apply workflow with D1 Time Travel, the Training Manager decision recorded in the issue,
//   and exact-SHA authorization.
import { spawnSync } from 'node:child_process';

const EMPRESA_ID = 6;
const must = (ok, code) => {
  if (!ok) throw new Error('LMS_CONSISTENCY_PLAN_' + code);
};

export const GROUP_QUERIES = {
  // (1) CONCLUIDO enrollment whose current cycle is not CONCLUIDO.
  completed_cycle_open: `SELECT m.id, m.curso_id, m.qualificacao_historico_id AS historico_id,
      c.id AS cycle_id, c.status AS cycle_status, h.status AS historico_status,
      h.deleted_at IS NOT NULL AS historico_deleted, h.lms_matricula_ciclo_id AS historico_cycle_id,
      (SELECT COUNT(*) FROM lms_progresso_scorm s WHERE s.empresa_id=m.empresa_id AND s.matricula_id=m.id
        AND LOWER(COALESCE(s.lesson_status,'')) IN ('passed','completed')) AS scorm_passed
    FROM lms_matriculas m
    JOIN lms_matricula_ciclos c ON c.matricula_id=m.id AND c.empresa_id=m.empresa_id
      AND c.ciclo_atual=1 AND c.deleted_at IS NULL
    LEFT JOIN qualificacoes_historico h ON h.id=m.qualificacao_historico_id
    WHERE m.empresa_id=${EMPRESA_ID} AND m.deleted_at IS NULL AND UPPER(m.status)='CONCLUIDO'
      AND UPPER(COALESCE(c.status,''))<>'CONCLUIDO' ORDER BY m.id`,
  // (2) CONCLUIDO enrollment pointing to a soft-deleted history.
  pointer_to_deleted_history: `SELECT m.id, m.curso_id, m.qualificacao_historico_id AS historico_id,
      (SELECT COUNT(*) FROM qualificacoes_historico x WHERE x.empresa_id=m.empresa_id
         AND x.funcionario_id=m.funcionario_id AND x.qualificacao_id=h.qualificacao_id
         AND x.deleted_at IS NULL AND x.status IN ('CONCLUIDA','RENOVADA')) AS other_live_history
    FROM lms_matriculas m JOIN qualificacoes_historico h ON h.id=m.qualificacao_historico_id
    WHERE m.empresa_id=${EMPRESA_ID} AND m.deleted_at IS NULL AND UPPER(m.status)='CONCLUIDO'
      AND h.deleted_at IS NOT NULL ORDER BY m.id`,
  // (3) CANCELADO enrollment that still has a live CONCLUIDA/RENOVADA history linked.
  cancelled_with_live_history: `SELECT m.id, m.curso_id, h.id AS historico_id, h.status AS historico_status,
      h.data_vencimento IS NOT NULL AS has_expiry,
      (SELECT COUNT(*) FROM lms_matriculas m2 WHERE m2.empresa_id=m.empresa_id AND m2.funcionario_id=m.funcionario_id
         AND m2.curso_id=m.curso_id AND m2.id<>m.id AND m2.deleted_at IS NULL
         AND UPPER(m2.status)<>'CANCELADO') AS replacement_enrollments,
      (SELECT json_extract(a.old_values,'$.status') FROM audit_logs a WHERE a.entity_type='lms_matriculas'
         AND a.entity_id=m.id AND a.action='LMS_MATRICULA_COMPLIANCE_MATRIX_REPAIR' ORDER BY a.id DESC LIMIT 1) AS status_before_repair
    FROM lms_matriculas m JOIN qualificacoes_historico h ON h.lms_matricula_id=m.id AND h.deleted_at IS NULL
      AND h.status IN ('CONCLUIDA','RENOVADA')
    WHERE m.empresa_id=${EMPRESA_ID} AND UPPER(m.status)='CANCELADO' ORDER BY m.id`,
  // (4) CONCLUIDO enrollment with no history; separate courses that never generate qualification.
  completed_without_history: `SELECT m.id, m.curso_id, c.gerar_qualificacao_ao_concluir AS course_generates_qualification,
      c.qualificacao_tipo_id IS NOT NULL AS course_has_type
    FROM lms_matriculas m JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
    WHERE m.empresa_id=${EMPRESA_ID} AND m.deleted_at IS NULL AND UPPER(m.status)='CONCLUIDO'
      AND m.qualificacao_historico_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM qualificacoes_historico h WHERE h.empresa_id=m.empresa_id
        AND h.lms_matricula_id=m.id AND h.deleted_at IS NULL) ORDER BY m.id`,
};

/** Pure classifier: maps one row of a group to the proposed treatment. No side effects. */
export function classifyCase(group, row) {
  if (group === 'completed_cycle_open') {
    const hist = row.historico_id && !Number(row.historico_deleted);
    return {
      state: 'matricula CONCLUIDO; ciclo atual ' + String(row.cycle_status),
      evidence: `historico vivo=${hist ? 'sim' : 'nao'}; scorm aprovado=${Number(row.scorm_passed) > 0 ? 'sim' : 'nao'}`,
      proposed:
        hist && Number(row.scorm_passed) > 0
          ? 'RATIFICAR: alinhar ciclo atual a CONCLUIDO (data_conclusao, qualificacao_historico_id) e religar lms_matricula_ciclo_id do historico, em lote atomico'
          : 'REVISAO MANUAL: conclusao sem historico vivo ou sem SCORM aprovado',
      alternative: 'REVERTER conclusao administrativa pelo fluxo governado de reversao (mantem progresso/SCORM) se o gestor nao ratificar',
      risk: 'medio: a conclusao de 27/06 foi administrativa (sem audit_logs); ratificar equivale a aceitar a evidencia',
      needs_training_manager: true,
    };
  }
  if (group === 'pointer_to_deleted_history') {
    return {
      state: 'matricula CONCLUIDO apontando para historico excluido',
      evidence: `outro historico vivo do mesmo tipo=${Number(row.other_live_history) > 0 ? 'sim' : 'nao'}`,
      proposed:
        'OPCAO A (padrao #1920): limpar qualificacao_historico_id na matricula e no ciclo; matricula segue CONCLUIDO sem qualificacao nova',
      alternative:
        'OPCAO B: se foi conclusao de teste, reverter a matricula pelo fluxo governado; nunca recriar o historico excluido',
      risk: 'baixo (A) / medio (B)',
      needs_training_manager: true,
    };
  }
  if (group === 'cancelled_with_live_history') {
    return {
      state: 'matricula CANCELADO com historico vivo ' + String(row.historico_status),
      evidence: `status antes do reparo=${String(row.status_before_repair ?? 'desconhecido')}; matricula substituta ativa=${Number(row.replacement_enrollments) > 0 ? 'sim' : 'nao'}`,
      proposed:
        'RESTAURAR matricula e ciclo ao status anterior (CONCLUIDO) pelo workflow governado de restauracao; historico, SCORM e xAPI nao mudam',
      alternative: 'MANTER cancelada se o gestor decidir que a matricula nao integra a matriz; o historico continua valido',
      risk: 'baixo: cancelamento foi logico (audit_logs) e o historico nunca foi alterado',
      needs_training_manager: true,
    };
  }
  if (group === 'completed_without_history') {
    const legacy = Number(row.course_generates_qualification) === 0 && !Number(row.course_has_type);
    return {
      state: 'matricula CONCLUIDO sem historico',
      evidence: legacy
        ? 'curso nao gera qualificacao e nao tem tipo: sem historico por desenho'
        : 'curso gera qualificacao mas nao ha historico',
      proposed: legacy
        ? 'NENHUMA ACAO: nao criar evidencia inexistente; registrar como conclusao legada sem efeito em Compliance'
        : 'REVISAO MANUAL: nunca fabricar historico por ausencia',
      alternative: null,
      risk: 'nenhum (legado) / alto (se criar historico sem evidencia)',
      needs_training_manager: !legacy,
    };
  }
  throw new Error('LMS_CONSISTENCY_PLAN_UNKNOWN_GROUP');
}

function d1Select(sql, label) {
  must(
    /^\s*SELECT\b/i.test(sql) && !/;|\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|ATTACH|DETACH|PRAGMA|VACUUM)\b/i.test(sql),
    'READONLY_SQL_' + label,
  );
  const r = spawnSync(
    'npx',
    ['--no-install', 'wrangler', 'd1', 'execute', 'airtrust-db', '--env', 'production', '--remote', '--json', '--command', sql],
    { cwd: new URL('../../worker-airtrust/', import.meta.url), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 120_000 },
  );
  must(r.status === 0, 'D1_SELECT_FAILED_' + label);
  const parsed = JSON.parse(r.stdout);
  const rows = (Array.isArray(parsed) ? parsed[0] : parsed)?.results;
  must(Array.isArray(rows), 'D1_ROWS_' + label);
  return rows;
}

export function buildPlan(rowsByGroup) {
  const plan = { schema_version: 1, tenant: EMPRESA_ID, mode: 'read-only', writes: 0, groups: {} };
  for (const [group, rows] of Object.entries(rowsByGroup)) {
    plan.groups[group] = {
      count: rows.length,
      cases: rows.map((row) => ({ matricula_id: Number(row.id), curso_id: Number(row.curso_id), ...classifyCase(group, row) })),
    };
  }
  return plan;
}

async function main() {
  must(!process.argv.includes('--apply') && !process.env.APPLY, 'NO_APPLY_MODE');
  const live = process.argv.includes('--live');
  if (!live) {
    console.log(JSON.stringify({ mode: 'dry-run', hint: 'use --live para ler o D1 de producao (SELECT-only)', groups: Object.keys(GROUP_QUERIES) }, null, 2));
    return;
  }
  const rowsByGroup = {};
  for (const [group, sql] of Object.entries(GROUP_QUERIES)) rowsByGroup[group] = d1Select(sql, group);
  console.log(JSON.stringify(buildPlan(rowsByGroup), null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(String(error?.message || error));
    process.exit(1);
  });
}
