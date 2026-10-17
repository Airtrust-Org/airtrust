import { createHash } from 'node:crypto';

// User-designated Gatekeepers: existing historical enrollment IDs, not names or private records.
export const LEGACY_IDS = Object.freeze([23, 24]);
export const COMPANY = 6;
export const LEGACY_COURSE = 14;
export const TARGET_COURSE = 73;
export const AUDIT_MARKER = 'GATEKEEPER14_FDM73_ADMIN_CREDIT_SOURCE_';
const fail = (code) => { throw new Error('GATEKEEPER_ADMIN_CREDIT_' + code); };
const ensure = (value, code) => { if (!value) fail(code); };
const num = (value) => Number(value);
const upper = (value) => String(value ?? '').trim().toUpperCase();

export function buildGatekeeperAdminCreditPlan(sourceRows, cycles, options = {}) {
  ensure(Array.isArray(sourceRows) && sourceRows.length === 2, 'SOURCE_CARDINALITY');
  ensure(Array.isArray(cycles), 'CYCLES_INVALID');
  const sorted = [...sourceRows].sort((a, b) => num(a.source_id) - num(b.source_id));
  ensure(sorted.every((r, i) => num(r.source_id) === LEGACY_IDS[i]), 'SOURCE_IDS_DRIFT');
  ensure(num(options.targetTotal) === 2, 'TARGET_COURSE_COUNT_CHANGED');
  ensure(num(options.targetScormProgressCount) === 0, 'DESTINATION_SCORM_EVIDENCE_REVIEW');
  ensure(num(options.targetQualificationHistoryCount) === 0, 'DESTINATION_QUALIFICATION_REVIEW');
  ensure(options.targetReady === true, 'TARGET_COURSE_NOT_READY');
  const employeeIds = new Set();
  const targetIds = new Set();
  const cycleIds = new Set();
  const plan = [];
  for (const r of sorted) {
    ensure(num(r.source_empresa_id) === COMPANY && num(r.source_curso_id) === LEGACY_COURSE &&
      r.source_deleted == null && upper(r.source_status) === 'CONCLUIDO' &&
      num(r.source_progress) === 100 && Boolean(r.source_completed_at),
      'LEGACY_COMPLETION_NOT_PROVEN');
    ensure(num(r.employee_active) === 1 && Number.isSafeInteger(num(r.employee_id)) &&
      num(r.employee_id) > 0 && !employeeIds.has(num(r.employee_id)), 'EMPLOYEE_IDENTITY_DRIFT');
    employeeIds.add(num(r.employee_id));
    ensure(Number.isSafeInteger(num(r.target_id)) && num(r.target_id) > 0 &&
      !targetIds.has(num(r.target_id)) && num(r.target_empresa_id) === COMPANY &&
      num(r.target_curso_id) === TARGET_COURSE && r.target_deleted == null &&
      upper(r.target_status) === 'NAO_INICIADO' && num(r.target_progress) === 0 &&
      r.target_completed_at == null, 'TARGET_NOT_UNSTARTED_OR_DUPLICATE');
    targetIds.add(num(r.target_id));
    const linked = cycles.filter((c) => num(c.matricula_id) === num(r.target_id));
    ensure(linked.length === 1 && num(linked[0].empresa_id) === COMPANY &&
      num(linked[0].curso_id) === TARGET_COURSE &&
      upper(linked[0].status) === 'NAO_INICIADO' &&
      num(linked[0].progresso_pct) === 0 && num(linked[0].ciclo_atual) === 1,
      'TARGET_CURRENT_CYCLE_INVALID');
    const cycle = linked[0];
    ensure(Number.isSafeInteger(num(cycle.id)) && num(cycle.id) > 0 &&
      !cycleIds.has(num(cycle.id)), 'TARGET_CYCLE_DUPLICATE');
    cycleIds.add(num(cycle.id));
    plan.push({
      source_id: num(r.source_id), employee_id: num(r.employee_id),
      target_id: num(r.target_id), cycle_id: num(cycle.id),
      source_completed_at: String(r.source_completed_at),
    });
  }
  ensure(cycles.length === 2, 'EXTRA_DESTINATION_CYCLE');
  const candidate_hash = createHash('sha256').update(plan.map((r) =>
    [r.source_id, r.employee_id, r.target_id, r.cycle_id, r.source_completed_at].join(':')
  ).join('\n')).digest('hex');
  return { rows: plan, summary: {
    tenant: COMPANY, source_course: LEGACY_COURSE, destination_course: TARGET_COURSE,
    candidates: 2, candidate_hash, legacy_completed: 2, destination_unstarted: 2,
    writes: 0, scorm_written: false, emails_sent: false,
    certificates_issued: false, new_scorm_claimed_completed: false,
    administrative_equivalence_only: true, contains_personal_data: false,
  } };
}
