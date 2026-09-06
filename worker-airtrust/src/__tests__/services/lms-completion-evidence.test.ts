import { describe, expect, it } from 'vitest';
import {
  evaluateLmsCompletionEvidence,
  type LmsCompletionEvidenceInput,
} from '../../services/lms-completion-evidence';

function valid(overrides: Partial<LmsCompletionEvidenceInput> = {}): LmsCompletionEvidenceInput {
  return {
    source: 'scorm',
    enrollmentActive: true,
    courseAvailable: true,
    packageBound: true,
    assetSessionValid: true,
    progressRowPresent: true,
    progressPct: 100,
    lessonStatus: 'passed',
    completionStatus: 'completed',
    successStatus: 'passed',
    explicitCompletion: true,
    explicitFailure: false,
    scoreRaw: 80,
    scoreMin: 0,
    scoreMax: 100,
    masteryScore: 70,
    requiresAssessment: true,
    generatesQualification: true,
    informativeCourse: false,
    contentEvidenceValidated: true,
    ...overrides,
  };
}

describe('LMS completion evidence decision table', () => {
  it('1. rejects student passed with zero progress', () => {
    expect(evaluateLmsCompletionEvidence(valid({ progressPct: 0 })).code).toBe(
      'PROGRESS_EVIDENCE_MISSING',
    );
  });

  it('2. rejects completion without registered progress evidence', () => {
    expect(evaluateLmsCompletionEvidence(valid({ progressRowPresent: false })).code).toBe(
      'PROGRESS_EVIDENCE_MISSING',
    );
  });

  it('3. rejects passed below mastery', () => {
    expect(evaluateLmsCompletionEvidence(valid({ scoreRaw: 69 })).code).toBe('SCORE_BELOW_MASTERY');
  });

  it('4. gives failed precedence over completed', () => {
    const decision = evaluateLmsCompletionEvidence(
      valid({ lessonStatus: 'failed', completionStatus: 'completed', explicitFailure: true }),
    );
    expect(decision).toMatchObject({ code: 'EXPLICIT_FAILURE', failurePrecedence: true });
  });

  it('5. gives failed precedence over passed', () => {
    const decision = evaluateLmsCompletionEvidence(
      valid({ lessonStatus: 'passed', successStatus: 'failed', explicitFailure: true }),
    );
    expect(decision).toMatchObject({ code: 'EXPLICIT_FAILURE', failurePrecedence: true });
  });

  it('6. distinguishes absent mastery for assessed courses', () => {
    expect(evaluateLmsCompletionEvidence(valid({ masteryScore: null })).code).toBe(
      'MASTERY_SCORE_MISSING',
    );
  });

  it('7. distinguishes mastery zero and fails closed for assessed qualification courses', () => {
    expect(evaluateLmsCompletionEvidence(valid({ masteryScore: 0 })).code).toBe(
      'MASTERY_SCORE_ZERO_NOT_ALLOWED',
    );
  });

  it('8. treats score zero as a valid score below positive mastery', () => {
    expect(evaluateLmsCompletionEvidence(valid({ scoreRaw: 0 })).code).toBe('SCORE_BELOW_MASTERY');
  });

  it('9. rejects invalid score formats instead of coercing them', () => {
    expect(evaluateLmsCompletionEvidence(valid({ scoreRaw: '' })).code).toBe('SCORE_INVALID');
    expect(evaluateLmsCompletionEvidence(valid({ scoreRaw: Number.NaN })).code).toBe(
      'SCORE_INVALID',
    );
  });

  it('10. accepts a no-assessment informational course with 100% progress', () => {
    expect(
      evaluateLmsCompletionEvidence(
        valid({
          lessonStatus: 'completed',
          successStatus: null,
          scoreRaw: null,
          scoreMin: null,
          scoreMax: null,
          masteryScore: null,
          requiresAssessment: false,
          generatesQualification: false,
          informativeCourse: true,
          packageBound: true,
        }),
      ),
    ).toMatchObject({ accepted: true, code: 'COMPLETION_ACCEPTED' });
  });

  it('11. accepts a qualification course only with valid mastery and score', () => {
    expect(evaluateLmsCompletionEvidence(valid())).toMatchObject({
      accepted: true,
      masteryScore: 70,
      scorePct: 80,
    });
  });

  it('12. accepts explicit finalization of a non-qualifying informational course', () => {
    const input = valid({
      source: 'manual',
      assetSessionValid: false,
      progressRowPresent: false,
      progressPct: 0,
      lessonStatus: null,
      completionStatus: null,
      successStatus: null,
      explicitCompletion: false,
      scoreRaw: null,
      scoreMin: null,
      scoreMax: null,
      masteryScore: null,
      requiresAssessment: false,
      generatesQualification: false,
      informativeCourse: true,
    });
    expect(evaluateLmsCompletionEvidence(input)).toMatchObject({
      accepted: true,
      code: 'COMPLETION_ACCEPTED',
    });
  });

  it('rejects a qualifying PDF finalization backed only by client progress', () => {
    expect(
      evaluateLmsCompletionEvidence(
        valid({
          source: 'manual',
          assetSessionValid: false,
          lessonStatus: null,
          completionStatus: null,
          successStatus: null,
          requiresAssessment: false,
          contentEvidenceValidated: false,
        }),
      ),
    ).toMatchObject({ accepted: false, code: 'CONTENT_EVIDENCE_REQUIRED' });
  });

  it('13. is deterministic and idempotent for repeated commits', () => {
    const input = valid();
    expect(evaluateLmsCompletionEvidence(input)).toEqual(evaluateLmsCompletionEvidence(input));
  });

  it('14. makes concurrent candidates resolve to the same canonical decision', () => {
    const candidates = [
      evaluateLmsCompletionEvidence(valid()),
      evaluateLmsCompletionEvidence(valid()),
    ];
    expect(candidates.every((candidate) => candidate.accepted)).toBe(true);
    expect(new Set(candidates.map((candidate) => candidate.code))).toEqual(
      new Set(['COMPLETION_ACCEPTED']),
    );
  });

  it('15. accepts authorized administrative completion with a governed reason', () => {
    expect(
      evaluateLmsCompletionEvidence(
        valid({
          source: 'administrative',
          assetSessionValid: false,
          administrativeAuthorized: true,
          administrativeReason: 'Correção administrativa com evidência anexada',
        }),
      ),
    ).toMatchObject({ accepted: true, code: 'COMPLETION_ACCEPTED' });
  });

  it('16. rejects student self-declared passed without independent completion evidence', () => {
    expect(
      evaluateLmsCompletionEvidence(
        valid({ completionStatus: null, explicitCompletion: false, progressPct: 30 }),
      ).code,
    ).toBe('COMPLETION_EVIDENCE_INSUFFICIENT');
  });

  it('17. rejects inactive/out-of-scope enrollment evidence', () => {
    expect(evaluateLmsCompletionEvidence(valid({ enrollmentActive: false })).code).toBe(
      'ENROLLMENT_INACTIVE',
    );
  });

  it('18. rejects an invalid asset session', () => {
    expect(evaluateLmsCompletionEvidence(valid({ assetSessionValid: false })).code).toBe(
      'ASSET_SESSION_INVALID',
    );
  });

  it('19. rejects a canceled enrollment', () => {
    expect(evaluateLmsCompletionEvidence(valid({ enrollmentActive: false })).accepted).toBe(false);
  });

  it('rejects missing package binding for interactive content', () => {
    expect(evaluateLmsCompletionEvidence(valid({ packageBound: false })).code).toBe(
      'PACKAGE_BINDING_INVALID',
    );
  });

  it('rejects administrative completion without a meaningful reason', () => {
    expect(
      evaluateLmsCompletionEvidence(
        valid({
          source: 'administrative',
          administrativeAuthorized: true,
          administrativeReason: 'curto',
        }),
      ).code,
    ).toBe('ADMINISTRATIVE_REASON_REQUIRED');
  });
});
