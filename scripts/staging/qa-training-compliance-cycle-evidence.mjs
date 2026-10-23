#!/usr/bin/env node
// source_reference: F1 synthetic second-cycle lifecycle acceptance (#1492).
// operational_decision: STAGING_ONLY; only the run-owned E1 qualification may be expired.
// dry_run_required: --expire without --apply is read-only; --verify is always read-only.
// rollback_plan_required: the enclosing lifecycle workflow soft-deletes the run-owned D1 fixture.
import { spawnSync } from 'node:child_process';

const DB = 'airtrust-db-staging-baseline-20260701';
const TENANT = 'qa_examiner_training';
const CONFIRM = 'AIRTRUST_STAGING_TRAINING_COMPLIANCE_LIFECYCLE_QA';
const code = (process.env.QA_LIFECYCLE_CODE || '').trim();
const marker = (process.env.QA_LIFECYCLE_MARKER || '').trim();
const requestedDb = (process.env.STAGING_D1_NAME || DB).trim();
const mode = process.argv.includes('--expire') ? 'expire' : process.argv.includes('--verify') ? 'verify' : '';
const apply = process.argv.includes('--apply');

if (!mode || (mode === 'verify' && apply)) throw new Error('QA_CYCLE_MODE_INVALID');
if (requestedDb !== DB) throw new Error('QA_D1_TARGET_REJECTED');
if (!/^QA-COMP-LIFE-[0-9]{3,32}$/.test(code) ||
    !/^QA_ONLY_TRAINING_COMPLIANCE_LIFECYCLE_[0-9]{3,32}$/.test(marker) ||
    code.slice('QA-COMP-LIFE-'.length) !== marker.slice('QA_ONLY_TRAINING_COMPLIANCE_LIFECYCLE_'.length)) {
  throw new Error('QA_LIFECYCLE_IDENTITY_REJECTED');
}
if (apply && process.env.CONFIRM_STAGING_COMPLIANCE_LIFECYCLE_QA !== CONFIRM) {
  throw new Error('STAGING_CONFIRMATION_MISSING');
}

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const identity = `e.codigo=${q(TENANT)} AND f.matricula=${q(`${code}-E1`)}
  AND c.titulo=${q(`${code} EAD obrigatório`)} AND c.observacoes=${q(marker)}
  AND qh.empresa_id=e.id AND qh.funcionario_id=f.id AND qh.qualificacao_id=c.qualificacao_tipo_id
  AND qh.lms_matricula_id=m.id AND m.empresa_id=e.id AND m.funcionario_id=f.id
  AND m.curso_id=c.id AND qh.deleted_at IS NULL AND m.deleted_at IS NULL AND c.deleted_at IS NULL`;
const expirySelectSql = `SELECT qh.id, qh.data_vencimento FROM qualificacoes_historico qh
  JOIN funcionarios f ON f.id=qh.funcionario_id AND f.empresa_id=qh.empresa_id
  JOIN empresas e ON e.id=f.empresa_id JOIN lms_matriculas m ON m.id=qh.lms_matricula_id
  JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
  WHERE ${identity} AND UPPER(COALESCE(qh.status,''))='CONCLUIDA'
    AND UPPER(COALESCE(m.status,''))='CONCLUIDO'
    AND qh.origem_tipo='LMS' AND qh.data_vencimento IS NOT NULL
    AND date(qh.data_vencimento)>date('now') ORDER BY qh.id DESC LIMIT 2`;
const expiryUpdateSql = (id) => `UPDATE qualificacoes_historico AS qh SET data_vencimento=date('now','-1 day'),
    updated_at=datetime('now'), observacoes=COALESCE(observacoes,'') || ' | QA synthetic due date ${marker}'
  WHERE qh.id=${Number(id)} AND EXISTS (
    SELECT 1 FROM funcionarios f JOIN empresas e ON e.id=f.empresa_id
    JOIN lms_matriculas m ON m.funcionario_id=f.id AND m.empresa_id=f.empresa_id
    JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
    WHERE ${identity} AND UPPER(COALESCE(qh.status,''))='CONCLUIDA'
      AND UPPER(COALESCE(m.status,''))='CONCLUIDO' AND qh.origem_tipo='LMS'
      AND qh.data_vencimento IS NOT NULL AND date(qh.data_vencimento)>date('now'))`;

function query(sql) {
  const result = spawnSync('npx', ['wrangler', 'd1', 'execute', DB, '--remote', '--json', `--command=${sql}`], {
    cwd: new URL('../../worker-airtrust/', import.meta.url),
    encoding: 'utf8', env: process.env, maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error('QA_D1_QUERY_FAILED');
  let payload;
  try { payload = JSON.parse(result.stdout); } catch { throw new Error('QA_D1_JSON_INVALID'); }
  const rows = Array.isArray(payload) ? payload[0]?.results : payload?.results;
  if (!Array.isArray(rows)) throw new Error('QA_D1_ROWS_INVALID');
  return rows;
}

if (process.env.NODE_ENV === 'test' && process.argv.includes('--print-expiry-sql-for-qa-test')) {
  process.stdout.write(JSON.stringify({ select: expirySelectSql, update: expiryUpdateSql(1) }));
  process.exit(0);
}

if (mode === 'expire') {
  const candidates = query(expirySelectSql);
  if (candidates.length !== 1) throw new Error(`QA_SYNTHETIC_EXPIRY_CANDIDATE_COUNT:${candidates.length}`);
  if (!apply) {
    console.log(JSON.stringify({ mode: 'DRY_RUN', target: DB, synthetic_candidate_count: 1, due_date_change: 'previous UTC day' }));
    process.exit(0);
  }
  query(expiryUpdateSql(candidates[0].id));
  const readback = query(`SELECT COUNT(*) AS expired_count FROM qualificacoes_historico qh
    JOIN funcionarios f ON f.id=qh.funcionario_id AND f.empresa_id=qh.empresa_id
    JOIN empresas e ON e.id=f.empresa_id JOIN lms_matriculas m ON m.id=qh.lms_matricula_id
    JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
    WHERE ${identity} AND qh.observacoes LIKE '%' || ${q(`QA synthetic due date ${marker}`)}
      AND date(qh.data_vencimento)<date('now')`);
  if (Number(readback[0]?.expired_count) !== 1) throw new Error('QA_SYNTHETIC_EXPIRY_READBACK_FAILED');
  console.log(JSON.stringify({ mode: 'APPLY', target: DB, synthetic_expirations: 1, status: 'PASS' }));
  process.exit(0);
}

const rows = query(`SELECT cy.id,cy.numero_ciclo,cy.origem,cy.status,cy.ciclo_atual,cy.progresso_pct,
    cy.qualificacao_historico_id,
    (SELECT COUNT(*) FROM lms_xapi_statements x WHERE x.empresa_id=cy.empresa_id
      AND x.matricula_id=cy.matricula_id AND x.archived_cycle_id=cy.id) archived_xapi,
    (SELECT COUNT(*) FROM lms_xapi_statements x WHERE x.empresa_id=cy.empresa_id
      AND x.matricula_id=cy.matricula_id AND x.archived_cycle_id IS NULL) current_xapi,
    (SELECT COUNT(*) FROM lms_ciclo_evidencias ev WHERE ev.empresa_id=cy.empresa_id
      AND ev.matricula_id=cy.matricula_id AND ev.ciclo_id=cy.id) archived_snapshot
  FROM lms_matricula_ciclos cy
  JOIN lms_matriculas m ON m.id=cy.matricula_id AND m.empresa_id=cy.empresa_id
  JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=m.empresa_id
  JOIN empresas e ON e.id=f.empresa_id JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
  WHERE e.codigo=${q(TENANT)} AND f.matricula=${q(`${code}-E1`)}
    AND c.titulo=${q(`${code} EAD obrigatório`)} AND c.observacoes=${q(marker)}
    AND cy.deleted_at IS NULL AND m.deleted_at IS NULL ORDER BY cy.numero_ciclo`);
if (rows.length !== 2) throw new Error(`QA_CYCLE_COUNT_INVALID:${rows.length}`);
const [first, second] = rows;
if (Number(first.numero_ciclo) !== 1 || Number(second.numero_ciclo) !== 2 ||
    String(second.origem).toUpperCase() !== 'AUTO_RENOVACAO' ||
    String(first.status).toUpperCase() !== 'CONCLUIDO' || Number(first.ciclo_atual) !== 0 ||
    Number(first.archived_xapi) < 1 || Number(first.archived_snapshot) !== 1 ||
    String(second.status).toUpperCase() !== 'CONCLUIDO' || Number(second.ciclo_atual) !== 1 ||
    Number(second.progresso_pct) < 100 || Number(second.current_xapi) < 1 ||
    !Number(second.qualificacao_historico_id)) {
  throw new Error('QA_CYCLE_EVIDENCE_CONTRACT_FAILED');
}
const certificate = query(`SELECT COUNT(*) AS certificate_count FROM documentos d
  JOIN qualificacoes_historico qh ON qh.certificado_arquivo_id=d.id
    AND qh.empresa_id=d.empresa_id AND qh.funcionario_id=d.funcionario_id
  JOIN funcionarios f ON f.id=qh.funcionario_id AND f.empresa_id=qh.empresa_id
  JOIN empresas e ON e.id=f.empresa_id JOIN lms_cursos c ON c.qualificacao_tipo_id=qh.qualificacao_id
    AND c.empresa_id=qh.empresa_id AND c.observacoes=${q(marker)}
  JOIN lms_matriculas m ON m.id=qh.lms_matricula_id AND m.empresa_id=qh.empresa_id
    AND m.funcionario_id=qh.funcionario_id AND m.curso_id=c.id
  WHERE e.codigo=${q(TENANT)} AND f.matricula=${q(`${code}-E1`)}
    AND qh.id=${Number(second.qualificacao_historico_id)} AND d.deleted_at IS NULL
    AND d.tipo='application/pdf'`);
if (Number(certificate[0]?.certificate_count) !== 1) throw new Error('QA_CYCLE_TWO_CERTIFICATE_LINK_FAILED');
console.log(JSON.stringify({ mode: 'VERIFY', tenant: TENANT, cycles: 2, renewal_origin: 'AUTO_RENOVACAO',
  first_cycle_archived_xapi: Number(first.archived_xapi), first_cycle_immutable_snapshot: true,
  second_cycle_progress_pct: Number(second.progresso_pct), second_cycle_active_xapi: Number(second.current_xapi),
  second_cycle_qualification_linked: true, second_cycle_certificate_linked: true, status: 'PASS' }));
