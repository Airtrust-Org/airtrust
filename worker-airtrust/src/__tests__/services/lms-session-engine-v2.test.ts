import { describe, expect, it } from 'vitest';
import {
  evaluateTrainingSessionV2,
  type TrainingSessionV2,
} from '../../services/lms-session-engine-v2';

const scorm: TrainingSessionV2 = {
  runtime: 'SCORM_12',
  evidenceProfile: 'STRICT_TRACKED',
  approvedScormConformance: false,
  scopedSessionValid: true,
  enrollmentActive: true,
  courseEditionMatches: true,
  evidencePersisted: true,
  requiredSlides: 42,
  persistedVisitedSlides: Array.from({ length: 42 }, (_, i) => i + 1),
  scormTerminalStatus: 'passed',
  assessmentPolicy: 'SCORED',
  requiredQuestions: 10,
  answeredQuestions: 10,
  scorePercent: 90,
  masteryPercent: 80,
  assessmentPassed: true,
  userFinalizationRequested: true,
  enrollmentCompleted: false,
  qualificationRequired: true,
  qualificationCommitted: false,
  certificateRequired: true,
  certificateVerified: false,
};

const decide = (patch: Partial<TrainingSessionV2> = {}) =>
  evaluateTrainingSessionV2({ ...scorm, ...patch });

describe('AirTrust Session Engine V2 — immutable evidence contract', () => {
  it('case 911: 42/42 and 100% presentation NEVER closes unanswered 0/10 assessment', () => {
    expect(decide({ answeredQuestions: 0 })).toMatchObject({
      state: 'CONTINUE', code: 'ASSESSMENT_PENDING', readyForAtomicCommit: false,
    });
  });

  it('won’t close with only a high position marker, missing distinct viewed slides', () => {
    expect(decide({ persistedVisitedSlides: [42] })).toMatchObject({
      code: 'SLIDE_EVIDENCE_MISSING', readyForAtomicCommit: false,
    });
  });

  it('rejects duplicate 1..42 with same length but missing last distinct slide', () => {
    expect(decide({ persistedVisitedSlides: [...Array.from({ length: 41 }, (_, i) => i + 1), 41] }).code)
      .toBe('SLIDE_EVIDENCE_MISSING');
  });

  it('fails closed if server did not persist evidence after iframe acknowledgement', () => {
    expect(decide({ evidencePersisted: false }).code).toBe('EVIDENCE_NOT_PERSISTED');
  });

  it('accepts a fully satisfied strict tracked course for atomic finalization only', () => {
    expect(decide()).toEqual({
      state: 'READY_TO_FINALIZE', code: 'SERVER_CONFIRMATION_REQUIRED',
      readyForAtomicCommit: true, completionRecorded: false,
    });
  });

  it('a missing learner confirmation never certifies a perfect score', () => {
    expect(decide({ userFinalizationRequested: false }).code).toBe('USER_FINALIZATION_REQUIRED');
  });

  it('does not consider an early SCORM passed event without an authored finished assessment', () => {
    expect(decide({ answeredQuestions: 2, scorePercent: 100 }).code).toBe('ASSESSMENT_PENDING');
  });

  it('never accepts a strict tracked SCORED package lacking a declared quiz requirement', () => {
    expect(decide({ requiredQuestions: null, answeredQuestions: null, scorePercent: 100 }).code)
      .toBe('ASSESSMENT_PENDING');
  });

  it('an approved standard SCORM package can use terminal result without proprietary quiz counters', () => {
    expect(decide({
      evidenceProfile: 'SCORM_CONFORMANT', approvedScormConformance: true,
      requiredSlides: null, persistedVisitedSlides: null,
      requiredQuestions: null, answeredQuestions: null,
      scormTerminalStatus: 'passed', scorePercent: 90,
    })).toMatchObject({ state: 'READY_TO_FINALIZE' });
  });

  it('score below approved mastery is not a passing completion', () => {
    expect(decide({ scorePercent: 70 }).code).toBe('SCORE_BELOW_MASTERY');
  });

  it('a browser claiming failed and passed together does not bypass failure precedence', () => {
    expect(decide({ assessmentPassed: false, scormTerminalStatus: 'passed' }).code)
      .toBe('ASSESSMENT_FAILED');
  });

  it('standard SCORM 1.2 requires governed conformance; absence of airtrust.viewed_slides is legitimate', () => {
    expect(decide({
      evidenceProfile: 'SCORM_CONFORMANT', approvedScormConformance: false,
      requiredSlides: null, persistedVisitedSlides: null,
    }).code).toBe('UNAPPROVED_CONFORMANCE_PROFILE');
    expect(decide({
      evidenceProfile: 'SCORM_CONFORMANT', approvedScormConformance: true,
      requiredSlides: null, persistedVisitedSlides: null,
    })).toMatchObject({
      state: 'READY_TO_FINALIZE', completionRecorded: false,
    });
  });

  it('standard SCORM 2004 requires persisted terminal state, not an inferred last slide', () => {
    expect(decide({
      runtime: 'SCORM_2004', evidenceProfile: 'SCORM_CONFORMANT',
      approvedScormConformance: true,
      persistedVisitedSlides: null, requiredSlides: null,
      scormTerminalStatus: 'unknown',
    }).code).toBe('SCORM_TERMINAL_MISSING');
  });

  it('does not let Native use the SCORM_CONFORMANT profile to avoid native evidence', () => {
    expect(decide({
      runtime: 'NATIVE', evidenceProfile: 'SCORM_CONFORMANT',
      approvedScormConformance: true,
    }).code).toBe('UNAPPROVED_CONFORMANCE_PROFILE');
  });

  it('Native and SCORM share the same finalization authority but distinct evidence adapters', () => {
    expect(decide({
      runtime: 'NATIVE', evidenceProfile: 'STRICT_TRACKED', scormTerminalStatus: null,
    })).toMatchObject({ state: 'READY_TO_FINALIZE', completionRecorded: false });
  });

  it('blocks unauthorized, inactive and changed-edition sessions', () => {
    expect(decide({ scopedSessionValid: false }).code).toBe('SESSION_UNTRUSTED');
    expect(decide({ enrollmentActive: false }).code).toBe('ENROLLMENT_INACTIVE');
    expect(decide({ courseEditionMatches: false }).code).toBe('NEW_EDITION_REQUIRED');
  });

  it('only committed D1 completion is represented as completed; qualification and certificate remain explicit', () => {
    const base = { enrollmentCompleted: true };
    expect(decide(base)).toMatchObject({
      state: 'QUALIFICATION_PENDING', completionRecorded: true,
    });
    expect(decide({ ...base, qualificationCommitted: true })).toMatchObject({
      state: 'CERTIFICATE_PENDING', completionRecorded: true,
    });
    expect(decide({
      ...base, qualificationCommitted: true, certificateVerified: true,
    })).toEqual({
      state: 'COMPLETED', code: 'MATRICULA_CONCLUIDA',
      readyForAtomicCommit: false, completionRecorded: true,
    });
  });

  it('formative SCORM without questions still requires an authored terminal event', () => {
    const base = {
      assessmentPolicy: 'FORMATIVE' as const,
      requiredQuestions: 0, answeredQuestions: 0, scorePercent: null,
      masteryPercent: null, assessmentPassed: null,
    };
    expect(decide({ ...base, scormTerminalStatus: 'incomplete' }).code)
      .toBe('SCORM_TERMINAL_MISSING');
    expect(decide({ ...base, scormTerminalStatus: 'completed' }).state)
      .toBe('READY_TO_FINALIZE');
  });
});
