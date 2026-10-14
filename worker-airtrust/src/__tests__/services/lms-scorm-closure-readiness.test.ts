import { describe, expect, it } from 'vitest';
import { resolveLmsCompletionScorePct } from '../../services/lms-completion-evidence';
import {
  evaluateScormClosureReadiness,
  canFinalizeScormEnrollment,
  describeScormSlideCoverage,
  type ScormCommitLike,
} from '../../services/lms-matricula-runtime-domain';

const coverage = (total = 42) => JSON.stringify({
  'cmi.core.lesson_location': `${total}/${total}`,
  'airtrust.total_slides': total,
  'airtrust.viewed_slides': Array.from({ length: total }, (_, i) => i + 1),
});

const base = (mode: 'commit' | 'reconcile' = 'commit') => ({
  mode,
  commit: {
    lesson_status: 'passed',
    completion_status: 'completed',
    success_status: 'passed',
    commit_event: 'SCORM_USER_FINALIZE',
  } as ScormCommitLike,
  wasCompleted: false,
  cmiJson: coverage(),
  location: { current: 42, total: 42 },
  policy: 'SCORED' as const,
  masteryScore: 80,
  scorePct: 100,
});

describe('Player 2.0: one SCORM completion readiness contract', () => {
  it('reports recorded and missing slide numbers without turning a position badge into evidence', () => {
    const input = JSON.stringify({
      'cmi.core.lesson_location': '42/42', 'airtrust.total_slides': 42,
      'airtrust.viewed_slides': [1, 3, 42],
    });
    const result = evaluateScormClosureReadiness({ ...base(), cmiJson: input });
    expect(result.eligible_for_server_verification).toBe(false);
    expect(result.slide_coverage).toMatchObject({ total: 42, recorded: 3 });
    expect(result.slide_coverage?.missing_numbers).toContain(2);
    expect(result.slide_coverage?.missing_numbers).not.toContain(42);
    expect(describeScormSlideCoverage(JSON.stringify({
      'airtrust.total_slides': 42, 'airtrust.viewed_slides': [1, 1],
    }), { current: 42, total: 42 })).toBeNull();
    expect(describeScormSlideCoverage('invalid', { current: 42, total: 42 })).toBeNull();
    expect(describeScormSlideCoverage('{}', { current: 42, total: 42 }))
      .toMatchObject({total:42,recorded:0,missing_numbers:Array.from({length:42},(_,i)=>i+1)});
  });

  it('42/42 with 0/10 questions answered is not equivalent to training completion', () => {
    const pending = evaluateScormClosureReadiness({
      ...base(),
      commit: { lesson_status: 'incomplete', commit_event: 'SCORM_USER_FINALIZE' },
      scorePct: 0,
    });
    expect(pending).toMatchObject({
      eligible_for_server_verification: false, code: 'SCORE_BELOW_MASTERY',
      last_step_reached: true, every_slide_verified: true,
      terminal_status_verified: false, assessment_verified: false,
    });
    expect(pending.missing).toContain('assessment_pass');
  });

  it('a 100% badge and 42/42 position never fabricate missing distinct-slide coverage', () => {
    const invalid = evaluateScormClosureReadiness({
      ...base(),
      cmiJson: JSON.stringify({ 'cmi.core.lesson_location': '42/42' }),
    });
    expect(invalid.code).toBe('PROGRESS_EVIDENCE_MISSING');
    expect(invalid.missing).toContain('distinct_slide_coverage');
  });

  it('the final location and a high score cannot synthesize terminal SCORM passed status', () => {
    const pending = evaluateScormClosureReadiness({
      ...base(),
      commit: { lesson_status: 'incomplete', commit_event: 'SCORM_USER_FINALIZE' },
    });
    expect(pending.code).toBe('COMPLETION_EVIDENCE_INSUFFICIENT');
    expect(pending.eligible_for_server_verification).toBe(false);
  });

  it('never authorizes finalization from passive package events without the learner final request', () => {
    const snapshot = base();
    snapshot.commit.commit_event = 'SCORM_FINISH';
    const result = evaluateScormClosureReadiness(snapshot);
    expect(result.code).toBe('SCORM_USER_CONFIRMATION_REQUIRED');
    expect(canFinalizeScormEnrollment(snapshot)).toBe(false);
  });

  it('accepts complete scored evidence as ELIGIBLE, not yet a completed enrollment', () => {
    const input = base();
    const result = evaluateScormClosureReadiness(input);
    expect(result).toMatchObject({
      contract_version: 1,
      code: 'SCORM_READY_FOR_SERVER_VERIFICATION',
      eligible_for_server_verification: true,
      missing: [], assessment_verified: true, every_slide_verified: true,
    });
    expect(canFinalizeScormEnrollment(input)).toBe(true);
  });

  it('permits a verified formative course without a fabricated score', () => {
    const result = evaluateScormClosureReadiness({
      ...base(), policy: 'FORMATIVE', masteryScore: null, scorePct: null,
    });
    expect(result.eligible_for_server_verification).toBe(true);
  });

  it('reconciles only persisted, scored and completed evidence, with no status override', () => {
    const ready = evaluateScormClosureReadiness({
      ...base('reconcile'), commit: { lesson_status: 'passed' },
    });
    expect(ready.eligible_for_server_verification).toBe(true);
    const pending = evaluateScormClosureReadiness({
      ...base('reconcile'), commit: { lesson_status: 'incomplete' },
    });
    expect(pending.eligible_for_server_verification).toBe(false);
  });

  it('treats explicit failure as higher priority than an otherwise valid passed status', () => {
    const result = evaluateScormClosureReadiness({
      ...base(), commit: { lesson_status: 'passed', success_status: 'failed',
        commit_event: 'SCORM_USER_FINALIZE' },
    });
    expect(result.code).toBe('EXPLICIT_FAILURE');
  });

  it('does not accept a missing or zero mastery policy for a scored qualification', () => {
    const missing = evaluateScormClosureReadiness({ ...base(), masteryScore: null });
    const zero = evaluateScormClosureReadiness({ ...base(), masteryScore: 0 });
    expect(missing.code).toBe('MASTERY_SCORE_MISSING');
    expect(zero.code).toBe('MASTERY_SCORE_MISSING');
  });

  it('protects already-completed enrollment against re-finalization', () => {
    const result = evaluateScormClosureReadiness({ ...base(), wasCompleted: true });
    expect(result.code).toBe('SCORM_ALREADY_COMPLETED');
    expect(result.eligible_for_server_verification).toBe(false);
  });

  it('does not accept the final page with a spoofed/incomplete per-slide map', () => {
    const cmiJson = JSON.stringify({
      'cmi.core.lesson_location': '42/42',
      'airtrust.total_slides': 42,
      'airtrust.viewed_slides': [1, 42],
    });
    expect(evaluateScormClosureReadiness({ ...base(), cmiJson })
      .eligible_for_server_verification).toBe(false);
  });
  it('one score normalizer prevents raw 90/min 60/max 100 from being misread as a passing 90%', () => {
    const normalized = resolveLmsCompletionScorePct({
      scoreRaw: 90, scoreMin: 60, scoreMax: 100, scoreScaled: null,
    });
    expect(normalized).toBe(75);
    const verdict = evaluateScormClosureReadiness({ ...base(), scorePct: normalized });
    expect(verdict.code).toBe('SCORE_BELOW_MASTERY');
    expect(verdict.eligible_for_server_verification).toBe(false);
  });

  it('preserves score zero and never interprets malformed score ranges as success', () => {
    expect(resolveLmsCompletionScorePct({
      scoreRaw: 0, scoreMin: 0, scoreMax: 100, scoreScaled: null,
    })).toBe(0);
    expect(resolveLmsCompletionScorePct({
      scoreRaw: 95, scoreMin: 100, scoreMax: 100, scoreScaled: null,
    })).toBeNull();
    expect(resolveLmsCompletionScorePct({
      scoreRaw: null, scoreMin: null, scoreMax: null, scoreScaled: null,
    })).toBeNull();
  });

  it('legacy course with unset policy defaults to SCORED and still checks mastery', () => {
    expect(evaluateScormClosureReadiness({ ...base(), policy: null })
      .eligible_for_server_verification).toBe(true);
    expect(evaluateScormClosureReadiness({ ...base(), policy: null, scorePct: null }).code)
      .toBe('SCORE_MISSING');
  });

});
