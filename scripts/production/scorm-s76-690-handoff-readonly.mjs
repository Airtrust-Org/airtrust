#!/usr/bin/env node
/**
 * One-enrollment, bounded D1 archive inspection for AirTrust S-76 incident.
 * No writes, no arbitrary ID or SQL input, no names, no raw CMI in logs/artifacts.
 * Unlike a 99% scalar, archived distinct-unit evidence can inform a governed
 * edition crosswalk; this script cannot transfer credit or issue completion.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const COMPANY = 6, COURSE = 39, ENROLLMENT = 690;
const DB = 'airtrust-db';
export const QUERY = String.raw`
SELECT h.id AS handoff_id, h.ciclo_id,
 h.previous_enrollment_json, h.previous_scorm_json, h.resume_plan_json,
 h.target_package_sha256, h.target_package_prefix,
 m.progresso_pct AS current_progress, m.status AS current_status,
 c.scorm_assessment_policy AS course_policy, c.scorm_mastery_score AS course_mastery,
 cy.assessment_policy AS current_cycle_policy,
 m.qualificacao_historico_id AS current_qualification_id,
 ps.suspend_data AS current_suspend, ps.cmi_json AS current_cmi,
 ps.lesson_status AS current_lesson_status,
 p.package_sha256 AS active_package_sha
FROM lms_scorm_edition_handoffs h
JOIN lms_matriculas m ON m.id=h.matricula_id
 AND m.empresa_id=h.empresa_id AND m.curso_id=h.curso_id
 AND m.deleted_at IS NULL
JOIN lms_matricula_ciclos cy ON cy.id=h.ciclo_id
 AND cy.empresa_id=h.empresa_id AND cy.matricula_id=m.id
 AND cy.curso_id=m.curso_id AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL
JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
 AND c.tipo_conteudo='scorm' AND c.deleted_at IS NULL
JOIN lms_scorm_package_versions p ON p.curso_id=c.id
 AND p.empresa_id=c.empresa_id AND p.r2_prefix=c.scorm_package_r2_prefix
 AND p.status='ACTIVE'
LEFT JOIN lms_progresso_scorm ps ON ps.matricula_id=m.id
 AND ps.empresa_id=m.empresa_id
WHERE h.empresa_id=6 AND h.curso_id=39 AND h.matricula_id=690
ORDER BY h.id DESC LIMIT 1`;

function valid(condition, code) { if (!condition) throw new Error(code); }
function object(s) {
  try {
    const v = typeof s === 'string' ? JSON.parse(s) : s;
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch { return null; }
}
function info(scorm) {
  const cmi = object(scorm?.cmi_json);
  const inner = cmi?.['cmi.suspend_data'];
  const state = object(typeof inner === 'string' && inner ? inner : scorm?.suspend_data);
  const slides = cmi?.['airtrust.viewed_slides'];
  const c = state?.c;
  const d = state?.d;
  return {
    status: typeof scorm?.lesson_status === 'string' ? scorm.lesson_status : null,
    has_cmi: cmi !== null,
    has_suspend: state !== null,
    state_schema: Number.isSafeInteger(state?.v) ? state.v : null,
    cursor: Number.isSafeInteger(state?.a) ? state.a : null,
    declared_ids_count: Array.isArray(state?.ids) ? state.ids.length : null,
    distinct_indexes_d: Array.isArray(d) && d.every(Number.isSafeInteger) ? new Set(d).size : null,
    distinct_indexes_c: Array.isArray(c) && c.every(Number.isSafeInteger) ? new Set(c).size : null,
    bit_flags_ones: typeof c === 'string' && /^[01]+$/.test(c)
      ? c.split('1').length - 1 : null,
    wrapper_ledger_count: Array.isArray(slides) && slides.every(Number.isSafeInteger)
      ? new Set(slides).size : null,
    lesson_location: typeof cmi?.['cmi.core.lesson_location'] === 'string' &&
      /^\d{1,3}\/\d{1,3}$/.test(cmi['cmi.core.lesson_location'])
      ? cmi['cmi.core.lesson_location'] : null,
  };
}
export function sanitize(row) {
  valid(row && typeof row === 'object', 'ARCHIVE_ROW_MISSING');
  valid(Number.isSafeInteger(row.handoff_id) && row.handoff_id > 0, 'HANDOFF_INVALID');
  valid(Number.isSafeInteger(row.ciclo_id) && row.ciclo_id > 0, 'CYCLE_INVALID');
  valid(/^[a-f0-9]{64}$/.test(row.active_package_sha || ''), 'ACTIVE_SHA_INVALID');
  // A replacement may have occurred after the archived handoff. Read-only
  // inspection must report that divergence, not conceal the archive. Nothing
  // here can authorize credit or change package identity.
  const prior = object(row.previous_enrollment_json);
  const oldScorm = object(row.previous_scorm_json);
  const plan = object(row.resume_plan_json);
  const current = info({ lesson_status: row.current_lesson_status, suspend_data: row.current_suspend,
    cmi_json: row.current_cmi });
  const archived = info(oldScorm);
  const oldPct = prior?.enrollment?.progresso_pct;
  valid(typeof oldPct === 'number' && Number.isFinite(oldPct) && oldPct >= 0 && oldPct <= 100,
    'ARCHIVE_PROGRESS_INVALID');
  const oldSha = prior?.previous_package_sha256;
  const oldShaValid = typeof oldSha === 'string' && /^[a-f0-9]{64}$/.test(oldSha);
  const a = plan?.activeTotal, b = plan?.targetPosition;
  valid(Number.isSafeInteger(a) && a > 0 && a <= 1000 &&
        Number.isSafeInteger(b) && b >= 1 && b <= a, 'HANDOFF_PLAN_INVALID');
  const oldCycle = object(prior?.cycle);
  const previousScore = typeof oldScorm?.score_raw === 'number' &&
    Number.isFinite(oldScorm.score_raw) ? oldScorm.score_raw : null;
  const previousMax = typeof oldScorm?.score_max === 'number' &&
    Number.isFinite(oldScorm.score_max) ? oldScorm.score_max : null;
  const oldScorePct = previousScore !== null && previousMax !== null && previousMax > 0
    ? (previousScore * 100) / previousMax : previousScore;
  return {
    schema_version: 2, mode: 'read_only', writes: 0, tenant_id: COMPANY,
    course_id: COURSE, enrollment_id: ENROLLMENT,
    handoff_id: row.handoff_id, cycle_id: row.ciclo_id,
    original_progress_pct: oldPct,
    archive_qualification_issued: Number.isSafeInteger(oldCycle?.qualificacao_historico_id) &&
      oldCycle.qualificacao_historico_id > 0,
    archive_enrollment_completed_at_present: typeof prior?.enrollment?.data_conclusao === 'string' &&
      prior.enrollment.data_conclusao.length > 0,
    archive_cycle_status: typeof oldCycle?.status === 'string' &&
      ['NAO_INICIADO','EM_ANDAMENTO','CONCLUIDO','CANCELADO'].includes(oldCycle.status)
      ? oldCycle.status : null,
    archive_scorm_score_pct: oldScorePct !== null && Number.isFinite(oldScorePct) &&
      oldScorePct >= 0 && oldScorePct <= 100 ? Math.round(oldScorePct * 100) / 100 : null,
    archive_scorm_last_commit_present: typeof oldScorm?.last_commit_at === 'string' &&
      oldScorm.last_commit_at.length > 0,
    current_assessment_policy: row.current_cycle_policy === 'FORMATIVE' ||
      row.current_cycle_policy === 'SCORED' ? row.current_cycle_policy : null,
    current_course_policy: row.course_policy === 'FORMATIVE' ||
      row.course_policy === 'SCORED' ? row.course_policy : null,
    current_course_mastery: Number.isFinite(row.course_mastery) ? row.course_mastery : null,
    current_qualification_issued: Number.isSafeInteger(row.current_qualification_id) &&
      row.current_qualification_id > 0,
    current_progress_pct: row.current_progress,
    enrollment_status: row.current_status,
    previous_package_sha_present: oldShaValid,
    previous_differs_from_active: oldShaValid ? oldSha !== row.active_package_sha : null,
    active_sha_matches_handoff: row.active_package_sha === row.target_package_sha256,
    handoff_plan: {
      status: plan.status ?? null,
      active_total: a, target_position: b,
      matched_navigation_count: Array.isArray(plan.matchedNavigationUnitIds)
        ? plan.matchedNavigationUnitIds.length : null,
      unmatched_navigation_count: Array.isArray(plan.unmatchedNavigationUnitIds)
        ? plan.unmatchedNavigationUnitIds.length : null,
      pending_review_count: Array.isArray(plan.pendingReviewUnitIds)
        ? plan.pendingReviewUnitIds.length : null,
      can_mark_complete: plan.canMarkComplete === true,
    },
    archive: archived, current,
    completion_granted: false, evidence_transfer_executed: false,
  };
}
function select() {
  valid(/^\s*SELECT\b/i.test(QUERY), 'READONLY_QUERY_REQUIRED');
  valid(!/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|REPLACE|VACUUM|PRAGMA)\b/i.test(QUERY),
    'READONLY_MUTATION_FORBIDDEN');
  valid(!QUERY.includes(';'), 'MULTISTATEMENT_FORBIDDEN');
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', DB, '--env', 'production',
    '--remote', '--json', '--command', QUERY],
    { cwd: new URL('../../worker-airtrust/', import.meta.url), encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024, env: process.env });
  valid(r.status === 0, 'D1_SCOPED_SELECT_FAILED');
  const response = JSON.parse(r.stdout || '[]');
  const parsed = Array.isArray(response) ? response[0] : response;
  valid(Array.isArray(parsed?.results) && parsed.results.length === 1,
    'HANDOFF_PROVENANCE_NOT_UNIQUE');
  return parsed.results[0];
}
async function main() {
  valid(process.env.CONFIRMATION === 'AIRTRUST_S76_690_ARCHIVE_READONLY', 'CONFIRMATION_INVALID');
  const expected = process.env.EXPECTED_MAIN_SHA || '';
  valid(/^[a-f0-9]{40}$/.test(expected) && process.env.GITHUB_SHA === expected,
    'EXACT_MAIN_SHA_REQUIRED');
  valid(process.env.TARGET_COMPANY_ID === '6', 'TENANT_INVALID');
  process.stdout.write(JSON.stringify(sanitize(select()), null, 2) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error('S76_690_READONLY_BLOCKED:' + String(error?.message || 'error').slice(0, 100));
    process.exitCode = 1;
  });
}
