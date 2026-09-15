#!/usr/bin/env node

// source_reference: tenant-6 read-only inventory requested 2026-09-14; 171 LMS enrollments were NAO_INICIADO, 0%, with no runtime/history evidence.
// operational_decision: cancel/soft-delete only provably unstarted enrollments so Compliance can be rebuilt before explicit invitations are sent.
// dry_run_required: production apply requires a successful reviewed dry-run on the exact same SHA plus exact candidate count/hash.
// rollback_plan_required: workflow captures a D1 Time Travel recovery point immediately before apply; no completed/in-progress evidence is mutated.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const DB_NAME = 'airtrust-db';
const EMPRESA_ID = 6;
const DRY_CONFIRM = 'AIRTRUST_PRODUCTION_DRYRUN_UNSTARTED_ENROLLMENT_CLEANUP';
const APPLY_CONFIRM = 'AIRTRUST_PRODUCTION_APPLY_UNSTARTED_ENROLLMENT_CLEANUP';
const mode = process.argv[2] || process.env.TRAINING_ENROLLMENT_CLEANUP_MODE || 'dry-run';

function fail(code) {
  console.error(`TRAINING_ENROLLMENT_CLEANUP_ERROR:${code}`);
  process.exit(1);
}
if (!['dry-run', 'apply'].includes(mode)) fail('INVALID_MODE');
if ((process.env.TRAINING_ENROLLMENT_PRODUCTION_DB_NAME || DB_NAME) !== DB_NAME) fail('PRODUCTION_DB_TARGET_REJECTED');
const confirmation = process.env.TRAINING_ENROLLMENT_CLEANUP_CONFIRMATION || '';
if (mode === 'dry-run' && confirmation !== DRY_CONFIRM) fail('DRYRUN_CONFIRMATION_REQUIRED');
if (mode === 'apply' && confirmation !== APPLY_CONFIRM) fail('APPLY_CONFIRMATION_REQUIRED');

const SAFE_WHERE = `m.empresa_id=${EMPRESA_ID}
  AND m.deleted_at IS NULL
  AND UPPER(COALESCE(m.status,''))='NAO_INICIADO'
  AND COALESCE(m.progresso_pct,0)=0
  AND m.data_inicio IS NULL
  AND m.data_conclusao IS NULL
  AND m.qualificacao_historico_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM lms_progresso_scorm p WHERE p.empresa_id=m.empresa_id AND p.matricula_id=m.id)
  AND NOT EXISTS (SELECT 1 FROM lms_xapi_statements x WHERE x.empresa_id=m.empresa_id AND x.matricula_id=m.id)
  AND NOT EXISTS (SELECT 1 FROM lms_completion_diagnostics_snapshots d WHERE d.empresa_id=m.empresa_id AND d.matricula_id=m.id)
  AND NOT EXISTS (SELECT 1 FROM qualificacoes_historico q WHERE q.empresa_id=m.empresa_id AND q.lms_matricula_id=m.id AND q.deleted_at IS NULL)`;

function runWrangler(sql, label) {
  const r = spawnSync('npx', ['wrangler','d1','execute',DB_NAME,'--env','production','--remote','--json','--command',sql], {
    cwd: new URL('../../worker-airtrust/', import.meta.url), encoding: 'utf8', env: process.env, maxBuffer: 12 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error(`D1_OPERATION_FAILED:${label}:exit=${r.status ?? 'null'}`);
    process.stderr.write(r.stderr || '');
    fail('D1_OPERATION_FAILED');
  }
  let parsed;
  try { parsed = JSON.parse(r.stdout || '[]'); } catch { fail('D1_JSON_INVALID'); }
  const envelope = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!envelope || !Array.isArray(envelope.results)) fail(`D1_RESULTS_MISSING_${label}`);
  return envelope;
}

function select(sql, label) {
  const normalized=String(sql).trim().replace(/;+\s*$/,'');
  if (!/^(SELECT|WITH)\b/i.test(normalized)) fail(`NON_SELECT_${label}`);
  if (/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|VACUUM|ATTACH|DETACH|REINDEX)\b/i.test(normalized)) fail(`MUTATING_PREFLIGHT_${label}`);
  return runWrangler(normalized,label).results;
}

function readState() {
  const candidates = select(`SELECT m.id,m.funcionario_id,m.curso_id,date(m.data_matricula) AS enrolled_on,
      COALESCE((SELECT mc.origem FROM lms_matricula_ciclos mc WHERE mc.matricula_id=m.id AND mc.ciclo_atual=1 AND mc.deleted_at IS NULL ORDER BY mc.id DESC LIMIT 1),'SEM_CICLO') AS origem
    FROM lms_matriculas m WHERE ${SAFE_WHERE} ORDER BY m.id`, 'candidates');
  const statusRows = select(`SELECT UPPER(COALESCE(status,'')) AS status,COUNT(*) AS n FROM lms_matriculas WHERE empresa_id=${EMPRESA_ID} AND deleted_at IS NULL GROUP BY UPPER(COALESCE(status,''))`, 'status_counts');
  const ids = candidates.map((row) => Number(row.id)).sort((a,b) => a-b);
  const hash = createHash('sha256').update(ids.join(',')).digest('hex');
  const origins = {};
  for (const row of candidates) origins[String(row.origem || 'SEM_CICLO')] = Number(origins[String(row.origem || 'SEM_CICLO')] || 0) + 1;
  const status = Object.fromEntries(statusRows.map((row) => [String(row.status), Number(row.n)]));
  const dates = candidates.map((row) => String(row.enrolled_on || '')).filter(Boolean).sort();
  return {
    ids, candidate_hash: hash,
    candidate_count: ids.length,
    distinct_people: new Set(candidates.map((row) => Number(row.funcionario_id))).size,
    distinct_courses: new Set(candidates.map((row) => Number(row.curso_id))).size,
    first_enrollment_date: dates[0] || null,
    last_enrollment_date: dates[dates.length - 1] || null,
    origins, status,
  };
}

const before = readState();
const summary = {
  mode, source_sha: process.env.GITHUB_SHA || null, empresa_id: EMPRESA_ID,
  candidate_count: before.candidate_count, candidate_hash: before.candidate_hash,
  distinct_people: before.distinct_people, distinct_courses: before.distinct_courses,
  first_enrollment_date: before.first_enrollment_date, last_enrollment_date: before.last_enrollment_date,
  cycle_origins: before.origins,
  protected_status_counts: { CONCLUIDO: before.status.CONCLUIDO || 0, EM_ANDAMENTO: before.status.EM_ANDAMENTO || 0, REPROVADO: before.status.REPROVADO || 0 },
  mutation_executed: false, changed_enrollments: 0, pii_emitted: false,
};

if (mode === 'dry-run') {
  process.stdout.write(`${JSON.stringify(summary,null,2)}\n`);
  process.exit(0);
}

const expectedCount = Number(process.env.TRAINING_ENROLLMENT_EXPECTED_COUNT || 0);
const expectedHash = String(process.env.TRAINING_ENROLLMENT_EXPECTED_HASH || '').toLowerCase();
if (!Number.isInteger(expectedCount) || expectedCount <= 0) fail('EXPECTED_COUNT_REQUIRED');
if (!/^[0-9a-f]{64}$/.test(expectedHash)) fail('EXPECTED_HASH_REQUIRED');
if (before.candidate_count !== expectedCount) fail(`CANDIDATE_COUNT_CHANGED_EXPECTED_${expectedCount}_FOUND_${before.candidate_count}`);
if (before.candidate_hash !== expectedHash) fail('CANDIDATE_SET_CHANGED');

runWrangler(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at)
  SELECT NULL,'LMS_MATRICULA_CLEANUP_UNSTARTED','lms_matriculas',m.id,
         '{"status":"NAO_INICIADO","progresso_pct":0}',
         '{"status":"CANCELADO","reason":"compliance_matrix_reset"}',${EMPRESA_ID},datetime('now')
    FROM lms_matriculas m WHERE ${SAFE_WHERE}`, 'audit');

runWrangler(`UPDATE notificacoes_inapp SET deleted_at=COALESCE(deleted_at,datetime('now'))
  WHERE empresa_id=${EMPRESA_ID} AND deleted_at IS NULL AND referencia_tipo='lms_matricula'
    AND tipo IN ('lms_nova_matricula','lms_renovacao_automatica')
    AND CAST(referencia_id AS INTEGER) IN (SELECT m.id FROM lms_matriculas m WHERE ${SAFE_WHERE})`, 'notifications');

runWrangler(`UPDATE lms_matricula_ciclos SET status='CANCELADO',updated_at=datetime('now')
  WHERE empresa_id=${EMPRESA_ID} AND ciclo_atual=1 AND deleted_at IS NULL
    AND matricula_id IN (SELECT m.id FROM lms_matriculas m WHERE ${SAFE_WHERE})`, 'cycles');

runWrangler(`UPDATE lms_matriculas AS m SET status='CANCELADO',deleted_at=datetime('now'),updated_at=datetime('now') WHERE ${SAFE_WHERE}`, 'enrollments');

// D1 meta.changes includes trigger side effects, so it is not a reliable count of
// enrollment rows changed. Verify the exact reviewed ids by querying their final state.
const reviewedIds = before.ids.join(',');
const changedRows = select(`SELECT COUNT(*) AS n FROM lms_matriculas
  WHERE empresa_id=${EMPRESA_ID}
    AND id IN (${reviewedIds})
    AND UPPER(COALESCE(status,''))='CANCELADO'
    AND deleted_at IS NOT NULL`, 'changed_enrollments');
const changed = Number(changedRows[0]?.n ?? 0);
if (changed !== expectedCount) fail(`APPLY_ENROLLMENT_POSTCOUNT_MISMATCH_EXPECTED_${expectedCount}_FOUND_${changed}`);

const after = readState();
if (after.candidate_count !== 0) fail(`POST_CANDIDATES_REMAIN_${after.candidate_count}`);
for (const key of ['CONCLUIDO','EM_ANDAMENTO','REPROVADO']) {
  if (Number(after.status[key] || 0) !== Number(before.status[key] || 0)) fail(`PROTECTED_STATUS_CHANGED_${key}`);
}
Object.assign(summary, { mutation_executed: true, changed_enrollments: changed, post_candidate_count: after.candidate_count, postconditions_verified: true });
process.stdout.write(`${JSON.stringify(summary,null,2)}\n`);
