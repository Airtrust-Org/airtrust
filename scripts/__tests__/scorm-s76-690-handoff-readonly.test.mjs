import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, QUERY } from '../production/scorm-s76-690-handoff-readonly.mjs';

const sha = 'a'.repeat(64);
const row = () => ({
  handoff_id: 44, ciclo_id: 12,
  previous_enrollment_json: JSON.stringify({
    enrollment: { progresso_pct: 99, status: 'EM_ANDAMENTO', data_conclusao: null, secretName: 'DO_NOT_EMIT' },
    cycle: { status: 'EM_ANDAMENTO', qualificacao_historico_id: null },
    previous_package_sha256: 'b'.repeat(64),
  }),
  previous_scorm_json: JSON.stringify({
    lesson_status: 'completed', score_raw: 75, score_max: 100,
    last_commit_at: '2026-11-02T12:00:00Z',
    suspend_data: JSON.stringify({ v: 2, p: 'old', a: 54,
      c: Array.from({ length: 54 }, (_, i) => i), g: {} }),
    cmi_json: JSON.stringify({ 'cmi.core.lesson_location': '55/55',
      'airtrust.viewed_slides': Array.from({ length: 54 }, (_, i) => i + 1) }),
  }),
  resume_plan_json: JSON.stringify({
    status: 'MATCHED_ANCHOR', activeTotal: 49, targetPosition: 3,
    matchedNavigationUnitIds: ['M1-01', 'M1-02'],
    unmatchedNavigationUnitIds: ['M1-03'],
    pendingReviewUnitIds: ['M1-01', 'M1-02'],
    canMarkComplete: false,
  }),
  target_package_sha256: sha,
  target_package_prefix: 'lms/scorm/6/39/_candidates/test/',
  active_package_sha: sha,
  current_progress: 99, current_status: 'EM_ANDAMENTO',
  course_policy: 'FORMATIVE', course_mastery: 70,
  current_cycle_policy: 'FORMATIVE', current_qualification_id: null,
  current_lesson_status: 'incomplete',
  current_cmi: JSON.stringify({ 'cmi.core.lesson_location': '3/49' }),
  current_suspend: JSON.stringify({ v: 4, p: 'active', a: 2, d: [0, 1], g: [], c: false }),
});
describe('S-76 #690 immutable handoff readonly inspection', () => {
  it('emits bounded evidence counts, no raw CMI, source id or PII', () => {
    const s = sanitize(row());
    assert.equal(s.writes, 0);
    assert.equal(s.original_progress_pct, 99);
    assert.equal(s.archive_qualification_issued, false);
    assert.equal(s.archive_enrollment_completed_at_present, false);
    assert.equal(s.archive_cycle_status, 'EM_ANDAMENTO');
    assert.equal(s.archive_scorm_score_pct, 75);
    assert.equal(s.archive_scorm_last_commit_present, true);
    assert.equal(s.current_assessment_policy, 'FORMATIVE');
    assert.equal(s.current_qualification_issued, false);
    assert.equal(s.current_progress_pct, 99);
    assert.equal(s.archive.distinct_indexes_c, 54);
    assert.equal(s.current.distinct_indexes_d, 2);
    assert.equal(s.handoff_plan.target_position, 3);
    assert.equal(s.completion_granted, false);
    assert.equal(s.evidence_transfer_executed, false);
    const emitted = JSON.stringify(s);
    assert.doesNotMatch(emitted, /DO_NOT_EMIT|target_package_prefix|previous_scorm_json|previous_enrollment_json/);
    assert.equal(s.active_sha_matches_handoff, true);
    assert.equal(s.active_package_sha256, sha);
    assert.equal(s.handoff_target_sha256, sha);
    assert.equal(s.previous_package_sha256, 'b'.repeat(64));
  });
  it('redacts arbitrary free-form SCORM location and retains numeric bookmark', () => {
    const base = row();
    const cmi = JSON.stringify({ 'cmi.core.lesson_location': 'SENSITIVE_FREEFORM_TEXT' });
    const output = sanitize({ ...base, current_cmi: cmi });
    assert.equal(output.current.lesson_location, null);
    assert.equal(output.archive.lesson_location, '55/55');
    assert.doesNotMatch(JSON.stringify(output), /SENSITIVE_FREEFORM_TEXT/);
  });
  it('reports replacement after handoff without authorizing credit or completion', () => {
    const report = sanitize({ ...row(), active_package_sha: 'c'.repeat(64) });
    assert.equal(report.active_sha_matches_handoff, false);
    assert.equal(report.evidence_transfer_executed, false);
    assert.equal(report.completion_granted, false);
  });
  it('fails closed without archived progress or a proven navigation plan', () => {
    assert.throws(() => sanitize({ ...row(), previous_enrollment_json: '{}' }),
      /ARCHIVE_PROGRESS_INVALID/);
    assert.throws(() => sanitize({ ...row(), resume_plan_json: '{}' }),
      /HANDOFF_PLAN_INVALID/);
  });
  it('uses a single hard-coded SELECT, not an interpolation or mutating command', () => {
    assert.match(QUERY.trim(), /^SELECT\s/i);
    assert.doesNotMatch(QUERY, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE)\b/i);
    assert.match(QUERY, /h\.empresa_id=6 AND h\.curso_id=39 AND h\.matricula_id=690/);
    assert.doesNotMatch(QUERY, /;/);
  });
});
